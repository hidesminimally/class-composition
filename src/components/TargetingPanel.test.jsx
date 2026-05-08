import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TargetingPanel from './TargetingPanel';

const mkFeature = (props, geometry) => ({
  properties: props,
  geometry: geometry ?? { type: 'Polygon', coordinates: [[[-122,37],[-121,37],[-121,38],[-122,38],[-122,37]]] },
});

const baseProps = (props = {}) => ({
  id: '1', tanc_local: 'X',
  rent_burden: 0, unemployment: 0, poverty_rate: 0, eviction_rate: 0,
  pct_lor_2019_or_later: 0, pct_hispanic: 0, pct_black: 0, pct_asian: 0,
  ...props,
});

describe('TargetingPanel — render', () => {
  it('renders match count in header (no current local)', () => {
    const tracts = [
      mkFeature(baseProps({ id: '1' })),
      mkFeature(baseProps({ id: '2' })),
    ];
    render(<TargetingPanel tracts={tracts} currentLocal={null} onSelectTract={() => {}} />);
    expect(screen.getByText(/2 match/)).toBeTruthy();
  });

  it('shows current local in header when provided', () => {
    const tracts = [mkFeature(baseProps({ id: '1', tanc_local: 'Berkeley' }))];
    render(<TargetingPanel tracts={tracts} currentLocal="Berkeley" onSelectTract={() => {}} />);
    expect(screen.getByText(/TARGET TRACTS IN BERKELEY/)).toBeTruthy();
  });

  it('renders one row per tract', () => {
    const tracts = [
      mkFeature(baseProps({ id: '400100' })),
      mkFeature(baseProps({ id: '400200' })),
    ];
    render(<TargetingPanel tracts={tracts} currentLocal={null} onSelectTract={() => {}} />);
    expect(screen.getByText(/Tract 400100/)).toBeTruthy();
    expect(screen.getByText(/Tract 400200/)).toBeTruthy();
  });

  it('handles empty tracts list', () => {
    expect(() =>
      render(<TargetingPanel tracts={[]} currentLocal={null} onSelectTract={() => {}} />)
    ).not.toThrow();
    expect(screen.getByText(/0 match/)).toBeTruthy();
  });
});

describe('TargetingPanel — threshold filtering', () => {
  it('moving rent burden slider filters out tracts below threshold', () => {
    const tracts = [
      mkFeature(baseProps({ id: '1', rent_burden: 60 })),
      mkFeature(baseProps({ id: '2', rent_burden: 20 })),
    ];
    render(<TargetingPanel tracts={tracts} currentLocal={null} onSelectTract={() => {}} />);
    // Initially both visible
    expect(screen.getByText(/Tract 1/)).toBeTruthy();
    expect(screen.getByText(/Tract 2/)).toBeTruthy();
    // Find rent_burden slider — it's the first range input
    const sliders = document.querySelectorAll('input[type="range"]');
    fireEvent.change(sliders[0], { target: { value: 50 } });
    expect(screen.getByText(/Tract 1/)).toBeTruthy();
    expect(screen.queryByText(/Tract 2/)).toBeNull();
    expect(screen.getByText(/1 match/)).toBeTruthy();
  });
});

describe('TargetingPanel — sorting', () => {
  it('sorts tracts descending by sort key (default rent_burden)', () => {
    const tracts = [
      mkFeature(baseProps({ id: 'low', rent_burden: 10 })),
      mkFeature(baseProps({ id: 'high', rent_burden: 80 })),
      mkFeature(baseProps({ id: 'mid', rent_burden: 40 })),
    ];
    const { container } = render(<TargetingPanel tracts={tracts} currentLocal={null} onSelectTract={() => {}} />);
    const rows = container.querySelectorAll('input[type="checkbox"]');
    expect(rows.length).toBe(3);
    // Inspect the order of "Tract X" labels in DOM
    const labels = Array.from(container.querySelectorAll('strong')).map(n => n.textContent).filter(t => t?.startsWith('Tract'));
    expect(labels[0]).toBe('Tract high');
    expect(labels[1]).toBe('Tract mid');
    expect(labels[2]).toBe('Tract low');
  });

  it('changing sort key reorders the list', () => {
    const tracts = [
      mkFeature(baseProps({ id: 'a', rent_burden: 90, unemployment: 1 })),
      mkFeature(baseProps({ id: 'b', rent_burden: 10, unemployment: 9 })),
    ];
    const { container } = render(<TargetingPanel tracts={tracts} currentLocal={null} onSelectTract={() => {}} />);
    const select = container.querySelector('select');
    fireEvent.change(select, { target: { value: 'unemployment' } });
    const labels = Array.from(container.querySelectorAll('strong')).map(n => n.textContent).filter(t => t?.startsWith('Tract'));
    expect(labels[0]).toBe('Tract b'); // higher unemployment first
    expect(labels[1]).toBe('Tract a');
  });
});

describe('TargetingPanel — selection', () => {
  it('clicking a checkbox toggles selection (export label updates)', () => {
    const tracts = [mkFeature(baseProps({ id: '1' }))];
    render(<TargetingPanel tracts={tracts} currentLocal={null} onSelectTract={() => {}} />);
    expect(screen.getByText(/Export 0 selected/)).toBeTruthy();
    const checkbox = document.querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);
    expect(screen.getByText(/Export 1 selected/)).toBeTruthy();
    fireEvent.click(checkbox);
    expect(screen.getByText(/Export 0 selected/)).toBeTruthy();
  });

  it('"Select all visible" selects every filtered tract', () => {
    const tracts = [
      mkFeature(baseProps({ id: '1', rent_burden: 60 })),
      mkFeature(baseProps({ id: '2', rent_burden: 20 })),
    ];
    render(<TargetingPanel tracts={tracts} currentLocal={null} onSelectTract={() => {}} />);
    fireEvent.click(screen.getByText(/Select all visible/));
    expect(screen.getByText(/Export 2 selected/)).toBeTruthy();
  });

  it('"Select all visible" only selects passing tracts after filter', () => {
    const tracts = [
      mkFeature(baseProps({ id: '1', rent_burden: 60 })),
      mkFeature(baseProps({ id: '2', rent_burden: 20 })),
    ];
    render(<TargetingPanel tracts={tracts} currentLocal={null} onSelectTract={() => {}} />);
    const sliders = document.querySelectorAll('input[type="range"]');
    fireEvent.change(sliders[0], { target: { value: 50 } });
    fireEvent.click(screen.getByText(/Select all visible/));
    expect(screen.getByText(/Export 1 selected/)).toBeTruthy();
  });

  it('"Clear" empties the selection', () => {
    const tracts = [mkFeature(baseProps({ id: '1' }))];
    render(<TargetingPanel tracts={tracts} currentLocal={null} onSelectTract={() => {}} />);
    fireEvent.click(screen.getByText(/Select all visible/));
    expect(screen.getByText(/Export 1 selected/)).toBeTruthy();
    fireEvent.click(screen.getByText(/^Clear$/));
    expect(screen.getByText(/Export 0 selected/)).toBeTruthy();
  });
});

describe('TargetingPanel — onSelectTract', () => {
  it('clicking the tract label fires onSelectTract with full feature (including geometry)', () => {
    const tracts = [mkFeature(baseProps({ id: '400100' }))];
    const onSelect = vi.fn();
    render(<TargetingPanel tracts={tracts} currentLocal={null} onSelectTract={onSelect} />);
    fireEvent.click(screen.getByText(/Tract 400100/));
    expect(onSelect).toHaveBeenCalled();
    const arg = onSelect.mock.calls[0][0];
    expect(arg.geometry).toBeDefined();
    expect(arg.geometry.type).toBe('Polygon');
    expect(arg.properties.id).toBe('400100');
  });
});

describe('TargetingPanel — CSV export', () => {
  let origCreate, origRevoke, origAlert, origAppendChild, origRemoveChild;

  beforeEach(() => {
    origCreate = URL.createObjectURL;
    origRevoke = URL.revokeObjectURL;
    origAlert = window.alert;
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    window.alert = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    window.alert = origAlert;
  });

  it('alerts when nothing is selected', () => {
    const tracts = [mkFeature(baseProps({ id: '1' }))];
    render(<TargetingPanel tracts={tracts} currentLocal={null} onSelectTract={() => {}} />);
    fireEvent.click(screen.getByText(/Export 0 selected/));
    expect(window.alert).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('triggers download when at least one tract is selected', () => {
    const tracts = [mkFeature(baseProps({ id: '400100' }))];
    render(<TargetingPanel tracts={tracts} currentLocal="Berkeley" onSelectTract={() => {}} />);
    fireEvent.click(screen.getByText(/Select all visible/));
    fireEvent.click(screen.getByText(/Export 1 selected/));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    // Blob is the first arg
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
  });
});
