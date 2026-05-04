import { describe, it, expect } from 'vitest';
import { calculateAggregate } from './aggregate';

const mkFeature = (props) => ({
  type: 'Feature',
  properties: props,
  geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] },
});

describe('calculateAggregate', () => {
  it('returns null when features list is empty or undefined', () => {
    expect(calculateAggregate([], 'X')).toBeNull();
    expect(calculateAggregate(null, 'X')).toBeNull();
    expect(calculateAggregate(undefined, 'X')).toBeNull();
  });

  it('returns null when no features match the local name', () => {
    const features = [mkFeature({ tanc_local: 'A', total_pop: 100 })];
    expect(calculateAggregate(features, 'B')).toBeNull();
  });

  it('sets id=AGGREGATE and copies tanc_local + tract_count', () => {
    const features = [
      mkFeature({ tanc_local: 'X', total_pop: 100, rent_burden: 30 }),
      mkFeature({ tanc_local: 'X', total_pop: 200, rent_burden: 60 }),
    ];
    const agg = calculateAggregate(features, 'X');
    expect(agg.id).toBe('AGGREGATE');
    expect(agg.tanc_local).toBe('X');
    expect(agg.tract_count).toBe(2);
  });

  it('sums total_pop and eviction_filings across tracts', () => {
    const features = [
      mkFeature({ tanc_local: 'X', total_pop: 100, eviction_filings: 5 }),
      mkFeature({ tanc_local: 'X', total_pop: 250, eviction_filings: 12 }),
      mkFeature({ tanc_local: 'X', total_pop: 0,   eviction_filings: 0 }),
    ];
    const agg = calculateAggregate(features, 'X');
    expect(agg.total_pop).toBe(350);
    expect(agg.eviction_filings).toBe(17);
  });

  it('weights percentage fields by total_pop', () => {
    // Tract A: pop=100, burden=20 → contribution 2000
    // Tract B: pop=300, burden=80 → contribution 24000
    // Weighted avg = 26000 / 400 = 65
    const features = [
      mkFeature({ tanc_local: 'X', total_pop: 100, rent_burden: 20 }),
      mkFeature({ tanc_local: 'X', total_pop: 300, rent_burden: 80 }),
    ];
    const agg = calculateAggregate(features, 'X');
    expect(agg.rent_burden).toBe(65);
  });

  it('rounds dollar fields to integers', () => {
    const features = [
      mkFeature({ tanc_local: 'X', total_pop: 100, median_gross_rent: 1500 }),
      mkFeature({ tanc_local: 'X', total_pop: 100, median_gross_rent: 2200 }),
    ];
    const agg = calculateAggregate(features, 'X');
    expect(Number.isInteger(agg.median_gross_rent)).toBe(true);
    expect(agg.median_gross_rent).toBe(1850);
  });

  it('filters out other locals when computing weighted average', () => {
    const features = [
      mkFeature({ tanc_local: 'X', total_pop: 100, rent_burden: 50 }),
      mkFeature({ tanc_local: 'Y', total_pop: 100, rent_burden: 99 }),
    ];
    const agg = calculateAggregate(features, 'X');
    expect(agg.rent_burden).toBe(50);
    expect(agg.tract_count).toBe(1);
  });

  it('skips null/undefined values in weighted average', () => {
    const features = [
      mkFeature({ tanc_local: 'X', total_pop: 100, rent_burden: 50 }),
      mkFeature({ tanc_local: 'X', total_pop: 100, rent_burden: null }),
      mkFeature({ tanc_local: 'X', total_pop: 100, rent_burden: undefined }),
    ];
    const agg = calculateAggregate(features, 'X');
    // Only first tract contributes — avg = 50
    expect(agg.rent_burden).toBe(50);
  });

  it('returns null for percentage field when all values are null', () => {
    const features = [
      mkFeature({ tanc_local: 'X', total_pop: 100, rent_burden: null }),
      mkFeature({ tanc_local: 'X', total_pop: 100, rent_burden: null }),
    ];
    const agg = calculateAggregate(features, 'X');
    expect(agg.rent_burden).toBeNull();
  });

  it('returns null for weighted field when total_pop is 0', () => {
    const features = [
      mkFeature({ tanc_local: 'X', total_pop: 0, rent_burden: 50 }),
    ];
    const agg = calculateAggregate(features, 'X');
    expect(agg.rent_burden).toBeNull();
  });

  it('computes simple mean for delta fields (NOT weighted)', () => {
    const features = [
      mkFeature({ tanc_local: 'X', total_pop: 100, total_pop_delta_pct: 10 }),
      mkFeature({ tanc_local: 'X', total_pop: 1, total_pop_delta_pct: 50 }),
    ];
    const agg = calculateAggregate(features, 'X');
    // Simple mean: (10 + 50) / 2 = 30
    expect(agg.total_pop_delta_pct).toBe(30);
  });

  it('returns null for delta field when all values are null', () => {
    const features = [
      mkFeature({ tanc_local: 'X', total_pop: 100, median_gross_rent_delta_pct: null }),
    ];
    const agg = calculateAggregate(features, 'X');
    expect(agg.median_gross_rent_delta_pct).toBeNull();
  });

  it('populates all expected percentage fields (the previously-missing 14)', () => {
    const features = [
      mkFeature({
        tanc_local: 'X', total_pop: 100,
        rent_burden: 40, unemployment: 5, poverty_rate: 12,
        vacancy_rate: 8, occupancy_rate: 92,
        pct_white: 30, pct_black: 25, pct_hispanic: 25, pct_asian: 20,
        pct_lang_english_only: 70,
        pct_lor_2019_or_later: 15,
        avg_household_size: 2.4,
        median_year_built: 1965,
        median_gross_rent: 2000, median_hh_income: 80000,
      }),
    ];
    const agg = calculateAggregate(features, 'X');
    expect(agg.rent_burden).toBe(40);
    expect(agg.poverty_rate).toBe(12);
    expect(agg.vacancy_rate).toBe(8);
    expect(agg.occupancy_rate).toBe(92);
    expect(agg.pct_lang_english_only).toBe(70);
    expect(agg.pct_lor_2019_or_later).toBe(15);
    expect(agg.avg_household_size).toBe(2.4);
    expect(agg.median_year_built).toBe(1965);
    expect(agg.median_gross_rent).toBe(2000);
    expect(agg.median_hh_income).toBe(80000);
  });

  it('handles eviction_filings being entirely null without breaking', () => {
    const features = [
      mkFeature({ tanc_local: 'X', total_pop: 100, eviction_filings: null }),
    ];
    const agg = calculateAggregate(features, 'X');
    expect(agg.eviction_filings).toBeNull();
    expect(agg.total_pop).toBe(100);
  });

  it('handles three tracts with mixed nulls in delta', () => {
    const features = [
      mkFeature({ tanc_local: 'X', total_pop: 100, pct_black_delta_pct: 20 }),
      mkFeature({ tanc_local: 'X', total_pop: 100, pct_black_delta_pct: -10 }),
      mkFeature({ tanc_local: 'X', total_pop: 100, pct_black_delta_pct: null }),
    ];
    const agg = calculateAggregate(features, 'X');
    // Mean of available: (20 + -10) / 2 = 5
    expect(agg.pct_black_delta_pct).toBe(5);
  });
});
