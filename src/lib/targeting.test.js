import { describe, it, expect } from 'vitest';
import { applyThresholds, getCentroid, featureToExportRow } from './targeting';

const mkFeature = (props, geometry) => ({
  properties: props,
  geometry: geometry ?? { type: 'Polygon', coordinates: [[[-122,37],[-121,37],[-121,38],[-122,38],[-122,37]]] },
});

describe('applyThresholds', () => {
  it('returns all features when thresholds are all zero', () => {
    const features = [
      mkFeature({ rent_burden: 50 }),
      mkFeature({ rent_burden: 10 }),
    ];
    const out = applyThresholds(features, { rent_burden: 0, unemployment: 0 });
    expect(out.length).toBe(2);
  });

  it('keeps only features at-or-above each non-zero threshold', () => {
    const features = [
      mkFeature({ rent_burden: 50, unemployment: 5 }),
      mkFeature({ rent_burden: 10, unemployment: 5 }),
      mkFeature({ rent_burden: 60, unemployment: 2 }),
    ];
    const out = applyThresholds(features, { rent_burden: 30, unemployment: 4 });
    expect(out.length).toBe(1);
    expect(out[0].properties.rent_burden).toBe(50);
  });

  it('excludes a feature when a threshold-key value is null', () => {
    const features = [
      mkFeature({ rent_burden: 50 }),
      mkFeature({ rent_burden: null }),
      mkFeature({ rent_burden: undefined }),
    ];
    const out = applyThresholds(features, { rent_burden: 30 });
    expect(out.length).toBe(1);
  });

  it('does not mutate the input array', () => {
    const features = [mkFeature({ rent_burden: 50 })];
    const len = features.length;
    applyThresholds(features, { rent_burden: 100 });
    expect(features.length).toBe(len);
  });

  it('returns empty array for null input', () => {
    expect(applyThresholds(null, { rent_burden: 30 })).toEqual([]);
  });

  it('boundary value (equal to threshold) is included', () => {
    const features = [mkFeature({ rent_burden: 30 })];
    expect(applyThresholds(features, { rent_burden: 30 }).length).toBe(1);
  });

  it('handles multiple thresholds combined as AND', () => {
    const features = [
      mkFeature({ rent_burden: 60, pct_black: 50 }),
      mkFeature({ rent_burden: 60, pct_black: 10 }),
      mkFeature({ rent_burden: 20, pct_black: 50 }),
    ];
    const out = applyThresholds(features, { rent_burden: 50, pct_black: 30 });
    expect(out.length).toBe(1);
    expect(out[0].properties.pct_black).toBe(50);
  });
});

describe('getCentroid', () => {
  it('returns null for missing geometry', () => {
    expect(getCentroid(null)).toBeNull();
    expect(getCentroid(undefined)).toBeNull();
    expect(getCentroid({})).toBeNull();
  });

  it('computes mean of polygon ring vertices', () => {
    // Square 0,0 -> 1,0 -> 1,1 -> 0,1 -> 0,0 → mean ≈ (0.4, 0.4) including the duplicate first point
    const geom = { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] };
    const c = getCentroid(geom);
    expect(c[0]).toBeCloseTo(0.4, 1);
    expect(c[1]).toBeCloseTo(0.4, 1);
  });

  it('rounds to 5 decimals', () => {
    const geom = { type: 'Polygon', coordinates: [[[-122.123456789, 37.987654321], [-121, 37], [-121, 38], [-122.123456789, 37.987654321]]] };
    const [x, y] = getCentroid(geom);
    expect(String(x)).toMatch(/^-?\d+(\.\d{1,5})?$/);
    expect(String(y)).toMatch(/^-?\d+(\.\d{1,5})?$/);
  });

  it('handles MultiPolygon by using the first ring of the first polygon', () => {
    const geom = {
      type: 'MultiPolygon',
      coordinates: [
        [[[0,0],[2,0],[2,2],[0,2],[0,0]]],
        [[[10,10],[11,10],[11,11],[10,11],[10,10]]],
      ],
    };
    const c = getCentroid(geom);
    // First polygon's ring is the 0..2 square (5 points, last = first)
    // Mean x = (0+2+2+0+0)/5 = 0.8 ; ditto y
    expect(c[0]).toBeCloseTo(0.8, 1);
    expect(c[1]).toBeCloseTo(0.8, 1);
  });

  it('returns null for empty ring', () => {
    expect(getCentroid({ type: 'Polygon', coordinates: [[]] })).toBeNull();
  });

  it('returns null for unknown geometry type', () => {
    expect(getCentroid({ type: 'Point', coordinates: [0, 0] })).toBeNull();
  });

  it('skips malformed coordinate pairs', () => {
    const geom = { type: 'Polygon', coordinates: [[[0,0],null,[2,2],undefined]] };
    const c = getCentroid(geom);
    // Only [0,0] and [2,2] count → (1, 1)
    expect(c[0]).toBeCloseTo(1, 1);
    expect(c[1]).toBeCloseTo(1, 1);
  });
});

describe('featureToExportRow', () => {
  it('flattens properties and adds _centroid', () => {
    const f = mkFeature({ id: '400100', rent_burden: 50 });
    const row = featureToExportRow(f);
    expect(row.id).toBe('400100');
    expect(row.rent_burden).toBe(50);
    expect(row._centroid).toBeDefined();
    expect(Array.isArray(row._centroid)).toBe(true);
  });

  it('handles missing geometry by setting _centroid=null', () => {
    const f = { properties: { id: '1' }, geometry: null };
    const row = featureToExportRow(f);
    expect(row._centroid).toBeNull();
  });

  it('handles missing properties by returning bare object with _centroid', () => {
    const f = { geometry: { type: 'Polygon', coordinates: [[[0,0],[1,1],[0,0]]] } };
    const row = featureToExportRow(f);
    expect(row._centroid).toBeDefined();
  });
});
