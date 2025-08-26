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
const clampDay = (ym, day) => {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  const last = new Date(y, m, 0).getDate();
  const d = Math.max(1, Math.min(last, Number(day) || 1));
  return String(d).padStart(2, "0");
};

// ==== 로컬 백업/복원 유틸 ====
function collectBudgetLocalStorage() {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith("budget-") && /^\d{4}-\d{2}$/.test(key.slice(7))) {
      items.push({ key, value: localStorage.getItem(key) });
    }
    if (key === "budget-fbconfig" || key === "budget-houseId" || key === "budget-autos") {
      items.push({ key, value: localStorage.getItem(key) });
    }
  }
  return items;
}
function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function makeBackupPayload() {
  return { type: "budget-backup", version: 3, exportedAt: new Date().toISOString(), items: collectBudgetLocalStorage() };
}
async function restoreFromBackupObject(obj, { askBeforeOverwrite = true } = {}) {
  if (!obj || obj.type !== "budget-backup" || !Array.isArray(obj.items)) {
    alert("백업 파일 형식이 올바르지 않습니다.");
    return false;
  }
  let overwritten = 0;
  for (const { key, value } of obj.items) {
    const exists = localStorage.getItem(key) !== null;
    if (exists && askBeforeOverwrite) {
      const ok = confirm(`기존 데이터가 있습니다.\n[${key}]을(를) 덮어쓸까요?`);
      if (!ok) continue;
    }
    try {
      localStorage.setItem(key, value);
      if (exists) overwritten++;
    } catch {
      alert(`[${key}] 저장 중 오류가 발생했습니다.`);
      return false;
    }
  }
  return { overwritten, total: obj.items.length };
}

// ==== 자동이체 & 자동 월급 ====
/**
 * 자동 항목:
 *  - name: 항목명
 *  - amount: 금액
 *  - sourceGroupId: 출금 메인탭(월급/저축 등 그룹)
 *  - targetCatId: 입금될 통장(카테고리)
 *  - day: 기본 26일 (월급은 25일 고정)
 *  - active: 사용 여부
 */
const AUTOS_KEY = "budget-autos";
function loadAutos() {
  try {
    const raw = localStorage.getItem(AUTOS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    // 구버전 호환
    return (list || []).map((a) => ({
      id: a.id || `auto_${Math.random().toString(36).slice(2)}`,
      name: a.name || "자동이체",
      amount: Number(a.amount) || 0,
      day: a.day ?? 26,
      sourceGroupId: a.sourceGroupId || "salary",
      targetCatId: a.targetCatId || a.catId || "",
      active: a.active !== false,
    }));
  } catch {
    return [];
  }
}
function saveAutos(list) {
  try { localStorage.setItem(AUTOS_KEY, JSON.stringify(list)); } catch {}
}
function newAutoTemplate() {
  return {
    id: `auto_${Date.now().toString(36)}`,
    name: "",
    amount: 0,
    day: 26,
    sourceGroupId: "salary",
    targetCatId: "",
    active: true,
  };
}
const MEMO_SALARY = (groupId, ym) => `SALARY:${groupId}:${ym}`;
const MEMO_XFER   = (autoId, name) => `XFER:${autoId} ${name || ""}`.trim();
const isSalaryMemo = (memo, groupId, ym) => memo === MEMO_SALARY(groupId, ym);
const parseXferId = (memo) => (memo?.startsWith("XFER:") ? memo.slice(5).split(" ")[0] : null);

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
// 메인(출금) 통장용 숨김 카테고리 id
const MAIN_CAT_ID = (groupId) => `main_${groupId}`;

// ==== 월 모델 훅 ====
function initialMonthlyModel(ym) {
  return {
    month: ym,
    groups: DEFAULT_GROUPS.map((g) => ({ ...g })),
    categories: [
      // 각 그룹의 메인 통장(숨김/특수)
      ...DEFAULT_GROUPS.map((g) => ({ id: MAIN_CAT_ID(g.id), name: `${g.name} (메인)`, amount: 0, groupId: g.id, isMain: true })),
      ...DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    ],
    entries: {},
  };
}
function useMonthlyModel(ym) {
  const STORAGE_KEY = `budget-${ym}`;
  const [model, setModel] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const m = raw ? JSON.parse(raw) : initialMonthlyModel(ym);
      return ensureMainCats(m);
    } catch {
      return initialMonthlyModel(ym);
    }
  });
  useEffect(() => {
    const key = `budget-${ym}`;
    try {
      const raw = localStorage.getItem(key);
      const m = raw ? JSON.parse(raw) : initialMonthlyModel(ym);
      setModel(ensureMainCats(m));
    } catch {
      setModel(initialMonthlyModel(ym));
    }
  }, [ym]);
  useEffect(() => {
    try { localStorage.setItem(`budget-${ym}`, JSON.stringify(model)); } catch {}
  }, [model, ym]);
  return [model, setModel];
}
// 모델에 메인 카테고리 보장
function ensureMainCats(model) {
  const groups = model.groups || [];
  const cats = model.categories || [];
  const ids = new Set(cats.map((c) => c.id));
  const add = [];
  groups.forEach((g) => {
    const id = MAIN_CAT_ID(g.id);
    if (!ids.has(id)) add.push({ id, name: `${g.name} (메인)`, amount: 0, groupId: g.id, isMain: true });
  });
  return add.length ? { ...model, categories: [...cats, ...add] } : model;
}

// ==== 자동 적용: 25일 월급 + 26일 이체 ====
function applyAutomations(model, autos, ym) {
  let m = ensureMainCats({ ...model, categories: [...(model.categories || [])] });
  m.entries = { ...(m.entries || {}) };

  // 1) 이번 달 SALARY 메모들 제거(우리 자동 생성분만) 후 다시 넣기
  (m.categories || []).forEach((cat) => {
    const arr = m.entries[cat.id] || [];
    m.entries[cat.id] = arr.filter((e) => {
      // SALARY:<groupId>:<ym> 만 제거
      if (!e?.memo) return true;
      return !m.groups.some((g) => isSalaryMemo(e.memo, g.id, ym));
    });
  });
  // 월급 그룹(type==='salary')들에 대해 25일 입금
  m.groups
    .filter((g) => g.type === "salary")
    .forEach((g) => {
      const mainCat = MAIN_CAT_ID(g.id);
      const amount = Number(g.pool) || 0;
      if (amount <= 0) return;
      const date = `${ym}-${clampDay(ym, 25)}`;
      const entry = { date, amount, memo: MEMO_SALARY(g.id, ym), type: "income" };
      m.entries[mainCat] = [...(m.entries[mainCat] || []), entry];
    });

  // 2) 이번 달 XFER(자동이체) 메모들 제거 후 현재 설정으로 다시 넣기
  const autoIds = new Set((autos || []).map((a) => a.id));
  (m.categories || []).forEach((cat) => {
    const arr = m.entries[cat.id] || [];
    m.entries[cat.id] = arr.filter((e) => {
      const id = parseXferId(e?.memo || "");
      if (!id) return true;
      // 같은 달(XFER는 날짜 비교 대신 ym- 로 판단)
      return !e?.date?.startsWith(ym + "-") || autoIds.has(id) === false; // 일단 모두 지우고 다시 추가
    });
  });

  // 3) 최신 자동이체 재적용(기본 26일)
  (autos || [])
    .filter((a) => a.active && a.targetCatId && m.categories.some((c) => c.id === a.targetCatId))
    .forEach((a) => {
      const srcMain = MAIN_CAT_ID(a.sourceGroupId || "salary");
      if (!m.categories.some((c) => c.id === srcMain)) return;
      const date = `${ym}-${clampDay(ym, a.day || 26)}`;
      const amount = Number(a.amount) || 0;
      if (amount <= 0) return;
      const memo = MEMO_XFER(a.id, a.name);

      // 출금: 메인에서 -
      const out = { date, amount, memo, type: "expense" };
      m.entries[srcMain] = [...(m.entries[srcMain] || []), out];

      // 입금: 대상 통장 +
      const into = { date, amount, memo, type: "income" };
      m.entries[a.targetCatId] = [...(m.entries[a.targetCatId] || []), into];
    });

  return m;
}

export default function App() {
  // ===== 월 선택 =====
  const [ym, setYM] = useState(thisYM());
  const [selectedDate, setSelectedDate] = useState(() => `${ym}-01`);
  useEffect(() => { setSelectedDate(`${ym}-01`); }, [ym]);

  // ===== 월별 모델 =====
  const [model, setModel] = useMonthlyModel(ym);

  // ===== 자동이체 목록 =====
  const [autos, setAutos] = useState(loadAutos());
  useEffect(() => { saveAutos(autos); }, [autos]);

  // ===== Firebase 상태 & 초기화 =====
  const [fb, setFb] = useState({ app: null, auth: null, db: null, user: null, cfgFromEnv: false });
  const [houseId, setHouseId] = useState(() => localStorage.getItem("budget-houseId") || "");
  const [houseInput, setHouseInput] = useState(houseId);
  const remoteApplyingRef = useRef(false);
  const saveTimerRef = useRef(null);

  // 메인 탭
  const [mainTab, setMainTab] = useState("calendar");

  // 날짜 클릭 모달
  const [dayOpen, setDayOpen] = useState(false);

  // 스냅샷
  const [snapshots, setSnapshots] = useState([]);
  const [restoreId, setRestoreId] = useState("");
  const [isSavingSnap, setIsSavingSnap] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // 백업/복원 파일 인풋
  const fileInputRef = useRef(null);

  // ===== 백업/복원 버튼 핸들러 =====
  const handleExportAll = () => {
    const payload = makeBackupPayload();
    const filename = `budget-backup-${new Date().toISOString().replaceAll(":", "-")}.json`;
    downloadTextFile(filename, JSON.stringify(payload, null, 2));
  };
  const openImportDialog = () => fileInputRef.current?.click();
  const onImportFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      const result = await restoreFromBackupObject(obj, { askBeforeOverwrite: true });
      if (result) {
        alert(`복원 완료! 총 ${result.total}개 중 ${result.overwritten}개 덮어씀.\n현재 달(${ym})이 포함되어 있으면 화면에 반영됩니다.`);
        setModel((prev) => {
          try {
            const raw = localStorage.getItem(`budget-${ym}`);
            return raw ? ensureMainCats(JSON.parse(raw)) : prev;
          } catch { return prev; }
        });
        setAutos(loadAutos());
      }
    } catch {
      alert("백업 파일을 읽는 중 오류가 발생했습니다.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
        setModel(ensureMainCats(data.model));
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

  // ===== 핵심: 월 바뀌거나 자동목록 바뀌면 25/26 자동반영 =====
  useEffect(() => {
    setModel((m) => applyAutomations(m, autos, ym));
  }, [ym, autos, setModel]);

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
    try { setModel(ensureMainCats(snap.model)); alert("스냅샷 복원 완료!"); }
    finally { setIsRestoring(false); }
  };

  // ==== 그룹/카테고리/기록 ====
  const groups = model.groups || [];
  const categories = useMemo(() => (model.categories || []).map((c) => ({ ...c, groupId: c.groupId || c.group || "salary" })), [model.categories]);

  useEffect(() => {
    const ids = new Set(groups.map((g) => g.id));
    if (mainTab !== "calendar" && mainTab !== "auto" && !ids.has(mainTab)) setMainTab("calendar");
  }, [groups, mainTab]);

  const updateGroup = (id, patch) =>
    setModel((m) => ({ ...m, groups: m.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  const addGroup = () => {
    const name = prompt("새 메인 탭 이름 (예: 비상금통장)"); if (!name) return;
    const isSalary = confirm("이 그룹을 '월급 그룹'으로 설정할까요?");
    const id = `grp_${Date.now().toString(36)}`;
    setModel((m) => ensureMainCats({ ...m, groups: [...m.groups, { id, name, type: isSalary ? "salary" : "generic", pool: 0 }] }));
    setMainTab(id);
  };
  const renameGroup = (id) => {
    const g = groups.find((x) => x.id === id);
    const name = prompt("그룹 이름 변경", g?.name || "");
    if (!name) return;
    updateGroup(id, { name });
    // 메인 카테고리 이름도 반영
    setModel((m) => ({
      ...m,
      categories: (m.categories || []).map((c) => c.id === MAIN_CAT_ID(id) ? { ...c, name: `${name} (메인)` } : c),
    }));
  };
  const toggleGroupType = (id) => {
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    updateGroup(id, { type: g.type === "salary" ? "generic" : "salary" });
  };
  const deleteGroup = (id) => {
    const hasCats = categories.some((c) => c.groupId === id && !c.isMain);
    if (!confirm(hasCats ? "이 그룹의 통장/기록까지 모두 삭제할까요?" : "그룹을 삭제할까요?")) return;
    setModel((m) => {
      const mainId = MAIN_CAT_ID(id);
      return {
        ...m,
        groups: m.groups.filter((g) => g.id !== id),
        categories: m.categories.filter((c) => c.groupId !== id),
        entries: Object.fromEntries(
          Object.entries(m.entries || {}).filter(([catId]) => catId !== mainId && !(m.categories || []).some((c) => c.id === catId && c.groupId === id))
        ),
      };
    });
    setMainTab("calendar");
  };

  const addCategoryRow = (groupId) => {
    const name = prompt("새 통장 이름", "새 통장"); if (!name) return;
    const id = `cat_${Date.now().toString(36)}`;
    setModel((m) => ({ ...m, categories: [...m.categories, { id, name, amount: 0, groupId, isMain: false }] }));
  };
  const updateCategory = (id, field, value) =>
    setModel((m) => ({ ...m, categories: m.categories.map((c) => (c.id === id ? { ...c, [field]: field === "amount" ? Number(value) || 0 : value } : c)) }));
  const deleteCategoryRow = (id) => {
    const cat = categories.find((c) => c.id === id);
    if (cat?.isMain) return alert("메인 통장은 삭제할 수 없습니다.");
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
  const catsForAlloc = catsOfActive.filter((c) => !c.isMain); // 배정/파이에는 메인 제외
  const sumAllocated = useMemo(() => catsForAlloc.reduce((s, c) => s + (Number(c.amount) || 0), 0), [catsForAlloc]);
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
    const data = catsForAlloc.map((c) => ({ name: c.name, value: c.amount }));
    data.push({ name: "남는 돈", value: remainPool });
    return data;
  }, [catsForAlloc, remainPool, activeGroup]);

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

              <button onClick={handleExportAll} className="px-3 py-1.5 rounded-xl text-sm bg-amber-100 text-amber-900 hover:bg-amber-200">백업 저장(내보내기)</button>
              <button onClick={openImportDialog} className="px-3 py-1.5 rounded-xl text-sm bg-amber-100 text-amber-900 hover:bg-amber-200">백업 불러오기(복원)</button>
              <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={onImportFileSelected} />

              <button onClick={resetAll} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">초기화</button>
            </div>
          </div>

          {/* 월 이동 스위처 */}
          <div className="flex items-center gap-2">
            <button onClick={() => setYM(shiftYM(ym, -1))} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200">◀ 이전달</button>
            <div className="px-4 py-1.5 rounded-xl bg-white border text-slate-700">{ym}</div>
            <button onClick={() => setYM(shiftYM(ym, 1))} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200">다음달 ▶</button>
          </div>

          {/* 메인 탭 */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setMainTab("calendar")}
              className={`px-4 py-2 rounded-xl text-sm ${mainTab === "calendar" ? "bg-indigo-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`}
            >
              달력
            </button>
            <button
              onClick={() => setMainTab("auto")}
              className={`px-4 py-2 rounded-xl text-sm ${mainTab === "auto" ? "bg-indigo-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`}
            >
              자동이체
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
            {activeGroup && mainTab !== "calendar" && mainTab !== "auto" && (
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
              <GlobalEntryForm categories={categories} selectedDate={selectedDate} onAdd={(catId, entry) => addEn
