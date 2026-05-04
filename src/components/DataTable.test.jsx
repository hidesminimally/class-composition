import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DataTable from './DataTable';

const mkFeature = (props) => ({
  properties: props,
  geometry: { type: 'Polygon', coordinates: [[[-122,37],[-121,37],[-121,38],[-122,38],[-122,37]]] },
});

describe('DataTable', () => {
  it('renders one row per feature with id and metrics', () => {
    const features = [
      mkFeature({ id: '400100', tanc_local: 'Berkeley', rent_burden: 50, unemployment: 5, total_pop: 3000, pct_black: 25, pct_hispanic: 22, pct_asian: 15 }),
      mkFeature({ id: '400200', tanc_local: 'Oakland', rent_burden: 70, unemployment: 8, total_pop: 5000, pct_black: 50, pct_hispanic: 12, pct_asian: 10 }),
    ];
    render(
      <DataTable features={features} isExpanded={true} onToggleExpanded={() => {}}
        sortKey="rent_burden" sortAsc={false} onSort={() => {}}
        selectedId={null} onSelect={() => {}} mobileActive={false} />
    );
    expect(screen.getByText('400100')).toBeTruthy();
    expect(screen.getByText('400200')).toBeTruthy();
    expect(screen.getByText('Berkeley')).toBeTruthy();
  });

  it('clicking a row passes the FULL feature (with geometry) to onSelect — regression test', () => {
    const features = [mkFeature({ id: '400100', tanc_local: 'Berkeley', rent_burden: 50 })];
    const onSelect = vi.fn();
    render(
      <DataTable features={features} isExpanded={true} onToggleExpanded={() => {}}
        sortKey="rent_burden" sortAsc={false} onSort={() => {}}
        selectedId={null} onSelect={onSelect} mobileActive={false} />
    );
    fireEvent.click(screen.getByText('400100'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    const arg = onSelect.mock.calls[0][0];
    expect(arg.geometry).toBeDefined();
    expect(arg.geometry.type).toBe('Polygon');
    expect(arg.geometry.coordinates[0][0]).toEqual([-122, 37]);
    expect(arg.properties.id).toBe('400100');
  });

  it('does NOT pass a fake (-122,37) coordinate (regression on the old bug)', () => {
    const features = [mkFeature({ id: '400100', tanc_local: 'Berkeley', rent_burden: 50 })];
    // Use a polygon NOT centered on the old hardcoded fake coord
    features[0].geometry = { type: 'Polygon', coordinates: [[[-50,40],[-49,40],[-49,41],[-50,40]]] };
    const onSelect = vi.fn();
    render(
      <DataTable features={features} isExpanded={true} onToggleExpanded={() => {}}
        sortKey="rent_burden" sortAsc={false} onSort={() => {}}
        selectedId={null} onSelect={onSelect} mobileActive={false} />
    );
    fireEvent.click(screen.getByText('400100'));
    const arg = onSelect.mock.calls[0][0];
    expect(arg.geometry.coordinates[0][0]).not.toEqual([-122, 37]);
  });

  it('clicking sort header calls onSort with the right key', () => {
    const features = [mkFeature({ id: '1', tanc_local: 'X', rent_burden: 0, unemployment: 0, total_pop: 0, pct_black: 0, pct_hispanic: 0, pct_asian: 0 })];
    const onSort = vi.fn();
    render(
      <DataTable features={features} isExpanded={true} onToggleExpanded={() => {}}
        sortKey="rent_burden" sortAsc={false} onSort={onSort}
        selectedId={null} onSelect={() => {}} mobileActive={false} />
    );
    fireEvent.click(screen.getByText(/Burden/));
    expect(onSort).toHaveBeenCalledWith('rent_burden');
    fireEvent.click(screen.getByText(/Unemp/));
    expect(onSort).toHaveBeenCalledWith('unemployment');
  });

  it('shows row count in header', () => {
    const features = [
      mkFeature({ id: '1', tanc_local: 'X', rent_burden: 0, unemployment: 0, total_pop: 0, pct_black: 0, pct_hispanic: 0, pct_asian: 0 }),
      mkFeature({ id: '2', tanc_local: 'Y', rent_burden: 0, unemployment: 0, total_pop: 0, pct_black: 0, pct_hispanic: 0, pct_asian: 0 }),
    ];
    render(
      <DataTable features={features} isExpanded={true} onToggleExpanded={() => {}}
        sortKey="rent_burden" sortAsc={false} onSort={() => {}}
        selectedId={null} onSelect={() => {}} mobileActive={false} />
    );
    expect(screen.getByText('2 rows')).toBeTruthy();
  });

  it('applies "selected" class when selectedId matches', () => {
    const features = [mkFeature({ id: '400100', tanc_local: 'X', rent_burden: 0, unemployment: 0, total_pop: 0, pct_black: 0, pct_hispanic: 0, pct_asian: 0 })];
    const { container } = render(
      <DataTable features={features} isExpanded={true} onToggleExpanded={() => {}}
        sortKey="rent_burden" sortAsc={false} onSort={() => {}}
        selectedId="400100" onSelect={() => {}} mobileActive={false} />
    );
    const row = container.querySelector('tr.selected');
    expect(row).toBeTruthy();
  });

  it('handles empty features list without crashing', () => {
    expect(() =>
      render(
        <DataTable features={[]} isExpanded={true} onToggleExpanded={() => {}}
          sortKey="rent_burden" sortAsc={false} onSort={() => {}}
          selectedId={null} onSelect={() => {}} mobileActive={false} />
      )
    ).not.toThrow();
  });
});
