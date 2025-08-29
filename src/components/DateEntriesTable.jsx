/* eslint-disable */
import React from "react";
import { KRW } from "../utils/format";

export default function DateEntriesTable({ date, categories, entries, onRemove }) {
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
