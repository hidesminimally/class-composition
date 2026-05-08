// Dual-encoding paint helpers — color is the base metric (continuous,
// shown by the existing univariate fill); pattern density encodes the
// second metric (tertile-classified hatch overlay).

// Filter expression for the pattern overlay layer. We render hatching
// only on tracts that (a) belong to a selected local and (b) sit in the
// upper two tertiles of the second metric — tertile 0 stays unhatched
// so a low value of the second metric reads as "color only".
export function buildPatternFilter(overlayMetric, yBreaks, selectedLocals) {
  if (!overlayMetric || overlayMetric === 'none') return ['==', ['literal', 1], 0];
  if (!yBreaks || yBreaks[0] == null) return ['==', ['literal', 1], 0];
  return ['all',
    ['in', ['get', 'tanc_local'], ['literal', selectedLocals || []]],
    ['has', overlayMetric],
    ['>', ['coalesce', ['get', overlayMetric], -1e9], yBreaks[0]],
  ];
}

// Paint expression: pick hatch-mid for the middle tertile, hatch-dense for
// the top tertile. The filter above ensures we never hit tertile 0 here.
export function buildPatternExpr(overlayMetric, yBreaks) {
  if (!overlayMetric || !yBreaks || yBreaks[0] == null) return null;
  return ['case',
    ['<=', ['coalesce', ['get', overlayMetric], -1e9], yBreaks[1]], 'hatch-mid',
    'hatch-dense',
  ];
}
