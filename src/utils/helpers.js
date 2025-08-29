export const COLORS = ["#4f46e5", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];
export const KRW = (v) => (isNaN(v) ? "-" : Number(v).toLocaleString("ko-KR") + "원");
export const todayStr = () => new Date().toISOString().slice(0, 10);
export const thisYM = () => new Date().toISOString().slice(0, 7);
export const shiftYM = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
};
export function normalizePercents(values) {
  const safeVals = values.map((v) => Math.max(0, Number(v) || 0));
  const total = safeVals.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = safeVals.map((v) => (v / total) * 100);
  return raw.map((p) => Math.round(p * 10) / 10);
}
export const fmtPct = (p) => `${(Number(p) || 0).toFixed(1)}%`;
