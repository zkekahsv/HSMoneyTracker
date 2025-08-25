import React, { useEffect, useMemo, useRef, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { motion } from "framer-motion";

// ---- Month key & local storage key ----
const monthKey = new Date().toISOString().slice(0, 7);
const STORAGE_KEY = `budget-${monthKey}`;

// ---- Firebase (환경변수 우선 + 수동 연동 설정 fallback) ----
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore, doc, setDoc, onSnapshot,
  collection, addDoc, getDocs, query, orderBy, limit, enableIndexedDbPersistence
} from "firebase/firestore";

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

// ---- 기본 카테고리 (group: 'salary' | 'savings') ----
const DEFAULT_CATEGORIES = [
  // 월급통장(자동이체/카드)
  { id: "living",   name: "생활비 통장", amount: 0, group: "salary" },
  { id: "academy",  name: "학원비 통장", amount: 0, group: "salary" },
  { id: "food",     name: "밥값 통장",   amount: 0, group: "salary" },
  { id: "phone",    name: "통신비 통장", amount: 0, group: "salary" },
  { id: "allowance",name: "용돈 통장",   amount: 0, group: "salary" },
  // 시우·선우 저축 통장
  { id: "siu",      name: "시우 통장",   amount: 0, group: "savings" },
  { id: "seonwoo",  name: "선우 통장",   amount: 0, group: "savings" },
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

export default function App() {
  const [model, setModel] = usePersistedState({
    month: monthKey,
    salary: 0,
    categories: DEFAULT_CATEGORIES,
    entries: {}, // { [catId]: [{date, amount, memo, type:'expense'|'income'}] }
  });

  // 탭: 'salary' = 월급통장, 'savings' = 시우·선우 통장
  const [activeTab, setActiveTab] = useState("salary");

  // Firebase state
  const [fb, setFb] = useState({ app: null, auth: null, db: null, user: null, cfgFromEnv: false });
  const [houseId, setHouseId] = useState(() => localStorage.getItem("budget-houseId") || "");
  const [houseInput, setHouseInput] = useState(houseId);
  const remoteApplyingRef = useRef(false);
  const saveTimerRef = useRef(null);

  // 스냅샷 UI
  const [snapshots, setSnapshots] = useState([]);   // {id, model, createdAt}
  const [restoreId, setRestoreId] = useState("");
  const [isSavingSnap, setIsSavingSnap] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Firebase init
  useEffect(() => {
    if (fb.app) return;
    const cfg = getFirebaseConfig();
    if (!cfg) return;
    try {
      const app = initializeApp(cfg);
      const auth = getAuth(app);
      const db = getFirestore(app);
      const hasEnv = Object.values(envConfig).every((v) => typeof v === "string" && v.length > 0);
      setFb({ app, auth, db, user: auth.currentUser, cfgFromEnv: hasEnv });
      enableIndexedDbPersistence(db).catch(() => {});
      onAuthStateChanged(auth, (user) => setFb((p) => ({ ...p, user })));
    } catch (e) {
      console.warn("Firebase init failed:", e);
    }
  }, [fb.app]);

  // 기존 저장본에 group이 없는 카테고리 보정(과거 데이터 호환)
  useEffect(() => {
    if (!model?.categories?.length) return;
    if (model.categories.some((c) => !c.group)) {
      setModel((m) => ({ ...m, categories: m.categories.map((c) => ({ ...c, group: c.group || "salary" })) }));
    }
  }, []); // 최초 1회

  const setFirebaseConfigFromPrompt = () => {
    const raw = prompt("Firebase 설정 JSON을 붙여넣으세요 (apiKey, authDomain, projectId, appId 등)");
    if (!raw) return;
    try {
      JSON.parse(raw);
      localStorage.setItem("budget-fbconfig", raw);
      alert("저장됨! 새로고침 후 적용됩니다.");
    } catch {
      alert("JSON이 올바르지 않습니다.");
    }
  };

  const signInGoogle = async () => {
    if (!fb.auth) return alert("먼저 환경변수 또는 연동 설정을 완료하세요.");
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

  // 실시간 수신
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

  // 디바운스 저장
  useEffect(() => {
    if (!fb.db || !fb.user || !houseId) return;
    if (remoteApplyingRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const ref = doc(fb.db, "budgets", houseId, "months", monthKey);
      await setDoc(ref, { model, updatedAt: new Date().toISOString() }, { merge: true });
    }, 400);
    return () => clearTimeout(saveTimerRef.current);
  }, [model, fb.db, fb.user, houseId]);

  // 스냅샷 목록
  useEffect(() => {
    const load = async () => {
      if (!fb.db || !fb.user || !houseId) return setSnapshots([]);
      const col = collection(fb.db, "budgets", houseId, "months", monthKey, "snapshots");
      const qs = await getDocs(query(col, orderBy("createdAt", "desc"), limit(10)));
      setSnapshots(qs.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    load();
  }, [fb.db, fb.user, houseId]);

  const saveSnapshot = async () => {
    if (!fb.db || !fb.user || !houseId) return alert("먼저 로그인/연결을 해주세요.");
    setIsSavingSnap(true);
    try {
      const col = collection(fb.db, "budgets", houseId, "months", monthKey, "snapshots");
      await addDoc(col, { model, createdAt: new Date().toISOString() });
      const qs = await getDocs(query(col, orderBy("createdAt", "desc"), limit(10)));
      setSnapshots(qs.docs.map((d) => ({ id: d.id, ...d.data() })));
      alert("스냅샷 저장 완료!");
    } catch (e) {
      alert("스냅샷 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSavingSnap(false);
    }
  };
  const restoreFromSnapshot = async () => {
    if (!restoreId) return alert("복원할 스냅샷을 선택하세요.");
    const snap = snapshots.find((s) => s.id === restoreId);
    if (!snap) return alert("스냅샷을 찾지 못했습니다.");
    setIsRestoring(true);
    try {
      setModel(snap.model);
      alert("스냅샷 복원 완료!");
    } finally {
      setIsRestoring(false);
    }
  };

  // ---- 파생 값(탭별) ----
  // 그룹 채워진 배열(보정)
  const categories = useMemo(
    () => (model.categories || []).map((c) => ({ ...c, group: c.group || "salary" })),
    [model.categories]
  );
  const catsSalary  = useMemo(() => categories.filter((c) => c.group === "salary"),  [categories]);
  const catsSavings = useMemo(() => categories.filter((c) => c.group === "savings"), [categories]);

  // 월급 탭 합계/남은돈
  const totalAllocatedSalary = useMemo(
    () => catsSalary.reduce((sum, c) => sum + (Number(c.amount) || 0), 0),
    [catsSalary]
  );
  const remainSalary = Math.max(0, Number(model.salary || 0) - totalAllocatedSalary);

  // 카테고리별 지출/수입 합계
  const expenseByCat = useMemo(() => {
    const out = {}; for (const c of categories) out[c.id] = 0;
    Object.entries(model.entries || {}).forEach(([catId, arr]) => {
      out[catId] = (arr || [])
        .filter((e) => (e.type || "expense") === "expense")
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    });
    return out;
  }, [model.entries, categories]);
  const incomeByCat = useMemo(() => {
    const out = {}; for (const c of categories) out[c.id] = 0;
    Object.entries(model.entries || {}).forEach(([catId, arr]) => {
      out[catId] = (arr || [])
        .filter((e) => (e.type || "expense") === "income")
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    });
    return out;
  }, [model.entries, categories]);

  // 원형그래프 데이터
  const overallPieSalary = useMemo(() => {
    const data = catsSalary.map((c) => ({ name: c.name, value: c.amount }));
    data.push({ name: "남는 돈", value: remainSalary });
    return data;
  }, [catsSalary, remainSalary]);

  const overallPieSavings = useMemo(
    () => catsSavings.map((c) => ({ name: c.name, value: c.amount })),
    [catsSavings]
  );

  // Handlers
  const updateSalary = (v) => setModel((m) => ({ ...m, salary: Number(v) || 0 }));
  const updateCategory = (id, field, value) =>
    setModel((m) => ({
      ...m,
      categories: m.categories.map((c) =>
        c.id === id ? { ...c, [field]: field === "amount" ? Number(value) || 0 : value } : c
      ),
    }));
  const addEntry = (catId, entry) =>
    setModel((m) => ({ ...m, entries: { ...m.entries, [catId]: [...(m.entries?.[catId] || []), entry] } }));
  const removeEntry = (catId, idx) =>
    setModel((m) => ({ ...m, entries: { ...m.entries, [catId]: (m.entries?.[catId] || []).filter((_, i) => i !== idx) } }));

  const addCategoryRow = () => {
    const name = prompt("새 통장 이름을 입력하세요", activeTab === "salary" ? "새 자동이체 통장" : "새 저축 통장");
    if (!name) return;
    const id = `cat_${Date.now().toString(36)}`;
    setModel((m) => ({
      ...m,
      categories: [...m.categories, { id, name, amount: 0, group: activeTab }],
    }));
  };
  const deleteCategoryRow = (id) => {
    const hasEntries = (model.entries?.[id] || []).length > 0;
    if (!confirm(hasEntries ? "이 통장에 기록이 있습니다. 삭제할까요?" : "삭제할까요?")) return;
    setModel((m) => ({
      ...m,
      categories: m.categories.filter((c) => c.id !== id),
      entries: Object.fromEntries(Object.entries(m.entries || {}).filter(([k]) => k !== id)),
    }));
  };

  const resetAll = () => {
    if (!confirm("이 달 데이터를 모두 초기화할까요?")) return;
    setModel({ month: monthKey, salary: 0, categories: DEFAULT_CATEGORIES, entries: {} });
  };

  // 파일 백업/복원
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${STORAGE_KEY}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try { const data = JSON.parse(reader.result); setModel(data); }
      catch { alert("JSON 파일을 읽는 중 오류가 발생했습니다."); }
    };
    reader.readAsText(file);
  };

  // 현재 탭에 표시할 카테고리
  const catsToShow = activeTab === "salary" ? catsSalary : catsSavings;

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-bold">8월 가계부</h1>

            <div className="flex flex-wrap items-center gap-2">
              {fb.cfgFromEnv ? (
                <span className="px-3 py-1.5 rounded-xl text-xs bg-emerald-100 text-emerald-700">환경변수 연동</span>
              ) : (
                <button onClick={setFirebaseConfigFromPrompt} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">연동 설정</button>
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
              <button onClick={connectHouse} className="px-3 py-1.5 rounded-xl text-sm bg-indigo-600 text-white hover:bg-indigo-700">연결</button>

              {/* 스냅샷 */}
              <button onClick={saveSnapshot} disabled={isSavingSnap} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200 disabled:opacity-50">스냅샷 저장</button>
              <select value={restoreId} onChange={(e) => setRestoreId(e.target.value)} className="px-3 py-1.5 rounded-xl border">
                <option value="">스냅샷 선택(최근 10개)</option>
                {snapshots.map((s) => {
                  const t = new Date(s.createdAt);
                  const label = `${t.getMonth()+1}/${t.getDate()} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
                  return <option key={s.id} value={s.id}>{label}</option>;
                })}
              </select>
              <button onClick={restoreFromSnapshot} disabled={!restoreId || isRestoring} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200 disabled:opacity-50">스냅샷 복원</button>

              {/* 로컬 백업/복원/초기화 */}
              <label className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200 cursor-pointer">
                복원
                <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])} />
              </label>
              <button onClick={exportJSON} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">백업</button>
              <button onClick={resetAll} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">초기화</button>
            </div>
          </div>

          {/* 탭 바 */}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setActiveTab("salary")}
              className={`px-4 py-2 rounded-xl text-sm ${activeTab==='salary' ? 'bg-indigo-600 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}
            >
              월급통장
            </button>
            <button
              onClick={() => setActiveTab("savings")}
              className={`px-4 py-2 rounded-xl text-sm ${activeTab==='savings' ? 'bg-indigo-600 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}
            >
              시우·선우 통장(저축)
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-8">
        {/* 월급 탭: 월급 입력 & 분배 + 원형그래프 */}
        {activeTab === "salary" && (
          <section className="grid lg:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow p-5">
              <h2 className="text-lg font-semibold mb-4">1) 월급 입력</h2>
              <div className="flex items-center gap-3">
                <span className="text-slate-600">월급</span>
                <input
                  type="number" inputMode="numeric"
                  className="w-full sm:w-64 px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="예: 3,000,000"
                  value={model.salary}
                  onChange={(e) => updateSalary(e.target.value)}
                />
                <span className="text-sm text-slate-500">{KRW(model.salary)}</span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button onClick={addCategoryRow} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">카테고리 추가</button>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-2">통장 이름</th>
                      <th className="py-2">배정금액(원)</th>
                      <th className="py-2">비율(%)</th>
                      <th className="py-2">삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catsSalary.map((c, idx) => {
                      const percent = Number(model.salary || 0) > 0 ? Math.round(((c.amount || 0) / Number(model.salary || 0)) * 100) : 0;
                      return (
                        <tr key={c.id} className="border-t">
                          <td className="py-2 flex items-center gap-2">
                            <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[idx % COLORS.length] }} />
                            <input type="text" className="px-2 py-1 rounded-lg border w-32" value={c.name} onChange={(e) => updateCategory(c.id, "name", e.target.value)} />
                          </td>
                          <td className="py-2">
                            <input type="number" className="w-40 px-2 py-1 rounded-lg border" value={c.amount ?? 0} onChange={(e) => updateCategory(c.id, "amount", e.target.value)} />
                            <span className="ml-2 text-slate-500">{KRW(c.amount ?? 0)}</span>
                          </td>
                          <td className="py-2">{percent}%</td>
                          <td className="py-2">
                            <button onClick={() => deleteCategoryRow(c.id)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">삭제</button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t">
                      <td className="py-2 flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[5] }} />남는 돈</td>
                      <td className="py-2">{KRW(remainSalary)}</td>
                      <td className="py-2 text-slate-500">{Number(model.salary || 0) > 0 ? Math.round((remainSalary / Number(model.salary || 0)) * 100) : 0}%</td>
                      <td className="py-2"></td>
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
                    <Pie data={overallPieSalary} dataKey="value" nameKey="name" outerRadius={100} label>
                      {overallPieSalary.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => KRW(Number(val))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </section>
        )}

        {/* 저축 탭: 저축 카테고리 관리 + 원형그래프(합계) */}
        {activeTab === "savings" && (
          <section className="grid lg:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow p-5">
              <h2 className="text-lg font-semibold mb-4">시우·선우 저축 통장 관리</h2>
              <div className="mb-3 text-sm text-slate-500">배정금액은 “목표/현재 잔액”처럼 사용하셔도 됩니다.</div>
              <div className="flex items-center gap-2">
                <button onClick={addCategoryRow} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">저축 통장 추가</button>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-2">통장 이름</th>
                      <th className="py-2">배정금액(목표/잔액)</th>
                      <th className="py-2">삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catsSavings.map((c, idx) => (
                      <tr key={c.id} className="border-t">
                        <td className="py-2 flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[idx % COLORS.length] }} />
                          <input type="text" className="px-2 py-1 rounded-lg border w-40" value={c.name} onChange={(e) => updateCategory(c.id, "name", e.target.value)} />
                        </td>
                        <td className="py-2">
                          <input type="number" className="w-40 px-2 py-1 rounded-lg border" value={c.amount ?? 0} onChange={(e) => updateCategory(c.id, "amount", e.target.value)} />
                          <span className="ml-2 text-slate-500">{KRW(c.amount ?? 0)}</span>
                        </td>
                        <td className="py-2">
                          <button onClick={() => deleteCategoryRow(c.id)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">삭제</button>
                        </td>
                      </tr>
                    ))}
                    {catsSavings.length === 0 && (
                      <tr><td colSpan={3} className="py-3 text-center text-slate-400">저축 통장을 추가해보세요.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow p-5">
              <h2 className="text-lg font-semibold mb-4">저축 통장 합계 원형그래프</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={overallPieSavings} dataKey="value" nameKey="name" outerRadius={100} label>
                      {overallPieSavings.map((entry, index) => (
                        <Cell key={`cell-s-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => KRW(Number(val))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-sm text-slate-500">저축 통장들의 배정금액 합계를 보여줍니다.</p>
            </motion.div>
          </section>
        )}

        {/* 통장별 상세(공통) */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            {activeTab === "salary" ? "자동이체 통장별 상세 (지출/수입)" : "저축 통장별 상세 (입·출금 기록)"}
          </h2>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
            {catsToShow.map((c, idx) => {
              const expense = (model.entries?.[c.id] || []).filter(e => (e.type || 'expense') === 'expense').reduce((s,e)=>s+(Number(e.amount)||0),0);
              const income  = (model.entries?.[c.id] || []).filter(e => (e.type || 'expense') === 'income' ).reduce((s,e)=>s+(Number(e.amount)||0),0);
              const used = Math.max(0, expense - income);
              const remain = Math.max(0, (c.amount || 0) - used);
              const over = (expense - income) - (c.amount || 0);
              const catPie = [
                { name: "사용", value: Math.max(0, used) },
                { name: "남음", value: Math.max(0, remain) },
              ];
              return (
                <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className="bg-white rounded-2xl shadow p-4 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[idx % COLORS.length] }} />
                      <h3 className="font-semibold">{c.name}</h3>
                    </div>
                    <div className="text-sm text-slate-500">
                      {activeTab === "salary" ? "배정: " : "목표/잔액: "}
                      <b>{KRW(c.amount || 0)}</b>
                      {activeTab === "salary" && over > 0 && <span className="ml-2 text-red-600">(초과 {KRW(over)})</span>}
                    </div>
                  </div>

                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={catPie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70}>
                          {catPie.map((entry, i) => (
                            <Cell key={`cat-${c.id}-${i}`} fill={i === 0 ? COLORS[idx % COLORS.length] : "#e2e8f0"} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val) => KRW(Number(val))} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    <div className="bg-slate-50 rounded-xl p-2 text-center">지출 <div className="font-semibold">{KRW(expense)}</div></div>
                    <div className="bg-slate-50 rounded-xl p-2 text-center">수입 <div className="font-semibold">{KRW(income)}</div></div>
                    <div className="rounded-xl p-2 text-center bg-slate-50">남음 <div className="font-semibold">{KRW(remain)}</div></div>
                  </div>

                  <EntryForm onAdd={(entry) => addEntry(c.id, entry)} disabled={false} />

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="py-1">날짜</th>
                          <th className="py-1">유형</th>
                          <th className="py-1">금액</th>
                          <th className="py-1">메모</th>
                          <th className="py-1">삭제</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(model.entries?.[c.id] || []).map((e, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-1">{e.date}</td>
                            <td className="py-1">{(e.type || 'expense') === 'income' ? '수입' : '지출'}</td>
                            <td className="py-1">{KRW(e.amount)}</td>
                            <td className="py-1">{e.memo}</td>
                            <td className="py-1">
                              <button onClick={() => removeEntry(c.id, i)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">삭제</button>
                            </td>
                          </tr>
                        ))}
                        {(model.entries?.[c.id] || []).length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-2 text-center text-slate-400">아직 기록이 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* 요약(탭별) */}
        <section className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-lg font-semibold mb-2">요약</h2>
          <Summary
            mode={activeTab}
            allocations={catsToShow.map(c => ({id: c.id, amount: c.amount}))}
            expenseByCat={expenseByCat}
            incomeByCat={incomeByCat}
            salary={Number(model.salary || 0)}
          />
        </section>
      </main>
    </div>
  );
}

// 입력 폼
function EntryForm({ onAdd, disabled }) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const defaultDate = `${yyyy}-${mm}-${dd}`;

  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState(0);
  const [memo, setMemo] = useState("");
  const [type, setType] = useState("expense");

  const handleSubmit = (e) => {
    e.preventDefault();
    const a = Number(amount) || 0;
    if (a <= 0) return alert("금액을 입력하세요");
    onAdd({ date, amount: a, memo: memo.trim(), type });
    setAmount(0); setMemo("");
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-1 sm:grid-cols-5 gap-2">
      <input type="date" className="px-3 py-2 rounded-xl border" value={date} onChange={(e) => setDate(e.target.value)} />
      <select className="px-3 py-2 rounded-xl border" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="expense">지출</option>
        <option value="income">수입</option>
      </select>
      <input type="number" inputMode="numeric" className="px-3 py-2 rounded-xl border" placeholder="금액" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input type="text" className="px-3 py-2 rounded-xl border" placeholder="메모(선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
      <button disabled={disabled} className={`px-3 py-2 rounded-xl text-white ${disabled ? "bg-slate-300" : "bg-indigo-600 hover:bg-indigo-700"}`}>추가</button>
    </form>
  );
}

// 요약 카드(탭별 표시 다르게)
function Summary({ mode, allocations, expenseByCat, incomeByCat, salary }) {
  const totalUsed = allocations.reduce(
    (s, a) => s + Math.max(0, (expenseByCat[a.id] || 0) - (incomeByCat?.[a.id] || 0)), 0
  );
  const totalRemainPerCats = allocations.reduce(
    (s, a) => s + Math.max(0, (Number(a.amount) || 0) - Math.max(0, (expenseByCat[a.id] || 0) - (incomeByCat?.[a.id] || 0))), 0
  );
  const totalAllocated = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const KRW = (v) => (isNaN(v) ? "-" : v.toLocaleString("ko-KR") + "원");

  return (
    <div className="grid sm:grid-cols-3 gap-3 text-sm">
      {mode === "salary" ? (
        <>
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-slate-500">총 월급</div>
            <div className="text-xl font-bold">{KRW(salary)}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-slate-500">총 사용(지출-수입)</div>
            <div className="text-xl font-bold">{KRW(totalUsed)}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-slate-500">남은 금액(월급-사용)</div>
            <div className="text-xl font-bold">{KRW(Math.max(0, salary - totalUsed))}</div>
          </div>
        </>
      ) : (
        <>
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-slate-500">저축 배정 합계</div>
            <div className="text-xl font-bold">{KRW(totalAllocated)}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-slate-500">총 사용(지출-수입)</div>
            <div className="text-xl font-bold">{KRW(totalUsed)}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-slate-500">합계 잔액(배정-사용)</div>
            <div className="text-xl font-bold">{KRW(totalRemainPerCats)}</div>
          </div>
        </>
      )}
    </div>
  );
}
