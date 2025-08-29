/* eslint-disable */
import React, { useMemo } from "react";
import { motion } from "framer-motion";
import EntryForm from "../components/EntryForm";
import CategoryEntriesTable from "../components/CategoryEntriesTable";
import AllocationTable from "../components/AllocationTable";
import PiePanel from "../components/PiePanel";
import { normalizePercents } from "../utils/percent";
import { KRW } from "../utils/format";
import { COLORS } from "../constants";

export default function GroupPage({
  activeGroup, catsOfActive, catsForAlloc, rowsPerPage, startIdx, endIdx, currentPage, totalPages,
  setAllocPage, addCategoryRow, updateCategory, deleteCategoryRow,
  entries, addEntry, removeEntry,
}) {
  const sumAllocated = useMemo(() => catsForAlloc.reduce((s, c) => s + (Number(c.amount) || 0), 0), [catsForAlloc]);
  const remainPool = Math.max(0, Number(activeGroup?.pool || 0) - sumAllocated);
  const allValsForPercent = useMemo(() => [...catsForAlloc.map((c) => c.amount || 0), remainPool], [catsForAlloc, remainPool]);
  const allPercents = useMemo(() => normalizePercents(allValsForPercent), [allValsForPercent]);

  const overallPie = useMemo(() => {
    if (!activeGroup) return [];
    const data = catsForAlloc.map((c) => ({ name: c.name, value: Math.max(0, c.amount || 0) }));
    data.push({ name: "남는 돈", value: Math.max(0, remainPool) });
    return data;
  }, [catsForAlloc, remainPool, activeGroup]);

  const pieWithPct = useMemo(() => overallPie.map((d, i) => ({ ...d, pct: allPercents[i] || 0 })), [overallPie, allPercents]);

  const catsPage = catsForAlloc.slice(startIdx, endIdx);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 space-y-8">
      <section className="grid lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-lg font-semibold mb-2">1) {activeGroup?.type === "salary" ? "월급 입력(25일 자동입금)" : "그룹 총액(목표/잔액)"}</h2>
          <div className="mb-2 text-xs text-slate-500 whitespace-pre-line">
            {activeGroup?.type === "salary"
              ? "· 25일: 위 금액이 메인통장(+)
· 26일: 아래 서브 통장 '배정금액'만큼 메인(-) → 서브(+) 자동분배"
              : "· '월급 그룹'으로 지정하면 25/26 자동반영 규칙이 적용됩니다."}
          </div>

          {/* label / input / value ratio fixed even on mobile */}
          <div className="grid grid-cols-12 items-center gap-3">
            <span className="col-span-4 sm:col-span-2 text-slate-600">{activeGroup?.type === "salary" ? "월급" : "총액"}</span>
            <input
              type="number" inputMode="numeric"
              className="col-span-8 sm:col-span-6 px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="예: 3,000,000"
              value={activeGroup?.pool || 0}
              onChange={(e) => activeGroup && activeGroup.id && (updateCategory("__GROUP__", "pool", { groupId: activeGroup.id, value: Number(e.target.value) || 0 }))}
            />
            <span className="col-span-12 sm:col-span-4 sm:text-right text-sm text-slate-500">{KRW(activeGroup?.pool || 0)}</span>
          </div>

          <div className="mt-4">
            <button onClick={() => addCategoryRow(activeGroup.id)} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">서브 통장 추가</button>
          </div>

          <AllocationTable
            catsPage={catsPage}
            startIdx={startIdx}
            allPercents={allPercents}
            remainPoolPercent={allPercents[allPercents.length - 1] || 0}
            remainPool={remainPool}
            onNameChange={(id, v) => updateCategory(id, "name", v)}
            onBankChange={(id, v) => updateCategory(id, "bankName", v)}
            onAmountChange={(id, v) => updateCategory(id, "amount", v)}
            onDelete={(id) => deleteCategoryRow(id)}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-3 flex items-center gap-1">
              <button className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50" disabled={currentPage <= 1} onClick={() => setAllocPage(activeGroup.id, Math.max(1, currentPage - 1))}>이전</button>
              {Array.from({ length: totalPages }).map((_, i) => {
                const p = i + 1;
                return (
                  <button key={p} className={`px-3 py-1 rounded-lg border ${p === currentPage ? "bg-indigo-600 text-white border-indigo-600" : "bg-white hover:bg-slate-50"}`} onClick={() => setAllocPage(activeGroup.id, p)}>{p}</button>
                );
              })}
              <button className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50" disabled={currentPage >= totalPages} onClick={() => setAllocPage(activeGroup.id, Math.min(totalPages, currentPage + 1))}>다음</button>
            </div>
          )}
        </motion.div>

        <PiePanel dataWithPct={pieWithPct} title={`2) ${activeGroup?.name} 원형그래프`} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">3) {activeGroup?.name} 통장별 상세 (지출/수입 기록)</h2>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {catsOfActive.filter(c => !c.isMain).map((c, idx) => {
            const expense = (entries?.[c.id] || []).filter(e => (e.type || "expense") === "expense").reduce((s, e) => s + (Number(e.amount) || 0), 0);
            const income  = (entries?.[c.id] || []).filter(e => (e.type || "expense") === "income" ).reduce((s, e) => s + (Number(e.amount) || 0), 0);
            const used = Math.max(0, expense - income);
            const remain = Math.max(0, (c.amount || 0) - used);
            const catPie = [{ name: "사용", value: Math.max(0, used) }, { name: "남음", value: Math.max(0, remain) }];
            const opened = true;

            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }} className="bg-white rounded-2xl shadow">
                <div className="w-full flex items-center justify-between p-4 rounded-2xl">
                  <div className="flex items-center gap-2 text-left">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[idx % COLORS.length] }} />
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      {c.bankName ? <div className="text-xs text-slate-500">{c.bankName}</div> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <span>배정 <b>{KRW(c.amount || 0)}</b></span>
                    <span>남음 <b>{KRW(remain)}</b></span>
                  </div>
                </div>
                <div className="p-4 border-t">
                  <CategoryEntriesTable entries={entries?.[c.id] || []} onRemove={(i) => removeEntry(c.id, i)} />
                  <EntryForm onAdd={(entry) => addEntry(c.id, entry)} />
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
