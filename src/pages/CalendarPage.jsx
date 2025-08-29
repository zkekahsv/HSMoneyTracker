/* eslint-disable */
import React, { useMemo } from "react";
import MonthCalendar from "../components/MonthCalendar";
import GlobalEntryForm from "../components/GlobalEntryForm";
import DateEntriesTable from "../components/DateEntriesTable";
import RecentTable from "../components/RecentTable";
import { KRW } from "../utils/format";

export default function CalendarPage({ ym, selectedDate, setSelectedDate, categories, entries, addEntry, removeEntry }) {
  const calendarData = useMemo(() => {
    const map = {}; const prefix = ym + "-";
    Object.entries(entries || {}).forEach(([_, arr]) => {
      (arr || []).forEach((e) => {
        if (!e?.date || !e.date.startsWith(prefix)) return;
        const t = (e.type || "expense") === "income" ? "income" : "expense";
        if (!map[e.date]) map[e.date] = { income: 0, expense: 0 };
        map[e.date][t] += Number(e.amount) || 0;
      });
    });
    return map;
  }, [entries, ym]);

  const monthTotals = useMemo(() => {
    let income = 0, expense = 0;
    Object.values(calendarData).forEach((v) => { income += v.income || 0; expense += v.expense || 0; });
    return { income, expense, net: income - expense };
  }, [calendarData]);

  const recentEntries = useMemo(() => {
    const list = [];
    Object.entries(entries || {}).forEach(([catId, arr]) => {
      const name = categories.find((c) => c.id === catId)?.name || catId;
      (arr || []).forEach((e, idx) => list.push({ ...e, catId, idx, catName: name }));
    });
    return list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  }, [entries, categories]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      <section className="bg-white rounded-2xl shadow p-5">
        <h2 className="text-lg font-semibold mb-2">달력 · {ym} 수입/지출 한눈에</h2>
        <MonthCalendar ym={ym} data={calendarData} selectedDate={selectedDate} onSelectDate={(iso) => setSelectedDate(iso)} />
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
        <DateEntriesTable date={selectedDate} categories={categories} entries={entries} onRemove={removeEntry} />
      </section>

      <section className="bg-white rounded-2xl shadow p-5">
        <h3 className="text-base font-semibold mb-2">최근 기록 (상위 20개)</h3>
        <RecentTable rows={recentEntries} onRemove={(e) => removeEntry(e.catId, e.idx)} />
      </section>
    </main>
  );
}
