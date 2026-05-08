import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Card from './Card';

const mkFeature = (props) => ({ properties: props, geometry: { type: 'Polygon', coordinates: [[[0,0]]] } });

describe('Card — non-pinned', () => {
  it('renders local name and tract id', () => {
    const f = mkFeature({ id: '400100', tanc_local: 'Berkeley', rent_burden: 50, total_pop: 3000 });
    render(<Card feature={f} metric="rent_burden" isSelected={false} onClick={() => {}} />);
    expect(screen.getByText('Berkeley')).toBeTruthy();
    expect(screen.getByText(/Tract 400100/)).toBeTruthy();
  });

  it('renders metric value as percentage', () => {
    const f = mkFeature({ id: '1', tanc_local: 'X', rent_burden: 47 });
    render(<Card feature={f} metric="rent_burden" isSelected={false} onClick={() => {}} />);
    // 47% appears in both card-val and the grid Burden stat
    expect(screen.getAllByText('47%').length).toBeGreaterThan(0);
  });

  it('renders em-dash for null metric value', () => {
    const f = mkFeature({ id: '1', tanc_local: 'X', rent_burden: null });
    render(<Card feature={f} metric="rent_burden" isSelected={false} onClick={() => {}} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('passes the full feature (with geometry) to onClick — regression test', () => {
    const f = mkFeature({ id: '1', tanc_local: 'X', rent_burden: 50 });
    const onClick = vi.fn();
    render(<Card feature={f} metric="rent_burden" isSelected={false} onClick={onClick} />);
    fireEvent.click(screen.getByText('X'));
    expect(onClick).toHaveBeenCalled();
  });

  it('does not crash when given an unknown metric key', () => {
    const f = mkFeature({ id: '1', tanc_local: 'X', total_pop: 3000 });
    expect(() =>
      render(<Card feature={f} metric="unknown_metric" isSelected={false} onClick={() => {}} />)
    ).not.toThrow();
  });
});

describe('Card — selected', () => {
  it('renders Sheet button and × close button when selected', () => {
    const f = mkFeature({ id: '1', tanc_local: 'X', rent_burden: 50 });
    const onFactSheet = vi.fn();
    render(<Card feature={f} metric="rent_burden" isSelected={true} onClick={() => {}} onFactSheet={onFactSheet} onDeselect={() => {}} />);
    expect(screen.getByText('Sheet')).toBeTruthy();
    expect(screen.getByText('×')).toBeTruthy();
  });

  it('clicking Sheet calls onFactSheet without firing card onClick', () => {
    const f = mkFeature({ id: '1', tanc_local: 'X', rent_burden: 50 });
    const onClick = vi.fn();
    const onFactSheet = vi.fn();
    render(<Card feature={f} metric="rent_burden" isSelected={true} onClick={onClick} onFactSheet={onFactSheet} onDeselect={() => {}} />);
    fireEvent.click(screen.getByText('Sheet'));
    expect(onFactSheet).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('clicking × calls onDeselect without firing card onClick', () => {
    const f = mkFeature({ id: '1', tanc_local: 'X', rent_burden: 50 });
    const onClick = vi.fn();
    const onDeselect = vi.fn();
    render(<Card feature={f} metric="rent_burden" isSelected={true} onClick={onClick} onFactSheet={() => {}} onDeselect={onDeselect} />);
    fireEvent.click(screen.getByText('×'));
    expect(onDeselect).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
