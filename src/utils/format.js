export const KRW = (v) => (isNaN(v) ? "-" : Number(v).toLocaleString("ko-KR") + "원");
export const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
export const thisYM = () => new Date().toISOString().slice(0, 7);
export const shiftYM = (ym, delta) => {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  const d = new Date(y, m - 1 + delta, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
};
export const clampDay = (ym, day) => {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  const last = new Date(y, m, 0).getDate();
  const d = Math.max(1, Math.min(last, Number(day) || 1));
  return String(d).padStart(2, "0");
};
export const fmtPct = (p) => `${(Number(p) || 0).toFixed(1)}%`;
