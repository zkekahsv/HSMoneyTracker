/* eslint-disable */
import React from "react";
import { COLORS } from "../constants";
import { KRW, fmtPct } from "../utils/format";

/** 반응형 배정 테이블: 데스크톱=테이블 / 모바일=카드형 */
export default function AllocationTable({
  catsPage, startIdx, allPercents, remainPoolPercent, remainPool,
  onNameChange, onBankChange, onAmountChange, onDelete
}) {
  return (
    <div>
      {/* Desktop Table */}
      <div className="hidden sm:block mt-2 overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-2/6" />
            <col className="w-1/6" />
            <col className="w-2/6" />
            <col className="w-1/6" />
            <col className="w-[72px]" />
          </colgroup>
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-2">통장 이름</th>
              <th className="py-2">은행 이름</th>
              <th className="py-2">배정금액(원)</th>
              <th className="py-2">비율(%)</th>
              <th className="py-2">삭제</th>
            </tr>
          </thead>
          <tbody>
            {catsPage.map((c, idx) => {
              const globalIdx = startIdx + idx;
              const percent = allPercents[globalIdx] || 0;
              return (
                <tr key={c.id} className="border-t">
                  <td className="py-2 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[globalIdx % COLORS.length] }} />
                    <input type="text" className="px-2 py-1 rounded-lg border w-40" value={c.name} onChange={(e) => onNameChange(c.id, e.target.value)} />
                  </td>
                  <td className="py-2">
                    <input type="text" className="px-2 py-1 rounded-lg border w-28" placeholder="예: 국민" value={c.bankName || ""} onChange={(e) => onBankChange(c.id, e.target.value)} />
                  </td>
                  <td className="py-2">
                    <input type="number" className="w-40 px-2 py-1 rounded-lg border" value={c.amount ?? 0} onChange={(e) => onAmountChange(c.id, e.target.value)} />
                    <span className="ml-2 text-slate-500">{KRW(c.amount ?? 0)}</span>
                  </td>
                  <td className="py-2">{fmtPct(percent)}</td>
                  <td className="py-2">
                    <button onClick={() => onDelete(c.id)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">삭제</button>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t">
              <td className="py-2 flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[5] }} />
                남는 돈
              </td>
              <td className="py-2 text-slate-400">—</td>
              <td className="py-2">{KRW(remainPool)}</td>
              <td className="py-2 text-slate-500">{fmtPct(remainPoolPercent)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden mt-3 space-y-3">
        {catsPage.map((c, idx) => {
          const globalIdx = startIdx + idx;
          const percent = allPercents[globalIdx] || 0;
          return (
            <div key={c.id} className="rounded-2xl border p-3 bg-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[globalIdx % COLORS.length] }} />
                  <input type="text" className="px-2 py-1 rounded-lg border w-40" value={c.name} onChange={(e) => onNameChange(c.id, e.target.value)} />
                </div>
                <div className="text-xs text-slate-500">{fmtPct(percent)}</div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input type="text" className="px-2 py-2 rounded-lg border" placeholder="은행(선택)" value={c.bankName || ""} onChange={(e) => onBankChange(c.id, e.target.value)} />
                <input type="number" className="px-2 py-2 rounded-lg border" placeholder="배정금액" value={c.amount ?? 0} onChange={(e) => onAmountChange(c.id, e.target.value)} />
              </div>
              <div className="mt-1 text-right text-sm text-slate-500">{KRW(c.amount ?? 0)}</div>
              <div className="mt-2 text-right">
                <button onClick={() => onDelete(c.id)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">삭제</button>
              </div>
            </div>
          );
        })}
        <div className="rounded-2xl border p-3 bg-slate-50 text-sm">
          <div className="flex items-center justify-between">
            <div>남는 돈</div>
            <div className="text-slate-500">{fmtPct(remainPoolPercent)}</div>
          </div>
          <div className="mt-1">{KRW(remainPool)}</div>
        </div>
      </div>
    </div>
  );
}
