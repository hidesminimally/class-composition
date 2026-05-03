// 3×3 bivariate palette (Joshua Stevens: bluepink scheme)
// Index [yClass][xClass] — y=0 (low) at row 0 to keep array literal readable top-down.
// In practice we render with yClass=0 at the *bottom* of the legend.
export const BIVARIATE_PALETTE = [
  ['#e8e8e8', '#b5c0da', '#6c83b5'], // y low  (bottom row in legend)
  ['#b8d6be', '#90b2b3', '#567994'], // y mid
  ['#73ae80', '#5a9178', '#2a5a5b'], // y high (top row in legend)
];

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

export function bivariateColor(xClass, yClass) {
  if (xClass === null || yClass === null) return null;
  return BIVARIATE_PALETTE[yClass][xClass];
}
