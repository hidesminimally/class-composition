// Build a MapLibre paint expression for the 9-color bivariate fill.
// Pulled out of Map.jsx so it can be unit-tested without rendering.

import { BIVARIATE_PALETTE } from './bivariate';

export function buildBivariateFillExpr(baseMetric, overlayMetric, xBreaks, yBreaks, selectedLocals) {
  if (!xBreaks || !yBreaks || xBreaks[0] == null || yBreaks[0] == null) return null;

  const xClassExpr = ['case',
    ['<=', ['coalesce', ['get', baseMetric], -1e9], xBreaks[0]], 0,
    ['<=', ['coalesce', ['get', baseMetric], -1e9], xBreaks[1]], 1,
    2,
  ];
  const yClassExpr = ['case',
    ['<=', ['coalesce', ['get', overlayMetric], -1e9], yBreaks[0]], 0,
    ['<=', ['coalesce', ['get', overlayMetric], -1e9], yBreaks[1]], 1,
    2,
  ];
  const keyExpr = ['concat', ['to-string', xClassExpr], '-', ['to-string', yClassExpr]];
  const colorMatch = ['match', keyExpr];
  for (let y = 0; y <= 2; y++) {
    for (let x = 0; x <= 2; x++) {
      colorMatch.push(`${x}-${y}`, BIVARIATE_PALETTE[y][x]);
    }
  }
  colorMatch.push('#eee');

  return ['case',
    ['in', ['get', 'tanc_local'], ['literal', selectedLocals || []]],
    colorMatch,
    '#eee',
  ];
}
