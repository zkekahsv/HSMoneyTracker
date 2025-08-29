// Normalize an array of values into percentages summing to 100.0 with 0.1% granularity
export function normalizePercents(values) {
  const safeVals = values.map((v) => Math.max(0, Number(v) || 0));
  const total = safeVals.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = safeVals.map((v) => (v / total) * 100);
  const base = raw.map((p) => Math.floor(p * 10) / 10);
  let delta = Math.round((100 - base.reduce((s, p) => s + p, 0)) * 10) / 10;
  const fracs = raw.map((p, i) => ({ i, frac: Math.round((p * 10 - Math.floor(p * 10)) * 1000) }));
  fracs.sort((a, b) => b.frac - a.frac);
  let idx = 0;
  while (delta > 0 && idx < fracs.length) {
    base[fracs[idx].i] = Math.round((base[fracs[idx].i] + 0.1) * 10) / 10;
    delta = Math.round((100 - base.reduce((s, p) => s + p, 0)) * 10) / 10;
    idx++;
  }
  return base;
}
