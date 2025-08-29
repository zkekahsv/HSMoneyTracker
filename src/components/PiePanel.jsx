/* eslint-disable */
import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { COLORS } from "../constants";
import { KRW, fmtPct } from "../utils/format";

export default function PiePanel({ dataWithPct, title }) {
  const RADIAN = Math.PI / 180;
  const renderOuterLabel = (props) => {
    const { cx, cy, midAngle, outerRadius, index, name } = props;
    const pct = dataWithPct[index]?.pct ?? 0;
    if (pct < 2) return null;
    const r = outerRadius + 16;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    const baseName = (name || "").replace(/\s*\(메인\)\s*$/, "");
    const shortName = baseName.length > 8 ? baseName.slice(0, 8) + "…" : baseName;
    return (
      <text x={x} y={y} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fill="#334155" fontSize={11}>
        {`${shortName} ${fmtPct(pct)}`}
      </text>
    );
  };
  return (
    <div className="bg-white rounded-2xl shadow p-5">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={dataWithPct} dataKey="value" nameKey="name" insideRadius={60} outerRadius={110} minAngle={3} paddingAngle={1} labelLine={{ stroke: "#94a3b8" }} label={renderOuterLabel}>
              {dataWithPct.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
            </Pie>
            <Tooltip formatter={(val, name, props) => {
              const idx = props?.index ?? 0;
              const pct = dataWithPct[idx]?.pct ?? 0;
              return [KRW(Number(val)), `${name} (${fmtPct(pct)})`];
            }} />
            <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
