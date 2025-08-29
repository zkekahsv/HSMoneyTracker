/* eslint-disable */
import React from "react";
import { KRW } from "../utils/format";

export default function DayDetailModal({ open, onClose, date, categories, entries, onRemove }) {
  if (!open) return null;

  const rows = [];
  Object.entries(entries || {}).forEach(([catId, arr]) => {
    const catName = categories.find(c => c.id === catId)?.name || catId;
    (arr || []).forEach((e, idx) => {
      if (e.date === date) rows.push({ ...e, catId, idx, catName });
    });
  });

  const byCat = {};
  rows.forEach(r => {
    if (!byCat[r.catId]) byCat[r.catId] = { name: r.catName, income: 0, expense: 0 };
    const t = (r.type || 'expense') === 'income' ? 'income' : 'expense';
    byCat[r.catId][t] += Number(r.amount) || 0;
  });

  const totals = rows.reduce((acc, r) => {
    const t = (r.type || 'expense') === 'income' ? 'income' : 'expense';
    acc[t] += Number(r.amount) || 0;
    return acc;
  }, { income: 0, expense: 0 });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-[101] w-[95vw] max-w-3xl max-h-[80vh] overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-base sm:text-lg font-semibold">{date} 내역</h3>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">닫기</button>
        </div>

        <div className="p-4 space-y-4 overflow-auto">
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
                        <button onClick={() => onRemove(r.catId, r.idx)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">
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
