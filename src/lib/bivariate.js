// Tertile-classification helpers used by the dual-encoding pattern overlay.
// (Was the home of a 9-color bivariate palette before color+pattern replaced it.)

function quantile(sorted, p) {
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function computeTertiles(values) {
  const clean = values.filter(v => v !== null && v !== undefined && !Number.isNaN(v))
                      .slice()
                      .sort((a, b) => a - b);
  if (clean.length === 0) return [null, null];
  const t1 = quantile(clean, 1 / 3);
  const t2 = quantile(clean, 2 / 3);
  return [t1, t2];
}

export function classifyTertile(value, breaks) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const [t1, t2] = breaks;
  if (value <= t1) return 0;
  if (value <= t2) return 1;
  return 2;
}
