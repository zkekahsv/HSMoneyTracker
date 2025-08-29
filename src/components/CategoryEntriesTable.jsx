/* eslint-disable */
import React from "react";
import { KRW } from "../utils/format";

export default function CategoryEntriesTable({ entries, onRemove }) {
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
