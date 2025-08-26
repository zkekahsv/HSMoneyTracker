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

// ==== 로컬 백업/복원 유틸 ====
function collectBudgetLocalStorage() {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith("budget-") && /^\d{4}-\d{2}$/.test(key.slice(7))) {
      items.push({ key, value: localStorage.getItem(key) });
    }
    if (key === "budget-fbconfig" || key === "budget-houseId") {
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
  return { type: "budget-backup", version: 1, exportedAt: new Date().toISOString(), items: collectBudgetLocalStorage() };
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
    try { localStorage.setItem(key, value); if (exists) overwritten++; }
    catch { alert(`[${key}] 저장 중 오류가 발생했습니다.`); return false; }
  }
  return { overwritten, total: obj.items.length };
}

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
  return { month: ym, groups: DEFAULT_GROUPS.map((g) => ({ ...g })), categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), entries: {} };
}
function useMonthlyModel(ym) {
  const STORAGE_KEY = `budget-${ym}`;
  const [model, setModel] = useState(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : initialMonthlyModel(ym); }
    catch { return initialMonthlyModel(ym); }
  });
  useEffect(() => {
    const key = `budget-${ym}`;
    try { const raw = localStorage.getItem(key); setModel(raw ? JSON.parse(raw) : initialMonthlyModel(ym)); }
    catch { setModel(initialMonthlyModel(ym)); }
  }, [ym]);
  useEffect(() => { try { localStorage.setItem(`budget-${ym}`, JSON.stringify(model)); } catch {} }, [model, ym]);
  return [model, setModel];
}

// ==== 메인 App ====
export default function App() {
  const [ym, setYM] = useState(thisYM());
  const [selectedDate, setSelectedDate] = useState(() => `${ym}-01`);
  useEffect(() => { setSelectedDate(`${ym}-01`); }, [ym]);
  const [model, setModel] = useMonthlyModel(ym);

  // Firebase 상태
  const [fb, setFb] = useState({ app: null, auth: null, db: null, user: null, cfgFromEnv: false });
  const [houseId, setHouseId] = useState(() => localStorage.getItem("budget-houseId") || "");
  const [houseInput, setHouseInput] = useState(houseId);
  const remoteApplyingRef = useRef(false);
  const saveTimerRef = useRef(null);

  const [mainTab, setMainTab] = useState("calendar");
  const [dayOpen, setDayOpen] = useState(false);

  const [snapshots, setSnapshots] = useState([]);
  const [restoreId, setRestoreId] = useState("");
  const [isSavingSnap, setIsSavingSnap] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // === 로컬 백업 ===
  const fileInputRef = useRef(null);
  const handleExportAll = () => {
    const payload = makeBackupPayload();
    const filename = `budget-backup-${new Date().toISOString().replaceAll(':','-')}.json`;
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
        alert(`복원 완료! 총 ${result.total}개 중 ${result.overwritten}개를 덮어썼습니다.`);
        setModel((prev) => {
          try { const raw = localStorage.getItem(`budget-${ym}`); return raw ? JSON.parse(raw) : prev; }
          catch { return prev; }
        });
      }
    } catch { alert("백업 파일을 읽는 중 오류"); }
    finally { if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  // (Firebase init, snapshot sync, save 등 기존 코드 그대로...)
  // ... [생략: 위에서 본 Firebase 동기화 useEffect, 그룹/카테고리 관리, 파생값 계산, UI 렌더링] ...
  
  return (
    <div>
      {/* 헤더 버튼 영역에 추가 */}
      <button onClick={handleExportAll}>백업 저장(내보내기)</button>
      <button onClick={openImportDialog}>백업 불러오기(복원)</button>
      <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={onImportFileSelected}/>
      {/* 나머지 가계부 UI (달력, 그룹, 원형그래프 등) */}
    </div>
  );
}

// 아래 MonthCalendar, EntryForm 등 보조 컴포넌트도 위 코드처럼 그대로 붙여넣기
