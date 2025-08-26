import React, { useEffect, useMemo, useState, useRef } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { motion } from "framer-motion";

// Firebase (선택: 부부 공동 사용용 실시간 동기화)
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, getDocs, query, orderBy, limit, enableIndexedDbPersistence } from "firebase/firestore";

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
const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

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
    entries: {}, // { [catId]: [{date, amount, memo, type:'expense'|'income'}] }
  });

  // ===== Firebase 상태 & 초기화 =====
  const [fb, setFb] = useState({ app: null, auth: null, db: null, user: null, cfgFromEnv: false });
  const [houseId, setHouseId] = useState(() => localStorage.getItem("budget-houseId") || "");
  const [houseInput, setHouseInput] = useState(houseId);
  const [selectedDate, setSelectedDate] = useState(todayStr());

  // 스냅샷 상태
  const [snapshots, setSnapshots] = useState([]); // {id, model, createdAt}
  const [restoreId, setRestoreId] = useState("");
  const [isSavingSnap, setIsSavingSnap] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
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
      enableIndexedDbPersistence(db).catch(() => {}); // await 사용 X
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

  // 최근 스냅샷 10개 로드
  useEffect(() => {
    const load = async () => {
      if (!fb.db || !fb.user || !houseId) return setSnapshots([]);
      const col = collection(fb.db, "budgets", houseId, "months", monthKey, "snapshots");
      const qs = await getDocs(query(col, orderBy("createdAt", "desc"), limit(10)));
      setSnapshots(qs.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    load();
  }, [fb.db, fb.user, houseId]);

  // 스냅샷 저장/복원
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
      console.warn(e);
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
    } catch (e) {
      alert("복원 중 오류가 발생했습니다.");
    } finally {
      setIsRestoring(false);
    }
  };

  // ========= 파생값 =========
  const totalAllocated = useMemo(
    () => model.categories.reduce((sum, c) => sum + (Number(c.amount) || 0), 0),
    [model.categories]
  );
  const remainAmount = Math.max(0, Number(model.salary || 0) - totalAllocated);

  const overallPie = useMemo(() => {
    const data = model.categories.map((c) => ({ name: c.name, value: c.amount }));
    data.push({ name: "남는 돈", value: remainAmount });
    return data;
  }, [model.categories, remainAmount]);

  // 달력용: 일자별 수입/지출 합계(이번 달)
  const calendarData = useMemo(() => {
    const map = {}; // { 'YYYY-MM-DD': {income, expense} }
    const monthPrefix = monthKey + "-";
    Object.entries(model.entries || {}).forEach(([catId, arr]) => {
      (arr || []).forEach((e) => {
        if (!e?.date || !e.date.startsWith(monthPrefix)) return;
        const t = (e.type || "expense") === "income" ? "income" : "expense";
        if (!map[e.date]) map[e.date] = { income: 0, expense: 0 };
        map[e.date][t] += Number(e.amount) || 0;
      });
    });
    return map;
  }, [model.entries]);

  // ========= 액션 =========
  const updateSalary = (v) => setModel((m) => ({ ...m, salary: Number(v) || 0 }));
  const updateCategory = (id, field, value) =>
    setModel((m) => ({
      ...m,
      categories: m.categories.map((c) => (c.id === id ? { ...c, [field]: field === "amount" ? Number(value) || 0 : value } : c)),
    }));

  const addEntry = (catId, entry) =>
    setModel((m) => ({
      ...m,
      entries: { ...m.entries, [catId]: [...(m.entries?.[catId] || []), entry] },
    }));

  const removeEntry = (catId, idx) =>
    setModel((m) => ({
      ...m,
      entries: { ...m.entries, [catId]: (m.entries?.[catId] || []).filter((_, i) => i !== idx) },
    }));

  const resetAll = () => {
    if (!confirm("8월 데이터를 모두 초기화할까요?")) return;
    setModel({ month: monthKey, salary: 0, categories: DEFAULT_CATEGORIES, entries: {} });
    setSelectedDate(todayStr());
  };

  // 로컬 백업/복원
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
      try { setModel(JSON.parse(reader.result)); }
      catch { alert("JSON 파일을 읽는 중 오류가 발생했습니다."); }
    };
    reader.readAsText(file);
  };

  // 최근 기록 20개 (삭제 버튼 제공)
  const recentEntries = useMemo(() => {
    const list = [];
    Object.entries(model.entries || {}).forEach(([catId, arr]) => {
      const catName = model.categories.find((c) => c.id === catId)?.name || catId;
      (arr || []).forEach((e, idx) => list.push({ ...e, catId, idx, catName }));
    });
    return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  }, [model.entries, model.categories]);

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold">8월 가계부 · 월급 분배 & 자동이체 트래커</h1>
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
            <input value={houseInput} onChange={(e) => setHouseInput(e.target.value)} placeholder="가계부 코드(예: FAMILY2025)" className="px-3 py-1.5 rounded-xl border w-40" />
            <button onClick={connectHouse} className="px-3 py-1.5 rounded-xl text-sm bg-indigo-600 text-white hover:bg-indigo-700">연결</button>

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

            <label className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200 cursor-pointer">
              복원
              <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])} />
            </label>
            <button onClick={exportJSON} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">백업</button>
            <button onClick={resetAll} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">초기화</button>
          </div>
        </div>

        {/* ==== 달력 (메인 탭 위) ==== */}
        <div className="mx-auto max-w-7xl px-4 pb-4">
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="text-base font-semibold mb-2">이 달 수입·지출 달력</h2>
            <MonthCalendar ym={monthKey} data={calendarData} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
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
                        <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[idx % COLORS.length] }} />
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

        {/* === 3) 기록 입력(전역) === */}
        <section className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-lg font-semibold mb-3">3) 지출·수입 기록 추가</h2>
          <GlobalEntryForm
            categories={model.categories}
            selectedDate={selectedDate}
            onAdd={(catId, entry) => addEntry(catId, entry)}
          />

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1">날짜</th>
                  <th className="py-1">통장</th>
                  <th className="py-1">유형</th>
                  <th className="py-1">금액</th>
                  <th className="py-1">메모</th>
                  <th className="py-1">삭제</th>
                </tr>
              </thead>
              <tbody>
                {recentEntries.map((e, i) => (
                  <tr key={`${e.catId}-${e.idx}`} className="border-t">
                    <td className="py-1">{e.date}</td>
                    <td className="py-1">{e.catName}</td>
                    <td className="py-1">{(e.type || 'expense') === 'income' ? '수입' : '지출'}</td>
                    <td className="py-1">{KRW(e.amount)}</td>
                    <td className="py-1">{e.memo}</td>
                    <td className="py-1">
                      <button onClick={() => removeEntry(e.catId, e.idx)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">삭제</button>
                    </td>
                  </tr>
                ))}
                {recentEntries.length === 0 && (
                  <tr><td colSpan={6} className="py-2 text-center text-slate-400">아직 기록이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ================= 달력 컴포넌트 ================= */
function MonthCalendar({ ym, data, selectedDate, onSelectDate }) {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  const first = new Date(y, m - 1, 1);
  const firstWeekday = first.getDay(); // 0=일
  const daysInMonth = new Date(y, m, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = todayStr();

  return (
    <div>
      <div className="mb-2 text-sm text-slate-500">{y}년 {m}월</div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {["일","월","화","수","목","금","토"].map((w) => (
          <div key={w} className="py-1 text-center font-medium text-slate-500">{w}</div>
        ))}
        {cells.map((d, idx) => {
          if (d === null) return <div key={idx} className="h-20 rounded-lg bg-slate-50/70" />;
          const dd = String(d).padStart(2, "0");
          const iso = `${ym}-${dd}`;
          const sum = data[iso] || { income: 0, expense: 0 };
          const isToday = iso === today;
          const isSelected = iso === selectedDate;

          return (
            <button
              key={idx}
              onClick={() => onSelectDate?.(iso)}
              className={`h-20 p-2 rounded-lg text-left bg-white border ${isSelected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200"} ${isToday ? "shadow-inner" : ""}`}
              title={`${iso} 수입 ${sum.income.toLocaleString("ko-KR")}원 / 지출 ${sum.expense.toLocaleString("ko-KR")}원`}
            >
              <div className="text-[11px] font-semibold">{d}</div>
              <div className="mt-1 leading-4">
                <div className="text-emerald-600">+{sum.income ? sum.income.toLocaleString("ko-KR") : 0}</div>
                <div className="text-rose-600">-{sum.expense ? sum.expense.toLocaleString("ko-KR") : 0}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-slate-500">※ 달력의 날짜를 누르면 아래 기록 입력폼의 날짜에 자동 적용됩니다.</div>
    </div>
  );
}

/* ================= 전역 기록 입력 폼 ================= */
function GlobalEntryForm({ categories, selectedDate, onAdd }) {
  const [catId, setCatId] = useState(categories[0]?.id || "");
  const [date, setDate] = useState(selectedDate || todayStr());
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState(0);
  const [memo, setMemo] = useState("");

  useEffect(() => { setDate(selectedDate || todayStr()); }, [selectedDate]);
  useEffect(() => { if (!catId && categories[0]) setCatId(categories[0].id); }, [categories]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const a = Number(amount) || 0;
    if (!catId) return alert("통장을 선택하세요.");
    if (a <= 0) return alert("금액을 입력하세요.");
    onAdd(catId, { date, amount: a, memo: memo.trim(), type });
    setAmount(0); setMemo("");
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-6 gap-2">
      <select className="px-3 py-2 rounded-xl border" value={catId} onChange={(e) => setCatId(e.target.value)}>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input type="date" className="px-3 py-2 rounded-xl border" value={date} onChange={(e) => setDate(e.target.value)} />
      <select className="px-3 py-2 rounded-xl border" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="expense">지출</option>
        <option value="income">수입</option>
      </select>
      <input type="number" inputMode="numeric" className="px-3 py-2 rounded-xl border" placeholder="금액" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input type="text" className="px-3 py-2 rounded-xl border" placeholder="메모(선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
      <button className="px-3 py-2 rounded-xl text-white bg-indigo-600 hover:bg-indigo-700">추가</button>
    </form>
  );
}
