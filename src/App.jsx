import React, { useEffect, useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { motion } from "framer-motion";

const monthKey = new Date().toISOString().slice(0, 7);

const STORAGE_KEY = `budget-${monthKey}`;

const DEFAULT_CATEGORIES = [
  { id: "living", name: "생활비 통장", amount: 0 },
  { id: "academy", name: "학원비 통장", amount: 0 },
  { id: "food", name: "밥값 통장", amount: 0 },
  { id: "phone", name: "통신비 통장", amount: 0 },
  { id: "allowance", name: "용돈 통장", amount: 0 },
];

const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];

const KRW = (v) => (isNaN(v) ? "-" : v.toLocaleString("ko-KR") + "원");

function usePersistedState(initial) {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);
  return [state, setState];
}

export default function App() {
  const [model, setModel] = usePersistedState({
    month: monthKey,
    salary: 0,
    categories: DEFAULT_CATEGORIES,
    entries: {},
  });

  const totalAllocated = useMemo(
    () => model.categories.reduce((sum, c) => sum + (Number(c.amount) || 0), 0),
    [model.categories]
  );
  const remainAmount = Math.max(0, Number(model.salary || 0) - totalAllocated);

  const spentByCat = useMemo(() => {
    const out = {};
    for (const c of model.categories) out[c.id] = 0;
    Object.entries(model.entries || {}).forEach(([catId, arr]) => {
      out[catId] = (arr || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    });
    return out;
  }, [model.entries, model.categories]);

  const overallPie = useMemo(() => {
    const data = model.categories.map((c) => ({ name: c.name, value: c.amount }));
    data.push({ name: "남는 돈", value: remainAmount });
    return data;
  }, [model.categories, remainAmount]);

  const updateSalary = (v) => setModel((m) => ({ ...m, salary: Number(v) || 0 }));
  const updateCategory = (id, field, value) =>
    setModel((m) => ({
      ...m,
      categories: m.categories.map((c) =>
        c.id === id ? { ...c, [field]: field === "amount" ? Number(value) || 0 : value } : c
      ),
    }));

  const addEntry = (catId, entry) =>
    setModel((m) => ({
      ...m,
      entries: {
        ...m.entries,
        [catId]: [...(m.entries?.[catId] || []), entry],
      },
    }));

  const removeEntry = (catId, idx) =>
    setModel((m) => ({
      ...m,
      entries: {
        ...m.entries,
        [catId]: (m.entries?.[catId] || []).filter((_, i) => i !== idx),
      },
    }));

  const resetAll = () => {
    if (!confirm("8월 데이터를 모두 초기화할까요?")) return;
    setModel({ month: monthKey, salary: 0, categories: DEFAULT_CATEGORIES, entries: {} });
  };

  // ▼ 백업/복원 기능
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${STORAGE_KEY}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        setModel(data);
      } catch (e) {
        alert("JSON 파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold">8월 가계부 · 월급 분배 & 자동이체 트래커</h1>
          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200 cursor-pointer">
              복원
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])}
              />
            </label>
            <button onClick={exportJSON} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">
              백업
            </button>
            <button onClick={resetAll} className="px-3 py-1.5 rounded-xl text-sm bg-slate-100 hover:bg-slate-200">
              초기화
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-8">
        <section className="grid lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-semibold mb-4">1) 월급 입력</h2>
            <div className="flex items-center gap-3">
              <span className="text-slate-600">월급</span>
              <input
                type="number"
                inputMode="numeric"
                className="w-full sm:w-64 px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="예: 3,000,000"
                value={model.salary}
                onChange={(e) => updateSalary(e.target.value)}
              />
              <span className="text-sm text-slate-500">{KRW(model.salary)}</span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">통장 이름</th>
                    <th className="py-2">배정금액</th>
                  </tr>
                </thead>
                <tbody>
                  {model.categories.map((c, idx) => (
                    <tr key={c.id} className="border-t">
                      <td className="py-2 flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[idx] }} />
                        <input
                          type="text"
                          className="px-2 py-1 rounded-lg border w-32"
                          value={c.name}
                          onChange={(e) => updateCategory(c.id, "name", e.target.value)}
                        />
                      </td>
                      <td className="py-2">
                        <input
                          type="number"
                          className="w-32 px-2 py-1 rounded-lg border"
                          value={c.amount}
                          onChange={(e) => updateCategory(c.id, "amount", e.target.value)}
                        />
                        <span className="ml-2 text-slate-500">{KRW(c.amount)}</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t">
                    <td className="py-2 flex items-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[5] }} />남는 돈
                    </td>
                    <td className="py-2">{KRW(remainAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-lg font-semibold mb-4">2) 월급 통장 원형그래프</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={overallPie} dataKey="value" nameKey="name" outerRadius={100} label>
                    {overallPie.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => KRW(Number(val))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-sm text-slate-500">월급에서 직접 입력한 배정금액과 남는 금액을 표시합니다.</p>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
