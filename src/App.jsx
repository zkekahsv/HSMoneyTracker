import React, { useEffect, useMemo, useRef, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { motion } from "framer-motion";

// ==== Firebase (공동 사용 동기화: 선택) ====
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore, doc, setDoc, onSnapshot,
  collection, addDoc, getDocs, query, orderBy, limit, enableIndexedDbPersistence
} from "firebase/firestore";

// ==== 환경 변수 → 없으면 로컬에 저장된 설정(JSON) 사용 ====
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
  try { const raw = localStorage.getItem("budget-fbconfig"); if (raw) return JSON.parse(raw); } catch {}
  return null;
}

// ==== 유틸 ====
const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];
const KRW = (v) => (isNaN(v) ? "-" : v.toLocaleString("ko-KR") + "원");
const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const thisYM = () => new Date().toISOString().slice(0, 7);
const shiftYM = (ym, delta) => {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  const d = new Date(y, m - 1 + delta, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
};

// ==== 기본 데이터 ====
const DEFAULT_GROUPS = [
  { id: "salary",  name: "월급통장", type: "salary",  pool: 0 },
  { id: "savings", name: "저축통장", type: "generic", pool: 0 },
];
const DEFAULT_CATEGORIES = [
  { id: "living",    name: "생활비 통장", amount: 0, groupId: "salary" },
  { id: "academy",   name: "학원비 통장", amount: 0, groupId: "salary" },
  { id: "food",      name: "밥값 통장",   amount: 0, groupId: "salary" },
  { id: "phone",     name: "통신비 통장", amount: 0, groupId: "salary" },
  { id: "allowance", name: "용돈 통장",   amount: 0, groupId: "salary" },
  { id: "siu",       name: "시우 통장",   amount: 0, groupId: "savings" },
  { id: "seonwoo",   name: "선우 통장",   amount: 0, groupId: "savings" },
];

// ==== 월 모델 훅 ====
function initialMonthlyModel(ym) {
  return {
    month: ym,
    groups: DEFAULT_GROUPS.map((g) => ({ ...g })),
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    entries: {},
  };
}
function useMonthlyModel(ym) {
  const STORAGE_KEY = `budget-${ym}`;
  const [model, setModel] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : initialMonthlyModel(ym);
    } catch {
      return initialMonthlyModel(ym);
    }
  });
  useEffect(() => {
    const key = `budget-${ym}`;
    try {
      const raw = localStorage.getItem(key);
      setModel(raw ? JSON.parse(raw) : initialMonthlyModel(ym));
    } catch {
      setModel(initialMonthlyModel(ym));
    }
  }, [ym]);
  useEffect(() => {
    try { localStorage.setItem(`budget-${ym}`, JSON.stringify(model)); } catch {}
  }, [model, ym]);
  return [model, setModel];
}

export default function App() {
  // ===== 월 선택 (이전/다음) =====
  const [ym, setYM] = useState(thisYM());
  const [selectedDate, setSelectedDate] = useState(() => `${ym}-01`);
  useEffect(() => { setSelectedDate(`${ym}-01`); }, [ym]);

  // ===== 월별 모델 =====
  const [model, setModel] = useMonthlyModel(ym);

  // ===== Firebase 상태 & 초기화 =====
  const [fb, setFb] = useState({ app: null, auth: null, db: null, user: null, cfgFromEnv: false });
  const [houseId, setHouseId] = useState(() => localStorage.getItem("budget-houseId") || "");
  const [houseInput, setHouseInput] = useState(houseId);
  const remoteApplyingRef = useRef(false);
  const saveTimerRef = useRef(null);

  // 메인 탭: 'calendar' | 그룹 id
  const [mainTab, setMainTab] = useState("calendar");

  // 날짜 클릭 모달
  const [dayOpen, setDayOpen] = useState(false);

  // 스냅샷 상태
  const [snapshots, setSnapshots] = useState([]);
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

  // 실시간 수신
  useEffect(() => {
    if (!fb.db || !fb.user || !houseId) return;
    const ref = doc(fb.db, "budgets", houseId, "months", ym);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data();
      if (data && data.model) {
        remoteApplyingRef.current = true;
        setModel(data.model);
        remoteApplyingRef.current = false;
      }
    });
    return () => unsub();
  }, [fb.db, fb.user, houseId, ym, setModel]);

  // 디바운스 저장
  useEffect(() => {
    if (!fb.db || !fb.user || !houseId) return;
    if (remoteApplyingRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const ref = doc(fb.db, "budgets", houseId, "months", ym);
      await setDoc(ref, { model, updatedAt: new Date().toISOString() }, { merge: true });
    }, 400);
    return () => clearTimeout(saveTimerRef.current);
  }, [model, fb.db, fb.user, houseId, ym]);

  // 스냅샷 목록
  useEffect(() => {
    const load = async () => {
      if (!fb.db || !fb.user || !houseId) return setSnapshots([]);
      const col = collection(fb.db, "budgets", houseId, "months", ym, "snapshots");
      const qs = await getDocs(query(col, orderBy("createdAt", "desc"), limit(10)));
      setSnapshots(qs.docs.map((d) => ({ id: d.id, ...d.data() })));
    };
    load();
  }, [fb.db, fb.user, houseId, ym]);

  // ==== 편의 액션 ====
  const setFirebaseConfigFromPrompt = () => {
    const raw = prompt("Firebase 설정 JSON을 붙여넣으세요 (apiKey, authDomain, projectId, appId 등)");
    if (!raw) return;
    try { JSON.parse(raw); localStorage.setItem("budget-fbconfig", raw); alert("저장됨! 새로고침 후 적용됩니다."); }
    catch { alert("JSON이 올바르지 않습니다."); }
  };
  const signInGoogle = async () => {
    if (!fb.auth) return alert("먼저 연동 설정을 해주세요.");
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

  const saveSnapshot = async () => {
    if (!fb.db || !fb.user || !houseId) return alert("먼저 로그인/연결을 해주세요.");
    setIsSavingSnap(true);
    try {
      const col = collection(fb.db, "budgets", houseId, "months", ym, "snapshots");
      await addDoc(col, { model, createdAt: new Date().toISOString() });
      const qs = await getDocs(query(col, orderBy("createdAt", "desc"), limit(10)));
      setSnapshots(qs.docs.map((d) => ({ id: d.id, ...d.data() })));
      alert("스냅샷 저장 완료!");
    } catch {
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
    try { setModel(snap.model); alert("스냅샷 복원 완료!"); }
    finally { setIsRestoring(false); }
  };

  // ==== 그룹/카테고리/기록 ====
  const groups = model.groups || [];
  const categories = (model.categories || []).map((c) => ({ ...c, groupId: c.groupId || c.group || "salary" }));

  useEffect(() => {
    const ids = new Set(groups.map((g) => g.id));
    if (mainTab !== "calendar" && !ids.has(mainTab)) setMainTab("calendar");
  }, [groups, mainTab]);

  const updateGroup = (id, patch) =>
    setModel((m) => ({ ...m, groups: m.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  const addGroup = () => {
    const name = prompt("새 메인 탭 이름 (예: 비상금통장)"); if (!name) return;
    const isSalary = confirm("이 그룹을 '월급 그룹'으로 설정할까요?");
    const id = `grp_${Date.now().toString(36)}`;
    setModel((m) => ({ ...m, groups: [...m.groups, { id, name, type: isSalary ? "salary" : "generic", pool: 0 }] }));
    setMainTab(id);
  };
  const renameGroup = (id) => {
    const g = groups.find((x) => x.id === id);
    const name = prompt("그룹 이름 변경", g?.name || "");
    if (!name) return;
    updateGroup(id, { name });
  };
  const toggleGroupType = (id) => {
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    updateGroup(id, { type: g.type === "salary" ? "generic" : "salary" });
  };
  const deleteGroup = (id) => {
    const hasCats = categories.some((c) => c.groupId === id);
    if (!confirm(hasCats ? "이 그룹의 통장/기록까지 모두 삭제할까요?" : "그룹을 삭제할까요?")) return;
    setModel((m) => ({
      ...m,
      groups: m.groups.filter((g) => g.id !== id),
      categories: m.categories.filter((c) => c.groupId !== id),
      entries: Object.fromEntries(
        Object.entries(m.entries || {}).filter(([catId]) => {
          const cat = (m.categories || []).find((c) => c.id === catId);
          return cat && cat.groupId !== id;
        })
      ),
    }));
    setMainTab("calendar");
  };

  const addCategoryRow = (groupId) => {
    const name = prompt("새 통장 이름", "새 통장"); if (!name) return;
    const id = `cat_${Date.now().toString(36)}`;
    setModel((m) => ({ ...m, categories: [...m.categories, { id, name, amount: 0, groupId }] }));
  };
  const updateCategory = (id, field, value) =>
    setModel((m) => ({ ...m, categories: m.categories.map((c) => (c.id === id ? { ...c, [field]: field === "amount" ? Number(value) || 0 : value } : c)) }));
  const deleteCategoryRow = (id) => {
    const hasEntries = (model.entries?.[id] || []).length > 0;
    if (!confirm(hasEntries ? "이 통장에 기록이 있습니다. 삭제할까요?" : "삭제할까요?")) return;
    setModel((m) => ({
      ...m,
      categories: m.categories.filter((c) => c.id !== id),
      entries: Object.fromEntries(Object.entries(m.entries || {}).filter(([k]) => k !== id)),
    }));
  };

  const addEntry = (catId, entry) =>
    setModel((m) => ({ ...m, entries: { ...m.entries, [catId]: [...(m.entries?.[catId] || []), entry] } }));
  const removeEntry = (catId, idx) =>
    setModel((m) => ({ ...m, entries: { ...m.entries, [catId]: (m.entries?.[catId] || []).filter((_, i) => i !== idx) } }));

  const resetAll = () => {
    if (!confirm(`${ym} 데이터를 모두 초기화할까요?`)) return;
    setModel(initialMonthlyModel(ym));
    setSelectedDate(`${ym}-01`);
    setMainTab("calendar");
  };

  // ==== 파생값 ====
  const activeGroup = groups.find((g) => g.id === mainTab);
  const catsOfActive = categories.filter((c) => c.groupId === activeGroup?.id);
  const sumAllocated = useMemo(() => catsOfActive.reduce((s, c) => s + (Number(c.amount) || 0), 0), [catsOfActive]);
  const remainPool = Math.max(0, Number(activeGroup?.pool || 0) - sumAllocated);

  // 달력 합계
  const calendarData = useMemo(() => {
    const map = {}; const prefix = ym + "-";
    Object.entries(model.entries || {}).forEach(([_, arr]) => {
      (arr || []).forEach((e) => {
        if (!e?.date || !e.date.startsWith(prefix)) return;
        const t = (e.type || "expense") === "income" ? "income" : "expense";
        if (!map[e.date]) map[e.date] = { income: 0, expense: 0 };
        map[e.date][t] += Number(e.amount) || 0;
      });
    });
    return map;
  }, [model.entries, ym]);
  const monthTotals = useMemo(() => {
    let income = 0, expense = 0;
    Object.values(calendarData).forEach((v) => { income += v.income || 0; expense += v.expense || 0; });
    return { income, expense, net: income - expense };
  }, [calendarData]);

  const overallPie = useMemo(() => {
    if (!activeGroup) return [];
    const data = catsOfActive.map((c) => ({ name: c.name, value: c.amount }));
    data.push({ name: "남는 돈", value: remainPool });
    return data;
  }, [catsOfActive, remainPool, activeGroup]);

  // 최근 기록 20개
  const recentEntries = useMemo(() => {
    const list = [];
    Object.entries(model.entries || {}).forEach(([catId, arr]) => {
      const name = categories.find((c) => c.id === catId)?.name || catId;
      (arr || []).forEach((e, idx) => list.push({ ...e, catId, idx, catName: name }));
    });
    return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  }, [model.entries, categories]);

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800">
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold">{ym} 가계부</h1>
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
                  const label = `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
                  return <option key={s.id} value={s.id}>{label}</option>;
                })}
              </select>
              <button onClick={restoreFromSnapshot} disabled={!restoreId || isRestoring} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200 disabled:opacity-50">스냅샷 복원</button>

              <button onClick={resetAll} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">초기화</button>
            </div>
          </div>

          {/* 월 이동 스위처 */}
          <div className="flex items-center gap-2">
            <button onClick={() => setYM(shiftYM(ym, -1))} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200">◀ 이전달</button>
            <div className="px-4 py-1.5 rounded-xl bg-white border text-slate-700">{ym}</div>
            <button onClick={() => setYM(shiftYM(ym, 1))} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200">다음달 ▶</button>
          </div>

          {/* 메인 탭: 달력 + 그룹들 + +추가 */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setMainTab("calendar")}
              className={`px-4 py-2 rounded-xl text-sm ${mainTab === "calendar" ? "bg-indigo-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`}
            >
              달력
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setMainTab(g.id)}
                className={`px-4 py-2 rounded-xl text-sm ${mainTab === g.id ? "bg-indigo-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`}
                title={g.type === "salary" ? "월급 그룹" : "일반 그룹"}
              >
                {g.name}
              </button>
            ))}
            <button onClick={addGroup} className="px-3 py-2 rounded-xl text-sm bg-emerald-100 text-emerald-800 hover:bg-emerald-200">+ 그룹 추가</button>
            {activeGroup && mainTab !== "calendar" && (
              <>
                <button onClick={() => renameGroup(activeGroup.id)} className="px-3 py-2 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">이름변경</button>
                <button onClick={() => toggleGroupType(activeGroup.id)} className="px-3 py-2 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">
                  {activeGroup.type === "salary" ? "일반 그룹으로 변경" : "월급 그룹으로 지정"}
                </button>
                <button onClick={() => deleteGroup(activeGroup.id)} className="px-3 py-2 rounded-xl text-sm bg-red-100 text-red-700 hover:bg-red-200">그룹 삭제</button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ===== 메인 컨텐츠 ===== */}
      {mainTab === "calendar" ? (
        <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
          <section className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-semibold mb-2">달력 · {ym} 수입/지출 한눈에</h2>
            <MonthCalendar
              ym={ym}
              data={calendarData}
              selectedDate={selectedDate}
              onSelectDate={(iso) => { setSelectedDate(iso); setDayOpen(true); }}
            />
            <div className="mt-4 grid sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-50 rounded-xl p-3"><div className="text-slate-500">이 달 총 수입</div><div className="text-xl font-bold text-emerald-700">{KRW(monthTotals.income)}</div></div>
              <div className="bg-slate-50 rounded-xl p-3"><div className="text-slate-500">이 달 총 지출</div><div className="text-xl font-bold text-rose-700">{KRW(monthTotals.expense)}</div></div>
              <div className="bg-slate-50 rounded-xl p-3"><div className="text-slate-500">순이동(수입-지출)</div><div className="text-xl font-bold">{KRW(monthTotals.net)}</div></div>
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">{selectedDate} 상세</h3>
              <GlobalEntryForm categories={categories} selectedDate={selectedDate} onAdd={(catId, entry) => addEntry(catId, entry)} />
            </div>
            <DateEntriesTable date={selectedDate} categories={categories} entries={model.entries} onRemove={removeEntry} />
          </section>

          <section className="bg-white rounded-2xl shadow p-5">
            <h3 className="text-base font-semibold mb-2">최근 기록 (상위 20개)</h3>
            <RecentTable rows={recentEntries} onRemove={(e) => removeEntry(e.catId, e.idx)} />
          </section>
        </main>
      ) : (
        <main className="mx-auto max-w-7xl px-4 py-6 space-y-8">
          {/* 그룹 총액/분배 */}
          <section className="grid lg:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow p-5">
              <h2 className="text-lg font-semibold mb-4">1) {activeGroup?.type === "salary" ? "월급 입력" : "그룹 총액(목표/잔액)"}</h2>
              <div className="flex items-center gap-3">
                <span className="text-slate-600">{activeGroup?.type === "salary" ? "월급" : "총액"}</span>
                <input
                  type="number" inputMode="numeric"
                  className="w-full sm:w-64 px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="예: 3,000,000"
                  value={activeGroup?.pool || 0}
                  onChange={(e) => updateGroup(activeGroup.id, { pool: Number(e.target.value) || 0 })}
                />
                <span className="text-sm text-slate-500">{KRW(activeGroup?.pool || 0)}</span>
              </div>
              <div className="mt-4">
                <button onClick={() => addCategoryRow(activeGroup.id)} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">카테고리 추가</button>
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
                    {catsOfActive.map((c, idx) => {
                      const percent = Number(activeGroup?.pool || 0) > 0 ? Math.round(((c.amount || 0) / Number(activeGroup.pool || 0)) * 100) : 0;
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
                      <td className="py-2 flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[5] }} />
                        남는 돈
                      </td>
                      <td className="py-2">{KRW(remainPool)}</td>
                      <td className="py-2 text-slate-500">
                        {Number(activeGroup?.pool || 0) > 0 ? Math.round((remainPool / Number(activeGroup.pool || 0)) * 100) : 0}%
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow p-5">
              <h2 className="text-lg font-semibold mb-4">2) {activeGroup?.name} 원형그래프</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={overallPie} dataKey="value" nameKey="name" outerRadius={100} label>
                      {overallPie.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                    </Pie>
                    <Tooltip formatter={(val) => KRW(Number(val))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </section>

          {/* 상세 카드 */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">3) {activeGroup?.name} 통장별 상세 (지출/수입 기록)</h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
              {catsOfActive.map((c, idx) => {
                const expense = (model.entries?.[c.id] || []).filter(e => (e.type || "expense") === "expense").reduce((s, e) => s + (Number(e.amount) || 0), 0);
                const income  = (model.entries?.[c.id] || []).filter(e => (e.type || "expense") === "income" ).reduce((s, e) => s + (Number(e.amount) || 0), 0);
                const used = Math.max(0, expense - income);
                const remain = Math.max(0, (c.amount || 0) - used);
                const catPie = [{ name: "사용", value: Math.max(0, used) }, { name: "남음", value: Math.max(0, remain) }];
                return (
                  <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className="bg-white rounded-2xl shadow p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[idx % COLORS.length] }} />
                        <h3 className="font-semibold">{c.name}</h3>
                      </div>
                      <div className="text-sm text-slate-500">배정: <b>{KRW(c.amount || 0)}</b></div>
                    </div>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={catPie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70}>
                            {catPie.map((_, i) => (<Cell key={`cat-${c.id}-${i}`} fill={i === 0 ? COLORS[idx % COLORS.length] : "#e2e8f0"} />))}
                          </Pie>
                          <Tooltip formatter={(val) => KRW(Number(val))} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div className="bg-slate-50 rounded-xl p-2 text-center">지출 <div className="font-semibold">{KRW(expense)}</div></div>
                      <div className="bg-slate-50 rounded-xl p-2 text-center">수입 <div className="font-semibold">{KRW(income)}</div></div>
                      <div className="bg-slate-50 rounded-xl p-2 text-center">남음 <div className="font-semibold">{KRW(remain)}</div></div>
                    </div>
                    <EntryForm onAdd={(entry) => addEntry(c.id, entry)} />
                    <CategoryEntriesTable catId={c.id} entries={model.entries?.[c.id] || []} onRemove={(i) => removeEntry(c.id, i)} />
                  </motion.div>
                );
              })}
            </div>
          </section>
        </main>
      )}

      {/* 날짜 상세 모달 */}
      <DayDetailModal
        open={dayOpen}
        onClose={() => setDayOpen(false)}
        date={selectedDate}
        categories={categories}
        entries={model.entries}
        onRemove={removeEntry}
      />
    </div>
  );
}

/* ===== 달력 컴포넌트 ===== */
function MonthCalendar({ ym, data, selectedDate, onSelectDate }) {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  const first = new Date(y, m - 1, 1);
  const firstWeekday = first.getDay();
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
        {["일","월","화","수","목","금","토"].map((w) => (<div key={w} className="py-1 text-center font-medium text-slate-500">{w}</div>))}
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
      <div className="mt-2 text-xs text-slate-500">※ 날짜를 누르면 아래 폼/상세에 반영됩니다.</div>
    </div>
  );
}

/* ===== 전역 입력 폼 (달력 탭) ===== */
function GlobalEntryForm({ categories, selectedDate, onAdd }) {
  const [catId, setCatId] = useState(categories[0]?.id || "");
  const [date, setDate] = useState(selectedDate || todayStr());
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState(0);
  const [memo, setMemo] = useState("");
  useEffect(() => { setDate(selectedDate || todayStr()); }, [selectedDate]);
  useEffect(() => { if (!catId && categories[0]) setCatId(categories[0].id); }, [categories]);
  const submit = (e) => {
    e.preventDefault();
    const a = Number(amount) || 0;
    if (!catId) return alert("통장을 선택하세요.");
    if (a <= 0) return alert("금액을 입력하세요.");
    onAdd(catId, { date, amount: a, memo: memo.trim(), type });
    setAmount(0); setMemo("");
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-6 gap-2">
      <select className="px-3 py-2 rounded-xl border" value={catId} onChange={(e) => setCatId(e.target.value)}>
        {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
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

/* ===== 카테고리 내부 입력 폼 + 테이블 ===== */
function EntryForm({ onAdd }) {
  const d = new Date(); const yyyy = d.getFullYear(); const mm = String(d.getMonth()+1).padStart(2,"0"); const dd = String(d.getDate()).padStart(2,"0");
  const defaultDate = `${yyyy}-${mm}-${dd}`;
  const [date, setDate] = useState(defaultDate);
  const [amount, setAmount] = useState(0);
  const [memo, setMemo] = useState("");
  const [type, setType] = useState("expense");
  const submit = (e) => {
    e.preventDefault();
    const a = Number(amount) || 0;
    if (a <= 0) return alert("금액을 입력하세요");
    onAdd({ date, amount: a, memo: memo.trim(), type });
    setAmount(0); setMemo("");
  };
  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-1 sm:grid-cols-5 gap-2">
      <input type="date" className="px-3 py-2 rounded-xl border" value={date} onChange={(e) => setDate(e.target.value)} />
      <select className="px-3 py-2 rounded-xl border" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="expense">지출</option><option value="income">수입</option>
      </select>
      <input type="number" inputMode="numeric" className="px-3 py-2 rounded-xl border" placeholder="금액" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input type="text" className="px-3 py-2 rounded-xl border" placeholder="메모(선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
      <button className="px-3 py-2 rounded-xl text-white bg-indigo-600 hover:bg-indigo-700">추가</button>
    </form>
  );
}
function CategoryEntriesTable({ catId, entries, onRemove }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">날짜</th><th className="py-1">유형</th><th className="py-1">금액</th><th className="py-1">메모</th><th className="py-1">삭제</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} className="border-t">
              <td className="py-1">{e.date}</td>
              <td className="py-1">{(e.type || "expense") === "income" ? "수입" : "지출"}</td>
              <td className="py-1">{KRW(e.amount)}</td>
              <td className="py-1">{e.memo}</td>
              <td className="py-1"><button onClick={() => onRemove(i)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">삭제</button></td>
            </tr>
          ))}
          {entries.length === 0 && (<tr><td colSpan={5} className="py-2 text-center text-slate-400">아직 기록이 없습니다.</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}
function DateEntriesTable({ date, categories, entries, onRemove }) {
  const rows = [];
  Object.entries(entries || {}).forEach(([catId, arr]) => {
    const name = categories.find((c) => c.id === catId)?.name || catId;
    (arr || []).forEach((e, idx) => { if (e.date === date) rows.push({ ...e, catName: name, idx, catId }); });
  });
  if (rows.length === 0) return <div className="text-center text-slate-400">이 날짜의 기록이 없습니다.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">통장</th><th className="py-1">유형</th><th className="py-1">금액</th><th className="py-1">메모</th><th className="py-1">삭제</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={`${e.catId}-${e.idx}`} className="border-t">
              <td className="py-1">{e.catName}</td>
              <td className="py-1">{(e.type || "expense") === "income" ? "수입" : "지출"}</td>
              <td className="py-1">{KRW(e.amount)}</td>
              <td className="py-1">{e.memo}</td>
              <td className="py-1"><button onClick={() => onRemove(e.catId, e.idx)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">삭제</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ===== 최근 기록 테이블 ===== */
function RecentTable({ rows, onRemove }) {
  if (!rows || rows.length === 0) {
    return <div className="text-center text-slate-400">최근 기록이 없습니다.</div>;
  }
  return (
    <div className="overflow-x-auto">
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
          {rows.map((r, i) => (
            <tr key={`${r.catId}-${r.idx}-${i}`} className="border-t">
              <td className="py-1">{r.date}</td>
              <td className="py-1">{r.catName}</td>
              <td className="py-1">{(r.type || "expense") === "income" ? "수입" : "지출"}</td>
              <td className="py-1">{KRW(r.amount)}</td>
              <td className="py-1">{r.memo}</td>
              <td className="py-1">
                <button onClick={() => onRemove(r)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ===== 일일 상세 모달: 날짜 클릭 시 어떤 통장에서 무엇이 나갔는지 보기 ===== */
function DayDetailModal({ open, onClose, date, categories, entries, onRemove }) {
  if (!open) return null;

  // 선택 날짜의 항목 모으기
  const rows = [];
  Object.entries(entries || {}).forEach(([catId, arr]) => {
    const catName = categories.find(c => c.id === catId)?.name || catId;
    (arr || []).forEach((e, idx) => {
      if (e.date === date) rows.push({ ...e, catId, idx, catName });
    });
  });

  // 카테고리별 합계(지출/수입)
  const byCat = {};
  rows.forEach(r => {
    if (!byCat[r.catId]) byCat[r.catId] = { name: r.catName, income: 0, expense: 0 };
    const t = (r.type || 'expense') === 'income' ? 'income' : 'expense';
    byCat[r.catId][t] += Number(r.amount) || 0;
  });

  // 총계
  const totals = rows.reduce((acc, r) => {
    const t = (r.type || 'expense') === 'income' ? 'income' : 'expense';
    acc[t] += Number(r.amount) || 0;
    return acc;
  }, { income: 0, expense: 0 });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* 배경 */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* 모달 카드 */}
      <div className="relative z-[101] w-[95vw] max-w-3xl max-h-[80vh] overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-base sm:text-lg font-semibold">{date} 내역</h3>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">닫기</button>
        </div>

        <div className="p-4 space-y-4 overflow-auto">
          {/* 요약 */}
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-slate-500">총 수입</div>
              <div className="text-lg font-bold text-emerald-700">{KRW(totals.income)}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-slate-500">총 지출</div>
              <div className="text-lg font-bold text-rose-700">{KRW(totals.expense)}</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-slate-500">순이동(수입-지출)</div>
              <div className="text-lg font-bold">{KRW(totals.income - totals.expense)}</div>
            </div>
          </div>

          {/* 카테고리별 합계 배지 */}
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.values(byCat).length === 0 ? (
              <span className="text-slate-400">이 날짜의 기록이 없습니다.</span>
            ) : (
              Object.values(byCat).map((g) => (
                <span key={g.name} className="px-3 py-1 rounded-full bg-slate-100">
                  {g.name} · 수입 {KRW(g.income)} / 지출 {KRW(g.expense)}
                </span>
              ))
            )}
          </div>

          {/* 상세 표 */}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1">통장</th>
                    <th className="py-1">유형</th>
                    <th className="py-1">금액</th>
                    <th className="py-1">메모</th>
                    <th className="py-1">삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.catId}-${r.idx}-${i}`} className="border-t">
                      <td className="py-1">{r.catName}</td>
                      <td className="py-1">{(r.type || 'expense') === 'income' ? '수입' : '지출'}</td>
                      <td className="py-1">{KRW(r.amount)}</td>
                      <td className="py-1">{r.memo}</td>
                      <td className="py-1">
                        <button
                          onClick={() => onRemove(r.catId, r.idx)}
                          className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
