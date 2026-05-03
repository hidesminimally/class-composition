import { describe, it, expect } from 'vitest';
import { computeTertiles, classifyTertile, bivariateColor, BIVARIATE_PALETTE } from './bivariate';

describe('computeTertiles', () => {
  it('returns two breakpoints for a sorted set', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const [t1, t2] = computeTertiles(values);
    expect(t1).toBeCloseTo(3.67, 1);
    expect(t2).toBeCloseTo(6.33, 1);
  });

  it('ignores null/undefined', () => {
    const values = [1, 2, null, 3, undefined, 4, 5, 6, 7, 8, 9];
    const [t1, t2] = computeTertiles(values);
    expect(t1).toBeCloseTo(3.67, 1);
    expect(t2).toBeCloseTo(6.33, 1);
  });

  it('returns nulls for empty input', () => {
    expect(computeTertiles([])).toEqual([null, null]);
  });
});

describe('classifyTertile', () => {
  it('returns 0 for low, 1 for mid, 2 for high', () => {
    const breaks = [3.67, 6.33];
    expect(classifyTertile(2, breaks)).toBe(0);
    expect(classifyTertile(5, breaks)).toBe(1);
    expect(classifyTertile(8, breaks)).toBe(2);
  });

  it('boundaries go to lower class', () => {
    const breaks = [3.67, 6.33];
    expect(classifyTertile(3.67, breaks)).toBe(0);
    expect(classifyTertile(6.33, breaks)).toBe(1);
  });

  it('returns null for null/undefined value', () => {
    expect(classifyTertile(null, [1, 2])).toBeNull();
  });
});

describe('bivariateColor', () => {
  it('returns the 9-color palette indexed (xClass, yClass)', () => {
    expect(bivariateColor(0, 0)).toBe(BIVARIATE_PALETTE[0][0]);
    expect(bivariateColor(2, 2)).toBe(BIVARIATE_PALETTE[2][2]);
    expect(bivariateColor(1, 0)).toBe(BIVARIATE_PALETTE[0][1]);
  });

  it('returns null when either class is null', () => {
    expect(bivariateColor(null, 0)).toBeNull();
    expect(bivariateColor(0, null)).toBeNull();
  });
});
