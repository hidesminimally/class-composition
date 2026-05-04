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
    expect(classifyTertile(undefined, [1, 2])).toBeNull();
    expect(classifyTertile(NaN, [1, 2])).toBeNull();
  });

  it('classifies extreme values into outer classes', () => {
    expect(classifyTertile(-9999, [1, 2])).toBe(0);
    expect(classifyTertile(9999, [1, 2])).toBe(2);
  });
});

describe('computeTertiles edge cases', () => {
  it('handles a single value (both breaks equal that value)', () => {
    const [t1, t2] = computeTertiles([42]);
    expect(t1).toBe(42);
    expect(t2).toBe(42);
  });

  it('handles all-identical values', () => {
    const [t1, t2] = computeTertiles([5, 5, 5, 5]);
    expect(t1).toBe(5);
    expect(t2).toBe(5);
  });

  it('skips NaN values along with null/undefined', () => {
    const values = [1, 2, NaN, 3, null, 4, undefined, 5, 6, 7, 8, 9];
    const [t1, t2] = computeTertiles(values);
    expect(t1).toBeCloseTo(3.67, 1);
    expect(t2).toBeCloseTo(6.33, 1);
  });

  it('does not mutate the input array', () => {
    const values = [9, 1, 5, 3, 7];
    const before = [...values];
    computeTertiles(values);
    expect(values).toEqual(before);
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
