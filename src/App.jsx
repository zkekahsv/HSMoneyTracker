import React, { useEffect, useMemo, useState, useRef } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { motion } from "framer-motion";

// Firebase (선택: 부부 공동 사용용 실시간 동기화)
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";

// --- Vercel 환경변수 우선 사용 (없으면 로컬 연동 설정으로 대체) ---
const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};
function getFirebaseConfig() {
  const hasEnv = Object.values(envConfig).every((v) => typeof v === "string" && v.length > 0);
  if (hasEnv) return { ...envConfig };
  try {
    const raw = localStorage.getItem("budget-fbconfig");
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

const monthKey = new Date().toISOString().slice(0, 7);

const STORAGE_KEY = `budget-${monthKey}`;

const DEFAULT_CATEGORIES = [
  { id: "living", name: "생활비 통장", amount: 0 },
  { id: "academy", name: "학원비 통장", amount: 0 },
  { id: "food", name: "밥값 통장", amount: 0 },
  { id: "phone", name: "통신비 통장", amount: 0 },
  { id: "allowance", name: "용돈 통장", amount: 0 },
];

const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];

const KRW = (v) => (isNaN(v) ? "-" : v.toLocaleString("ko-KR") + "원");

function usePersistedState(initial) {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);
  return [state, setState];
}

export default function AugustBudget() {
  const [model, setModel] = usePersistedState({
    month: monthKey,
    salary: 0,
    categories: DEFAULT_CATEGORIES,
    entries: {},
  });

  // ===== Firebase 상태 & 초기화 =====
  const [fb, setFb] = useState({ app: null, auth: null, db: null, user: null, cfgFromEnv: false });
  const [houseId, setHouseId] = useState(() => localStorage.getItem("budget-houseId") || "");
  const [houseInput, setHouseInput] = useState(houseId);
  const remoteApplyingRef = useRef(false);
  const saveTimerRef = useRef(null);

  // Vercel 환경변수 → 없으면 로컬 저장된 JSON으로 초기화
  useEffect(() => {
    if (fb.app) return;
    const cfg = getFirebaseConfig();
    if (!cfg) return; // 아직 설정 안 됨
    try {
      const app = initializeApp(cfg);
      const auth = getAuth(app);
      const db = getFirestore(app);
      const hasEnv = Object.values(envConfig).every((v) => typeof v === "string" && v.length > 0);
      setFb({ app, auth, db, user: auth.currentUser, cfgFromEnv: hasEnv });
      onAuthStateChanged(auth, (user) => setFb((p) => ({ ...p, user })));
    } catch (e) {
      console.warn("Firebase init failed:", e);
    }
  }, [fb.app]);

  const setFirebaseConfigFromPrompt = () => {
    const raw = prompt("Firebase 설정 JSON을 붙여넣으세요 (apiKey, authDomain, projectId, appId 등)");
    if (!raw) return;
    try {
      JSON.parse(raw); // 유효성 체크
      localStorage.setItem("budget-fbconfig", raw);
      alert("저장됨! 새로고침 후 적용됩니다.");
    } catch {
      alert("JSON이 올바르지 않습니다.");
    }
  };

  const signInGoogle = async () => {
    if (!fb.auth) return alert("먼저 '연동 설정'으로 Firebase 설정을 저장하세요.");
    const provider = new GoogleAuthProvider();
    await signInWithPopup(fb.auth, provider);
  };
  const signOutAll = async () => { if (fb.auth) await signOut(fb.auth); };
  const connectHouse = () => {
    if (!houseInput) return;
    const id = houseInput.trim();
    setHouseId(id);
    localStorage.setItem("budget-houseId", id);
  };

  // 원격 문서 구독 (실시간 수신)
  useEffect(() => {
    if (!fb.db || !fb.user || !houseId) return;
    const ref = doc(fb.db, "budgets", houseId, "months", monthKey);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      if (data && data.model) {
        remoteApplyingRef.current = true;
        setModel(data.model);
        remoteApplyingRef.current = false;
      }
    });
    return () => unsub();
  }, [fb.db, fb.user, houseId]);

  // 변경사항을 원격에 저장 (디바운스)
  useEffect(() => {
    if (!fb.db || !fb.user || !houseId) return;
    if (remoteApplyingRef.current) return; // 원격 적용 중 저장 방지
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const ref = doc(fb.db, "budgets", houseId, "months", monthKey);
      await setDoc(ref, { model: model, updatedAt: new Date().toISOString() }, { merge: true });
    }, 400);
    return () => clearTimeout(saveTimerRef.current);
  }, [model, fb.db, fb.user, houseId]);

  const totalAllocated = useMemo(
    () => model.categories.reduce((sum, c) => sum + (Number(c.amount) || 0), 0),
    [model.categories]
  );
  const remainAmount = Math.max(0, Number(model.salary || 0) - totalAllocated);

  const spentByCat = useMemo(() => {
    const out = {};
    for (const c of model.categories) out[c.id] = 0;
    Object.entries(model.entries || {}).forEach(([catId, arr]) => {
      out[catId] = (arr || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    });
    return out;
  }, [model.entries, model.categories]);

  const overallPie = useMemo(() => {
    const data = model.categories.map((c) => ({ name: c.name, value: c.amount }));
    data.push({ name: "남는 돈", value: remainAmount });
    return data;
  }, [model.categories, remainAmount]);

  const updateSalary = (v) => setModel((m) => ({ ...m, salary: Number(v) || 0 }));
  const updateCategory = (id, field, value) =>
    setModel((m) => ({
      ...m,
      categories: m.categories.map((c) =>
        c.id === id ? { ...c, [field]: field === "amount" ? Number(value) || 0 : value } : c
      ),
    }));

  const addEntry = (catId, entry) =>
    setModel((m) => ({
      ...m,
      entries: {
        ...m.entries,
        [catId]: [...(m.entries?.[catId] || []), entry],
      },
    }));

  const removeEntry = (catId, idx) =>
    setModel((m) => ({
      ...m,
      entries: {
        ...m.entries,
        [catId]: (m.entries?.[catId] || []).filter((_, i) => i !== idx),
      },
    }));

  const resetAll = () => {
    if (!confirm("8월 데이터를 모두 초기화할까요?")) return;
    setModel({ month: monthKey, salary: 0, categories: DEFAULT_CATEGORIES, entries: {} });
  };

  // ▼ 백업/복원 기능
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${STORAGE_KEY}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        setModel(data);
      } catch (e) {
        alert("JSON 파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold">8월 가계부 · 월급 분배 & 자동이체 트래커</h1>
          <div className="flex flex-wrap items-center gap-2">
            {/* 환경변수 사용시 배지 표시, 없으면 수동 연동 버튼 */}
            {fb.cfgFromEnv ? (
              <span className="px-3 py-1.5 rounded-xl text-xs bg-emerald-100 text-emerald-700">환경변수 연동</span>
            ) : (
              <button onClick={setFirebaseConfigFromPrompt} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">
                연동 설정
              </button>
            )}
            {fb.user ? (
              <>
                <span className="text-sm text-slate-600">로그인됨</span>
                <button onClick={signOutAll} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">로그아웃</button>
              </>
            ) : (
              <button onClick={signInGoogle} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">Google 로그인</button>
            )}
            <input
              value={houseInput}
              onChange={(e) => setHouseInput(e.target.value)}
              placeholder="가계부 코드(예: FAMILY2025)"
              className="px-3 py-1.5 rounded-xl border w-40"
            />
            <button onClick={connectHouse} className="px-3 py-1.5 rounded-xl text-sm bg-indigo-600 text-white hover:bg-indigo-700">
              연결
            </button>
            {/* 로컬 백업/복원/초기화 */}
            <label className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200 cursor-pointer">
              복원
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])}
              />
            </label>
            <button onClick={exportJSON} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">
              백업
            </button>
            <button onClick={resetAll} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">
              초기화
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-8">
        <section className="grid lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-semibold mb-4">1) 월급 입력</h2>
            <div className="flex items-center gap-3">
              <span className="text-slate-600">월급</span>
              <input
                type="number"
                inputMode="numeric"
                className="w-full sm:w-64 px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="예: 3,000,000"
                value={model.salary}
                onChange={(e) => updateSalary(e.target.value)}
              />
              <span className="text-sm text-slate-500">{KRW(model.salary)}</span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">통장 이름</th>
                    <th className="py-2">배정금액</th>
                  </tr>
                </thead>
                <tbody>
                  {model.categories.map((c, idx) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-2 flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[idx] }} />
                        <input
                          type="text"
                          className="px-2 py-1 rounded-lg border w-32"
                          value={c.name}
                          onChange={(e) => updateCategory(c.id, "name", e.target.value)}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          className="w-32 px-2 py-1 rounded-lg border"
                          value={c.amount}
                          onChange={(e) => updateCategory(c.id, "amount", e.target.value)}
                        />
                        <span className="ml-2 text-slate-500">{KRW(c.amount)}</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t">
                    <td className="py-2 flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[5] }} />남는 돈
                    </td>
                    <td className="py-2">{KRW(remainAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-semibold mb-4">2) 월급 통장 원형그래프</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={overallPie} dataKey="value" nameKey="name" outerRadius={100} label>
                    {overallPie.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => KRW(Number(val))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-sm text-slate-500">월급에서 직접 입력한 배정금액과 남는 금액을 표시합니다.</p>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
