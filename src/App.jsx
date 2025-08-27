// src/App.jsx
// ==== 가계부 (25일 월급 자동입금 + 26일 자동배분, 자동이체 탭 제거) ====
// - 첫 번째 메인탭: 월급통장만 표시
// - 25일: 월급통장(메인)에 입금 기록 자동 생성
// - 26일: 아래 'FIXED_ALLOCATIONS' 목록대로 하위 통장으로 자동 이체(메인 -, 하위 +)
// - 각 통장에 '은행명' 필드 추가/수정 가능
// - 로컬스토리지에 월별 저장

import React, { useEffect, useMemo, useRef, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

// ===== 유틸 =====
const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b", "#14b8a6", "#d946ef"];
const KRW = (v) => (isNaN(v) ? "-" : v.toLocaleString("ko-KR") + "원");
const todayStr = () => {
  const d = new Date(); const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const thisYM = () => new Date().toISOString().slice(0, 7);
const shiftYM = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const clampDay = (ym, day) => {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return String(Math.max(1, Math.min(last, Number(day) || 1))).padStart(2, "0");
};

// ===== 기본 그룹/카테고리 =====
// 그룹: 월급(salary) 1개만 두고, 하위 통장을 모두 여기에 둡니다.
const GROUP_SALARY = { id: "salary", name: "월급통장", type: "salary", pool: 0 };

// "메인(월급)" 카테고리 id
const MAIN_CAT_ID = (groupId) => `main_${groupId}`;

// 질문에서 주신 자동이체 통장 목록(은행/금액) — 26일에 자동배분
// name: 화면에 보일 통장 이름, bank: 은행명, amount: 월 배분금액(원)
const FIXED_ALLOCATIONS = [
  { id: "siu_seonwoo_apt", name: "시우선우 주택청약 통장", bank: "우리은행", amount: 80000 },
  { id: "seonwoo_daycare", name: "선우어린이집비 통장", bank: "농협은행", amount: 180000 },
  { id: "transport", name: "교통비통장", bank: "농협은행", amount: 120000 },
  { id: "workout", name: "운동통장", bank: "농협은행", amount: 100000 },
  { id: "fuel", name: "기름값통장", bank: "농협", amount: 150000 },
  { id: "siu_academy", name: "시우학원통장", bank: "예은농협", amount: 150000 },
  { id: "tomorrow_savings", name: "내일저축계좌통장", bank: "하나은행", amount: 100000 },
  { id: "seonwoo_insurance", name: "선우보험비통장", bank: "예은농협", amount: 160000 },
  { id: "yeeun_allowance_phone", name: "예은용돈+통신비통장", bank: "예은카카오뱅크", amount: 160000 },
  { id: "hyundai_ins", name: "현대해상보험통장", bank: "기업은행", amount: 90000 },
  { id: "living", name: "생활비통장", bank: "예은농협", amount: 600000 },
  { id: "siu_activity", name: "시우특활비통장", bank: "농협", amount: 230000 },
  { id: "youth_hope", name: "청년희망적금통장", bank: "국민", amount: 500000 },
  { id: "loan_interest_kids_apt", name: "대출이자,자녀청약통장", bank: "우리", amount: 420000 },
  { id: "meal", name: "밥값통장", bank: "카카오뱅크", amount: 300000 },
  { id: "family_events", name: "경조사통장", bank: "농협", amount: 50000 },
];

// ===== 월 모델 =====
function initialMonthlyModel(ym) {
  const mainCat = { id: MAIN_CAT_ID(GROUP_SALARY.id), name: `${GROUP_SALARY.name} (메인)`, amount: 0, bank: "", groupId: GROUP_SALARY.id, isMain: true };
  const subCats = FIXED_ALLOCATIONS.map(a => ({ id: a.id, name: a.name, amount: a.amount, bank: a.bank, groupId: GROUP_SALARY.id, isMain: false }));
  return {
    month: ym,
    groups: [{ ...GROUP_SALARY }],
    categories: [mainCat, ...subCats],
    entries: {}, // { [catId]: [{date, amount, type: 'income'|'expense', memo}] }
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

  // 월이 바뀌면 해당 월의 모델 로드
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`budget-${ym}`);
      setModel(raw ? JSON.parse(raw) : initialMonthlyModel(ym));
    } catch {
      setModel(initialMonthlyModel(ym));
    }
  }, [ym]);

  // 저장
  useEffect(() => {
    try { localStorage.setItem(`budget-${ym}`, JSON.stringify(model)); } catch {}
  }, [model, ym]);

  return [model, setModel];
}

// ===== 자동 적용 (25/26) =====
const MEMO_SALARY = (ym) => `SALARY:${ym}`;
const MEMO_ALLOC  = (id, name) => `ALLOC:${id} ${name}`;

function applyAutoSalaryAndAllocations(model, ym) {
  const m = { ...model, entries: { ...(model.entries || {}) } };
  const mainCatId = MAIN_CAT_ID(GROUP_SALARY.id);

  // 1) 이번 달의 기존 자동 생성분 제거 (SALARY/ALLOC)
  Object.keys(m.entries).forEach(catId => {
    m.entries[catId] = (m.entries[catId] || []).filter(e => {
      if (!e?.date?.startsWith(ym + "-")) return true;
      const mm = e.memo || "";
      return !(mm === MEMO_SALARY(ym) || mm.startsWith("ALLOC:"));
    });
  });

  // 2) 25일: 월급 입금 (+) — 그룹의 pool 금액 사용
  const salaryAmount = Number((m.groups.find(g => g.id === GROUP_SALARY.id)?.pool) || 0);
  if (salaryAmount > 0) {
    const date25 = `${ym}-${clampDay(ym, 25)}`;
    const entry = { date: date25, amount: salaryAmount, memo: MEMO_SALARY(ym), type: "income" };
    m.entries[mainCatId] = [...(m.entries[mainCatId] || []), entry];
  }

  // 3) 26일: 자동배분 (메인 -, 각 하위 +)
  const date26 = `${ym}-${clampDay(ym, 26)}`;
  FIXED_ALLOCATIONS.forEach(a => {
    const amt = Number(a.amount) || 0;
    if (amt <= 0) return;
    const memo = MEMO_ALLOC(a.id, a.name);

    // 메인에서 출금(-)
    m.entries[mainCatId] = [...(m.entries[mainCatId] || []), { date: date26, amount: amt, memo, type: "expense" }];

    // 대상 통장에 입금(+)
    m.entries[a.id] = [...(m.entries[a.id] || []), { date: date26, amount: amt, memo, type: "income" }];
  });

  return m;
}

// ===== 메인 컴포넌트 =====
export default function App() {
  const [ym, setYM] = useState(thisYM());
  const [model, setModel] = useMonthlyModel(ym);
  const [selectedDate, setSelectedDate] = useState(() => `${ym}-01`);
  useEffect(() => setSelectedDate(`${ym}-01`), [ym]);

  // 메인 탭 (calendar | salary)
  const [tab, setTab] = useState("salary"); // 기본: 월급 탭 먼저

  // 25/26 자동반영
  useEffect(() => {
    setModel((m) => applyAutoSalaryAndAllocations(m, ym));
  }, [ym, setModel]);

  // 편의 액션
  const updateGroupPool = (value) =>
    setModel((m) => ({ ...m, groups: m.groups.map(g => g.id === GROUP_SALARY.id ? { ...g, pool: Number(value) || 0 } : g) }));

  const updateCategory = (id, patch) =>
    setModel((m) => ({ ...m, categories: m.categories.map(c => c.id === id ? { ...c, ...patch } : c) }));

  const addEntry = (catId, entry) =>
    setModel((m) => ({ ...m, entries: { ...m.entries, [catId]: [...(m.entries?.[catId] || []), entry] } }));

  const removeEntry = (catId, idx) =>
    setModel((m) => ({ ...m, entries: { ...m.entries, [catId]: (m.entries?.[catId] || []).filter((_, i) => i !== idx) } }));

  const resetMonth = () => {
    if (!confirm(`${ym} 데이터를 초기화할까요?`)) return;
    setModel(initialMonthlyModel(ym));
    setSelectedDate(`${ym}-01`);
    setTab("salary");
  };

  // 파생 값
  const categories = model.categories || [];
  const mainCat = categories.find(c => c.isMain);
  const subCats = categories.filter(c => !c.isMain);

  // 파이/배정 요약: 하위통장 amount 합계 & 남는돈
  const allocatedSum = subCats.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const salaryPool = Number((model.groups.find(g => g.id === GROUP_SALARY.id)?.pool) || 0);
  const remainPool = Math.max(0, salaryPool - allocatedSum);

  // 달력 집계
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
    Object.values(calendarData).forEach(v => { income += v.income || 0; expense += v.expense || 0; });
    return { income, expense, net: income - expense };
  }, [calendarData]);

  // 최근 20개
  const recentEntries = useMemo(() => {
    const list = [];
    Object.entries(model.entries || {}).forEach(([catId, arr]) => {
      const catName = categories.find(c => c.id === catId)?.name || catId;
      (arr || []).forEach((e, idx) => list.push({ ...e, catId, idx, catName }));
    });
    return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  }, [model.entries, categories]);

  // 파이 데이터 (하위통장 + 남는돈)
  const overallPie = useMemo(() => {
    const data = subCats.map(c => ({ name: `${c.name}`, value: Number(c.amount) || 0 }));
    data.push({ name: "남는 돈", value: remainPool });
    return data;
  }, [subCats, remainPool]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold">{ym} 가계부</h1>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setTab("salary")} className={`px-3 py-1.5 rounded-xl text-sm ${tab === "salary" ? "bg-indigo-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>월급</button>
              <button onClick={() => setTab("calendar")} className={`px-3 py-1.5 rounded-xl text-sm ${tab === "calendar" ? "bg-indigo-600 text-white" : "bg-slate-100 hover:bg-slate-200"}`}>달력</button>
              <button onClick={() => setYM(shiftYM(ym, -1))} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200">◀ 이전달</button>
              <div className="px-3 py-1.5 rounded-xl bg-white border">{ym}</div>
              <button onClick={() => setYM(shiftYM(ym, 1))} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200">다음달 ▶</button>
              <button onClick={resetMonth} className="px-3 py-1.5 rounded-xl text-sm bg-red-50 text-red-700 hover:bg-red-100">이 달 초기화</button>
            </div>
          </div>
        </div>
      </header>

      {tab === "calendar" ? (
        <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
          <section className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-semibold mb-2">달력 · {ym} 수입/지출</h2>
            <MonthCalendar ym={ym} data={calendarData} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            <div className="mt-4 grid sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-slate-50 rounded-xl p-3"><div className="text-slate-500">이 달 총 수입</div><div className="text-xl font-bold text-emerald-700">{KRW(monthTotals.income)}</div></div>
              <div className="bg-slate-50 rounded-xl p-3"><div className="text-slate-500">이 달 총 지출</div><div className="text-xl font-bold text-rose-700">{KRW(monthTotals.expense)}</div></div>
              <div className="bg-slate-50 rounded-xl p-3"><div className="text-slate-500">순이동</div><div className="text-xl font-bold">{KRW(monthTotals.net)}</div></div>
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">{selectedDate} 상세</h3>
              <GlobalEntryForm
                categories={categories}
                selectedDate={selectedDate}
                onAdd={(catId, entry) => addEntry(catId, entry)}
              />
            </div>
            <DateEntriesTable date={selectedDate} categories={categories} entries={model.entries} onRemove={removeEntry} />
          </section>

          <section className="bg-white rounded-2xl shadow p-5">
            <h3 className="text-base font-semibold mb-2">최근 기록 (상위 20개)</h3>
            <RecentTable rows={recentEntries} onRemove={(e) => removeEntry(e.catId, e.idx)} />
          </section>
        </main>
      ) : (
        // ===== 월급 탭 =====
        <main className="mx-auto max-w-6xl px-4 py-6 space-y-8">
          {/* 1) 월급 입력 + 메인통장 카드 */}
          <section className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-semibold mb-4">월급 & 메인통장</h2>
            <div className="flex items-center gap-3">
              <span className="text-slate-600">월급</span>
              <input
                type="number" inputMode="numeric"
                className="w-56 px-3 py-2 rounded-xl border"
                placeholder="예: 3,000,000"
                value={salaryPool}
                onChange={(e) => updateGroupPool(e.target.value)}
              />
              <span className="text-sm text-slate-500">{KRW(salaryPool)}</span>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-4">
              {mainCat && (
                <div className="rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{mainCat.name}</div>
                    <div className="text-sm text-slate-500">은행:
                      <input
                        className="ml-2 px-2 py-1 rounded-lg border w-32"
                        value={mainCat.bank || ""}
                        placeholder="(선택)"
                        onChange={(e) => updateCategory(mainCat.id, { bank: e.target.value })}
                      />
                    </div>
                  </div>
                  <EntryForm onAdd={(entry) => addEntry(mainCat.id, entry)} />
                  <CategoryEntriesTable catId={mainCat.id} entries={model.entries?.[mainCat.id] || []} onRemove={(i) => removeEntry(mainCat.id, i)} />
                </div>
              )}

              {/* 파이 차트 요약 */}
              <div className="rounded-xl border p-4">
                <div className="font-semibold mb-2">배정 요약</div>
                <div className="text-sm text-slate-600 mb-2">
                  하위통장 배정 합계: <b>{KRW(allocatedSum)}</b> / 월급: <b>{KRW(salaryPool)}</b> → 남는 돈: <b>{KRW(remainPool)}</b>
                  <div className="text-xs text-slate-500 mt-1">※ 25일 월급 입금, 26일 자동배분이 기록에 반영됩니다.</div>
                </div>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={overallPie} dataKey="value" nameKey="name" outerRadius={100} label>
                        {overallPie.map((_, i) => (<Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />))}
                      </Pie>
                      <Tooltip formatter={(val) => KRW(Number(val))} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>

          {/* 2) 하위통장 목록 (이름 옆 은행, 배정금액 수정 가능) */}
          <section className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-semibold mb-3">하위 통장 (26일 자동배분 대상)</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">통장 이름</th>
                    <th className="py-2">은행</th>
                    <th className="py-2">배정금액</th>
                    <th className="py-2">지출/수입 기록</th>
                  </tr>
                </thead>
                <tbody>
                  {subCats.map((c, idx) => {
                    const expense = (model.entries?.[c.id] || []).filter(e => (e.type || "expense") === "expense").reduce((s, e) => s + (Number(e.amount) || 0), 0);
                    const income  = (model.entries?.[c.id] || []).filter(e => (e.type || "expense") === "income" ).reduce((s, e) => s + (Number(e.amount) || 0), 0);
                    const used = Math.max(0, expense - income);
                    const remain = Math.max(0, (Number(c.amount) || 0) - used);
                    return (
                      <tr key={c.id} className="border-t align-top">
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[idx % COLORS.length] }} />
                            <div className="font-medium">{c.name}</div>
                          </div>
                        </td>
                        <td className="py-2">
                          <input className="px-2 py-1 rounded-lg border w-36" value={c.bank || ""} onChange={(e) => updateCategory(c.id, { bank: e.target.value })} />
                        </td>
                        <td className="py-2">
                          <input type="number" className="px-2 py-1 rounded-lg border w-32" value={c.amount ?? 0} onChange={(e) => updateCategory(c.id, { amount: Number(e.target.value) || 0 })} />
                          <span className="ml-2 text-slate-500">{KRW(c.amount ?? 0)}</span>
                        </td>
                        <td className="py-2">
                          <div className="mb-2 text-xs text-slate-500">지출 {KRW(expense)} / 수입 {KRW(income)} / 남음 {KRW(remain)}</div>
                          <EntryForm onAdd={(entry) => addEntry(c.id, entry)} />
                          <CategoryEntriesTable catId={c.id} entries={model.entries?.[c.id] || []} onRemove={(i) => removeEntry(c.id, i)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

// ===== 달력 =====
function MonthCalendar({ ym, data, selectedDate, onSelectDate }) {
  const [y, m] = ym.split("-").map(Number);
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
      <div className="grid grid-cols-7 gap-1 text-xs mb-1">
        {["일","월","화","수","목","금","토"].map((w) => (<div key={w} className="py-1 text-center font-medium text-slate-500">{w}</div>))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
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

// ===== 폼/테이블 =====
function GlobalEntryForm({ categories, selectedDate, onAdd }) {
  const [catId, setCatId] = useState(categories[0]?.id || "");
  const [date, setDate] = useState(selectedDate || todayStr());
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState(0);
  const [memo, setMemo] = useState("");

  useEffect(() => { setDate(selectedDate || todayStr()); }, [selectedDate]);
  useEffect(() => { if (!catId && categories[0]) setCatId(categories[0].id); }, [categories, catId]);

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
              <td className="py-1"><button onClick={() => onRemove(catId, i)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">삭제</button></td>
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
          {rows.map((e, i) => (
            <tr key={`${e.catId}-${e.idx}-${i}`} className="border-t">
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
                <button onClick={() => onRemove(r.catId, r.idx)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
