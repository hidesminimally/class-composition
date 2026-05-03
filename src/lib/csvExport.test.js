import { describe, it, expect } from 'vitest';
import { tractsToCsv, downloadCsv } from './csvExport';

describe('tractsToCsv', () => {
  it('produces a header row + one row per tract', () => {
    const tracts = [
      { id: '400100', tanc_local: 'Berkeley', rent_burden: 45, total_pop: 3000 },
      { id: '400200', tanc_local: 'Central', rent_burden: 50, total_pop: 4000 },
    ];
    const csv = tractsToCsv(tracts, ['id', 'tanc_local', 'rent_burden', 'total_pop']);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('id,tanc_local,rent_burden,total_pop');
    expect(lines[1]).toBe('400100,Berkeley,45,3000');
    expect(lines[2]).toBe('400200,Central,50,4000');
  });

  it('quotes values containing commas', () => {
    const tracts = [{ id: '400100', name: 'foo, bar' }];
    const csv = tractsToCsv(tracts, ['id', 'name']);
    expect(csv).toContain('"foo, bar"');
  });

  it('handles missing fields as empty', () => {
    const tracts = [{ id: '400100' }];
    const csv = tractsToCsv(tracts, ['id', 'rent_burden']);
    expect(csv).toBe('id,rent_burden\n400100,');
  });

  it('handles centroid as a special case', () => {
    const tracts = [{ id: '400100', _centroid: [-122.27, 37.80] }];
    const csv = tractsToCsv(tracts, ['id', '_centroid']);
    expect(csv).toContain('"-122.27, 37.8"');
  });
});
