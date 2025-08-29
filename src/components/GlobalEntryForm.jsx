/* eslint-disable */
import React, { useEffect, useState } from "react";
import { todayStr } from "../utils/format";

export default function GlobalEntryForm({ categories, selectedDate, onAdd }) {
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
