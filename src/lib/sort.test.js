import { describe, it, expect } from 'vitest';
import { sortFeatures, filterByLocals } from './sort';

const mkFeature = (props) => ({ properties: props, geometry: { type: 'Polygon', coordinates: [[[0,0]]] } });

describe('sortFeatures', () => {
  it('returns empty array for empty/null input', () => {
    expect(sortFeatures([], 'rent_burden')).toEqual([]);
    expect(sortFeatures(null, 'rent_burden')).toEqual([]);
    expect(sortFeatures(undefined, 'rent_burden')).toEqual([]);
  });

  it('preserves geometry on every feature (regression: previous code stripped it)', () => {
    const features = [
      mkFeature({ id: '1', rent_burden: 30 }),
      mkFeature({ id: '2', rent_burden: 50 }),
    ];
    const sorted = sortFeatures(features, 'rent_burden');
    for (const f of sorted) {
      expect(f.geometry).toBeDefined();
      expect(f.geometry.type).toBe('Polygon');
    }
  });

  it('sorts descending by default', () => {
    const features = [
      mkFeature({ id: '1', rent_burden: 30 }),
      mkFeature({ id: '2', rent_burden: 70 }),
      mkFeature({ id: '3', rent_burden: 50 }),
    ];
    const sorted = sortFeatures(features, 'rent_burden');
    expect(sorted.map(f => f.properties.id)).toEqual(['2', '3', '1']);
  });

  it('sorts ascending when sortAsc=true', () => {
    const features = [
      mkFeature({ id: '1', rent_burden: 30 }),
      mkFeature({ id: '2', rent_burden: 70 }),
    ];
    const sorted = sortFeatures(features, 'rent_burden', true);
    expect(sorted.map(f => f.properties.id)).toEqual(['1', '2']);
  });

  it('does not mutate the input array', () => {
    const features = [
      mkFeature({ id: '1', rent_burden: 30 }),
      mkFeature({ id: '2', rent_burden: 70 }),
    ];
    const before = features.map(f => f.properties.id);
    sortFeatures(features, 'rent_burden');
    expect(features.map(f => f.properties.id)).toEqual(before);
  });

  it('pushes null/undefined values to the bottom in both directions', () => {
    const features = [
      mkFeature({ id: '1', rent_burden: null }),
      mkFeature({ id: '2', rent_burden: 50 }),
      mkFeature({ id: '3', rent_burden: undefined }),
      mkFeature({ id: '4', rent_burden: 30 }),
    ];
    const desc = sortFeatures(features, 'rent_burden');
    expect(desc[0].properties.id).toBe('2');
    expect(desc[1].properties.id).toBe('4');
    // last two are nulls in some order
    expect(['1', '3']).toContain(desc[2].properties.id);
    expect(['1', '3']).toContain(desc[3].properties.id);
  });

  it('sorts strings alphabetically', () => {
    const features = [
      mkFeature({ id: '1', tanc_local: 'Berkeley' }),
      mkFeature({ id: '2', tanc_local: 'Alameda' }),
    ];
    const asc = sortFeatures(features, 'tanc_local', true);
    expect(asc.map(f => f.properties.tanc_local)).toEqual(['Alameda', 'Berkeley']);
  });
});

describe('filterByLocals', () => {
  it('returns all features when selectedLocals is empty', () => {
    const features = [
      mkFeature({ id: '1', tanc_local: 'A' }),
      mkFeature({ id: '2', tanc_local: 'B' }),
    ];
    expect(filterByLocals(features, []).length).toBe(2);
    expect(filterByLocals(features, null).length).toBe(2);
  });

  it('keeps only features whose local is in the set', () => {
    const features = [
      mkFeature({ id: '1', tanc_local: 'A' }),
      mkFeature({ id: '2', tanc_local: 'B' }),
      mkFeature({ id: '3', tanc_local: 'C' }),
    ];
    const out = filterByLocals(features, ['A', 'C']);
    expect(out.map(f => f.properties.id)).toEqual(['1', '3']);
  });

  it('preserves geometry on retained features', () => {
    const features = [mkFeature({ id: '1', tanc_local: 'A' })];
    const out = filterByLocals(features, ['A']);
    expect(out[0].geometry).toBeDefined();
  });

  it('returns empty array for null/undefined input', () => {
    expect(filterByLocals(null, ['A'])).toEqual([]);
    expect(filterByLocals(undefined, ['A'])).toEqual([]);
  });
});
