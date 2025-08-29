import { MAIN_CAT_ID, MEMO_ALLOC, MEMO_SALARY } from "../constants";
import { clampDay } from "../utils/format";

const isSalaryMemo = (memo, groupId, ym) => memo === MEMO_SALARY(groupId, ym);

export function ensureMainCats(model) {
  const groups = model.groups || [];
  const cats = (model.categories || []).map(c => ({
    bankName: "",
    ...c,
    bankName: typeof c.bankName === "string" ? c.bankName : ""
  }));
  const ids = new Set(cats.map((c) => c.id));
  const add = [];
  groups.forEach((g) => {
    const id = MAIN_CAT_ID(g.id);
    if (!ids.has(id)) add.push({ id, name: `${g.name} (메인)`, amount: 0, groupId: g.id, isMain: true, bankName: "" });
  });
  return add.length ? { ...model, categories: [...cats, ...add] } : { ...model, categories: cats };
}

export function initialMonthlyModel(ym, defaults) {
  const { DEFAULT_GROUPS, DEFAULT_CATEGORIES, MAIN_CAT_ID } = defaults;
  return {
    month: ym,
    groups: DEFAULT_GROUPS.map((g) => ({ ...g })),
    categories: [
      ...DEFAULT_GROUPS.map((g) => ({ id: MAIN_CAT_ID(g.id), name: `${g.name} (메인)`, amount: 0, groupId: g.id, isMain: true, bankName: "" })),
      ...DEFAULT_CATEGORIES.map((c) => ({ ...c, isMain: false })),
    ],
    entries: {},
  };
}

export function applyAutomations(model, ym) {
  let m = ensureMainCats({ ...model, categories: [...(model.categories || [])] });
  m.entries = { ...(m.entries || {}) };

  // 1) remove our auto SALARY/ALLOC memos for current month
  (m.categories || []).forEach((cat) => {
    const arr = m.entries[cat.id] || [];
    m.entries[cat.id] = arr.filter((e) => {
      if (!e?.memo) return true;
      if (m.groups.some((g) => isSalaryMemo(e.memo, g.id, ym))) return false;
      const parts = e.memo.split(":");
      if (parts[0] === "ALLOC" && e.date?.startsWith(ym + "-")) return false;
      return true;
    });
  });

  // 2) salary income on 25th
  m.groups
    .filter((g) => g.type === "salary")
    .forEach((g) => {
      const mainCat = MAIN_CAT_ID(g.id);
      const amount = Number(g.pool) || 0;
      if (amount <= 0) return;
      const date = `${ym}-${clampDay(ym, 25)}`;
      const entry = { date, amount, memo: MEMO_SALARY(g.id, ym), type: "income" };
      m.entries[mainCat] = [...(m.entries[mainCat] || []), entry];
    });

  // 3) allocation on 26th
  m.groups.forEach((g) => {
    const mainCat = MAIN_CAT_ID(g.id);
    const date = `${ym}-${clampDay(ym, 26)}`;
    const subs = (m.categories || []).filter((c) => c.groupId === g.id && !c.isMain);
    subs.forEach((c) => {
      const allocAmt = Number(c.amount) || 0;
      if (allocAmt <= 0) return;
      const memo = MEMO_ALLOC(g.id, c.id, ym);
      const out = { date, amount: allocAmt, memo, type: "expense" };
      m.entries[mainCat] = [...(m.entries[mainCat] || []), out];
      const into = { date, amount: allocAmt, memo, type: "income" };
      m.entries[c.id] = [...(m.entries[c.id] || []), into];
    });
  });

  return m;
}
