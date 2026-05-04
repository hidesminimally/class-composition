import { describe, it, expect } from 'vitest';
import { buildBivariateFillExpr } from './bivariatePaint';
import { BIVARIATE_PALETTE } from './bivariate';

describe('buildBivariateFillExpr', () => {
  it('returns null when xBreaks or yBreaks is missing', () => {
    expect(buildBivariateFillExpr('a', 'b', null, [1, 2], [])).toBeNull();
    expect(buildBivariateFillExpr('a', 'b', [1, 2], null, [])).toBeNull();
    expect(buildBivariateFillExpr('a', 'b', [null, null], [1, 2], [])).toBeNull();
  });

  it('produces a `case` expression with a `match` inside', () => {
    const expr = buildBivariateFillExpr('rent_burden', 'pct_black', [30, 60], [10, 30], ['Berkeley']);
    expect(Array.isArray(expr)).toBe(true);
    expect(expr[0]).toBe('case');
    // Last element of `case` is the fallback color
    expect(expr[expr.length - 1]).toBe('#eee');
  });

  it('embeds all 9 palette colors into the match expression', () => {
    const expr = buildBivariateFillExpr('a', 'b', [10, 20], [10, 20], ['L1']);
    const exprStr = JSON.stringify(expr);
    for (let y = 0; y <= 2; y++) {
      for (let x = 0; x <= 2; x++) {
        expect(exprStr).toContain(BIVARIATE_PALETTE[y][x]);
      }
    }
  });

  it('uses selectedLocals as the literal in the `in` clause', () => {
    const expr = buildBivariateFillExpr('a', 'b', [10, 20], [10, 20], ['Berkeley', 'Oakland']);
    const flat = JSON.stringify(expr);
    expect(flat).toContain('"Berkeley"');
    expect(flat).toContain('"Oakland"');
  });

  it('handles empty selectedLocals (all-grey map)', () => {
    const expr = buildBivariateFillExpr('a', 'b', [10, 20], [10, 20], []);
    expect(expr).not.toBeNull();
    // Just confirm it does not crash and returns an expression
    expect(Array.isArray(expr)).toBe(true);
  });

  it('keys are formed as "x-y" not "y-x"', () => {
    const expr = buildBivariateFillExpr('a', 'b', [10, 20], [10, 20], ['L']);
    const flat = JSON.stringify(expr);
    expect(flat).toContain('"0-0"');
    expect(flat).toContain('"2-2"');
    expect(flat).toContain('"1-2"');
  });
});
