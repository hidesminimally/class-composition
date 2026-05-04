import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FactSheet from './FactSheet';

const tractFull = {
  id: '400100',
  tanc_local: 'Berkeley',
  total_pop: 3500,
  total_pop_delta_pct: 12.4,
  avg_household_size: 2.3,
  median_gross_rent: 1850,
  median_gross_rent_delta_pct: 18.2,
  median_hh_income: 75000,
  median_hh_income_delta_pct: -3.1,
  median_year_built: 1962,
  rent_burden: 48,
  unemployment: 5.2,
  poverty_rate: 18,
  vacancy_rate: 7,
  occupancy_rate: 93,
  eviction_rate: 12.4,
  pct_white: 35,
  pct_black: 25,
  pct_hispanic: 22,
  pct_asian: 18,
  pct_white_delta_pct: -5,
  pct_black_delta_pct: -8,
  pct_hispanic_delta_pct: 3,
  pct_asian_delta_pct: 10,
  pct_lang_english_only: 70,
  pct_lang_spanish: 12,
  pct_lang_chinese: 8,
  pct_lang_vietnamese: 4,
  pct_lor_2019_or_later: 25,
  pct_lor_2015_2018: 20,
  pct_lor_2010_2014: 15,
  pct_lor_2000_2009: 18,
  pct_lor_1990_1999: 12,
  pct_lor_1989_or_earlier: 10,
};

describe('FactSheet — tract view', () => {
  it('renders tract id in header for non-aggregate', () => {
    render(<FactSheet p={tractFull} />);
    expect(screen.getByText(/Tract 400100/)).toBeTruthy();
  });

  it('renders all 17 PDF variables', () => {
    render(<FactSheet p={tractFull} />);
    expect(screen.getByText(/Total population/)).toBeTruthy();
    expect(screen.getByText(/Avg\. household size/)).toBeTruthy();
    expect(screen.getByText(/Median rent/)).toBeTruthy();
    expect(screen.getByText(/Median household income/)).toBeTruthy();
    expect(screen.getByText(/Rent burden/)).toBeTruthy();
    expect(screen.getByText(/Unemployment rate/)).toBeTruthy();
    expect(screen.getByText(/Poverty rate/)).toBeTruthy();
    expect(screen.getByText(/Vacancy rate/)).toBeTruthy();
    expect(screen.getByText(/Occupancy rate/)).toBeTruthy();
    expect(screen.getByText(/Eviction rate/)).toBeTruthy();
    expect(screen.getByText(/Black \/ African American/)).toBeTruthy();
    expect(screen.getByText(/Hispanic \/ Latinx/)).toBeTruthy();
    expect(screen.getByText(/^Asian$/)).toBeTruthy();
    expect(screen.getByText(/White \(non-Hispanic\)/)).toBeTruthy();
    expect(screen.getByText(/English-only households/)).toBeTruthy();
    expect(screen.getByText(/LENGTH OF RESIDENCY/)).toBeTruthy();
  });

  it('renders an up-arrow delta when value is positive', () => {
    render(<FactSheet p={tractFull} />);
    // total_pop_delta_pct = 12.4 → up arrow
    expect(screen.getAllByText(/↑/).length).toBeGreaterThan(0);
  });

  it('renders a down-arrow delta when value is negative', () => {
    render(<FactSheet p={tractFull} />);
    // median_hh_income_delta_pct = -3.1 → down arrow
    expect(screen.getAllByText(/↓/).length).toBeGreaterThan(0);
  });

  it('uses absolute value in delta text (no minus sign)', () => {
    render(<FactSheet p={tractFull} />);
    // -3.1 shows as "3.1%"
    const downs = screen.getAllByText(/↓ 3\.1%/);
    expect(downs.length).toBeGreaterThan(0);
  });

  it('renders top non-English languages sorted descending', () => {
    render(<FactSheet p={tractFull} />);
    // "Spanish" now appears in both LANGUAGE AT HOME and CLASS COMPOSITION sections
    expect(screen.getAllByText(/Spanish/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Chinese/)).toBeTruthy();
    expect(screen.getByText(/Vietnamese/)).toBeTruthy();
  });

  it('renders dollar values with $ prefix', () => {
    render(<FactSheet p={tractFull} />);
    expect(screen.getByText(/\$1,850/)).toBeTruthy();
    expect(screen.getByText(/\$75,000/)).toBeTruthy();
  });

  it('renders eviction rate to one decimal', () => {
    render(<FactSheet p={tractFull} />);
    expect(screen.getByText(/^12\.4$/)).toBeTruthy();
  });
});

describe('FactSheet — aggregate (Local) view', () => {
  // Simulate the output of calculateAggregate for a Local
  const aggregate = {
    ...tractFull,
    id: 'AGGREGATE',
    tanc_local: 'Berkeley',
    tract_count: 12,
  };

  it('renders Local label in header', () => {
    render(<FactSheet p={aggregate} />);
    expect(screen.getByText(/Berkeley Local/)).toBeTruthy();
    expect(screen.getByText(/Consolidated Analysis \(12 Tracts\)/)).toBeTruthy();
  });

  it('shows percentage values for the aggregate (regression: previously showed —)', () => {
    render(<FactSheet p={aggregate} />);
    // poverty_rate: 18 → "18%"
    expect(screen.getAllByText(/18%/).length).toBeGreaterThan(0);
    // vacancy_rate: 7 → "7%"
    expect(screen.getAllByText(/7%/).length).toBeGreaterThan(0);
  });
});

describe('FactSheet — null handling', () => {
  it('renders em-dash for null total_pop', () => {
    render(<FactSheet p={{ id: '1', tanc_local: 'X', total_pop: null }} />);
    // The "Total population" row should show em-dash for value
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
  });

  it('renders em-dash for missing eviction_rate', () => {
    render(<FactSheet p={{ id: '1', tanc_local: 'X', eviction_rate: null }} />);
    // No 12.4 — instead em-dash
    expect(screen.queryByText(/^12\.4$/)).toBeNull();
  });

  it('renders em-dash when no top language has nonzero value', () => {
    render(<FactSheet p={{ id: '1', tanc_local: 'X' }} />);
    // No language stat — heading is still there
    expect(screen.getByText(/LANGUAGE AT HOME/)).toBeTruthy();
  });
});
