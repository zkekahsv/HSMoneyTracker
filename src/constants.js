export const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];
export const DEFAULT_GROUPS = [
  { id: "salary",  name: "월급통장", type: "salary",  pool: 0 },
  { id: "savings", name: "저축통장", type: "generic", pool: 0 },
];
export const DEFAULT_CATEGORIES = [
  { id: "living",    name: "생활비 통장", amount: 0, groupId: "salary", bankName: "" },
  { id: "academy",   name: "학원비 통장", amount: 0, groupId: "salary", bankName: "" },
  { id: "food",      name: "밥값 통장",   amount: 0, groupId: "salary", bankName: "" },
  { id: "phone",     name: "통신비 통장", amount: 0, groupId: "salary", bankName: "" },
  { id: "allowance", name: "용돈 통장",   amount: 0, groupId: "salary", bankName: "" },
  { id: "siu",       name: "시우 통장",   amount: 0, groupId: "savings", bankName: "" },
  { id: "seonwoo",   name: "선우 통장",   amount: 0, groupId: "savings", bankName: "" },
];
export const MAIN_CAT_ID = (groupId) => `main_${groupId}`;
export const MEMO_SALARY = (groupId, ym) => `SALARY:${groupId}:${ym}`;
export const MEMO_ALLOC  = (groupId, catId, ym) => `ALLOC:${groupId}:${catId}:${ym}`;
