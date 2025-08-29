/* eslint-disable */
import React from "react";
import { KRW } from "../utils/format";

export default function RecentTable({ rows, onRemove }) {
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
                <button onClick={() => onRemove(r.catId, r.idx)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
