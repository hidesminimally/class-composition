import { describe, it, expect } from 'vitest';
import { buildPatternFilter, buildPatternExpr } from './dualEncodingPaint';

describe('buildPatternFilter', () => {
  it('returns an always-false filter when overlay is missing or "none"', () => {
    expect(buildPatternFilter(null, [10, 20], ['L'])).toEqual(['==', ['literal', 1], 0]);
    expect(buildPatternFilter('none', [10, 20], ['L'])).toEqual(['==', ['literal', 1], 0]);
  });

  it('returns an always-false filter when yBreaks are unusable', () => {
    expect(buildPatternFilter('m', null, ['L'])).toEqual(['==', ['literal', 1], 0]);
    expect(buildPatternFilter('m', [null, null], ['L'])).toEqual(['==', ['literal', 1], 0]);
  });

  it('only matches tracts in upper two tertiles within selected locals', () => {
    const f = buildPatternFilter('pct_black', [10, 30], ['Berkeley', 'Oakland']);
    const json = JSON.stringify(f);
    expect(json).toContain('"all"');
    expect(json).toContain('"in"');
    expect(json).toContain('"tanc_local"');
    expect(json).toContain('Berkeley');
    expect(json).toContain('Oakland');
    expect(json).toContain('">"');
    expect(json).toContain('10'); // lower break threshold
  });

  it('uses coalesce so missing values do not match', () => {
    const f = buildPatternFilter('m', [5, 15], ['L']);
    expect(JSON.stringify(f)).toContain('coalesce');
  });
});

describe('buildPatternExpr', () => {
  it('returns null when overlay or breaks are unusable', () => {
    expect(buildPatternExpr(null, [10, 20])).toBeNull();
    expect(buildPatternExpr('m', null)).toBeNull();
    expect(buildPatternExpr('m', [null, null])).toBeNull();
  });

  it('selects hatch-mid for middle tertile and hatch-dense for top', () => {
    const e = buildPatternExpr('pct_black', [10, 30]);
    const json = JSON.stringify(e);
    expect(json).toContain('hatch-mid');
    expect(json).toContain('hatch-dense');
    expect(json).toContain('30'); // upper break threshold for the case condition
  });
});
