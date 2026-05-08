import React, { useEffect, useRef, useState } from 'react';
import CommentChip from './CommentChip';

// Column definitions drive both the header and the row cells. Ordered to mirror
// the FactSheet's mental model: identity → population → housing $ → risk →
// race (level + 2010 delta) → class composition. Every numeric column is
// sortable; the first two columns (Local, ID) are sticky-left so context
// stays visible during horizontal scroll.
const COLUMNS = [
  { key: 'tanc_local',                label: 'Local',     fmt: (v) => v ?? '—',                                                        sticky: true,  group: 'id' },
  { key: 'id',                        label: 'ID',        fmt: (v) => v ?? '—',                                                        sticky: true,  group: 'id' },

  { key: 'total_pop',                 label: 'Pop',       fmt: (v) => v == null ? '—' : Number(v).toLocaleString(),                    group: 'pop' },
  { key: 'total_pop_delta_pct',       label: 'ΔPop',      fmt: (v) => fmtDelta(v),                                                     group: 'pop',     signed: true },

  { key: 'median_gross_rent',         label: 'Rent',      fmt: (v) => v == null ? '—' : `$${Math.round(v).toLocaleString()}`,          group: 'housing' },
  { key: 'median_gross_rent_delta_pct', label: 'ΔRent',   fmt: (v) => fmtDelta(v),                                                     group: 'housing', signed: true },
  { key: 'median_hh_income',          label: 'Income',    fmt: (v) => v == null ? '—' : `$${Math.round(v).toLocaleString()}`,          group: 'housing' },
  { key: 'median_hh_income_delta_pct', label: 'ΔInc',     fmt: (v) => fmtDelta(v),                                                     group: 'housing', signed: true },

  { key: 'rent_burden',               label: 'Burden',    fmt: pct,                                                                    group: 'risk' },
  { key: 'unemployment',              label: 'Unemp',     fmt: pct,                                                                    group: 'risk' },
  { key: 'poverty_rate',              label: 'Poverty',   fmt: pct,                                                                    group: 'risk' },
  { key: 'vacancy_rate',              label: 'Vacancy',   fmt: pct,                                                                    group: 'risk' },

  { key: 'pct_black',                 label: 'Blk',       fmt: pct,                                                                    group: 'race' },
  { key: 'pct_hispanic',              label: 'Hisp',      fmt: pct,                                                                    group: 'race' },
  { key: 'pct_asian',                 label: 'Asn',       fmt: pct,                                                                    group: 'race' },
  { key: 'pct_white',                 label: 'Wht',       fmt: pct,                                                                    group: 'race' },

  { key: 'pct_black_delta_pct',       label: 'ΔBlk',      fmt: (v) => fmtDelta(v),                                                     group: 'race-d', signed: true },
  { key: 'pct_hispanic_delta_pct',    label: 'ΔHisp',     fmt: (v) => fmtDelta(v),                                                     group: 'race-d', signed: true },
  { key: 'pct_asian_delta_pct',       label: 'ΔAsn',      fmt: (v) => fmtDelta(v),                                                     group: 'race-d', signed: true },
  { key: 'pct_white_delta_pct',       label: 'ΔWht',      fmt: (v) => fmtDelta(v),                                                     group: 'race-d', signed: true },

  { key: 'pct_foreign_born',          label: 'F-born',    fmt: pct,                                                                    group: 'class' },
  { key: 'pct_limited_eng_any',       label: 'LEP',       fmt: pct,                                                                    group: 'class' },
  { key: 'pct_pub_assist_or_snap',    label: 'SNAP',      fmt: pct,                                                                    group: 'class' },
  { key: 'pct_renter_no_vehicle',     label: 'NoVeh',     fmt: pct,                                                                    group: 'class' },
  { key: 'pct_under_35k',             label: '<$35k',     fmt: pct,                                                                    group: 'class' },

  { key: 'pct_lang_spanish',          label: 'Lang Sp',   fmt: pct,                                                                    group: 'lang' },
];

function pct(v) { return v == null ? '—' : `${v}%`; }
function fmtDelta(v) {
  if (v == null || Number.isNaN(v)) return '—';
  const arrow = v > 0 ? '↑' : v < 0 ? '↓' : '·';
  return `${arrow}${Math.abs(v)}%`;
}
function deltaColor(v) {
  if (v == null || Number.isNaN(v)) return undefined;
  if (v > 5) return '#dc2626';
  if (v < -5) return '#2563eb';
  return undefined;
}

const DataTable = ({ features, isExpanded, onToggleExpanded, sortKey, sortAsc, onSort, selectedId, onSelect, mobileActive, onOpenNotes }) => {
  const selectedRowRef = useRef(null);
  const scrollRef = useRef(null);
  const [scrollState, setScrollState] = useState({ canLeft: false, canRight: false });

  useEffect(() => {
    if (!selectedId || selectedId === 'AGGREGATE' || !isExpanded) return;
    selectedRowRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId, isExpanded]);

  // Drives the edge-fade + arrow-button affordances. We re-check on scroll, on
  // resize, and whenever the expanded/feature-count changes the layout.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setScrollState({
        canLeft: scrollLeft > 4,
        canRight: scrollLeft + clientWidth < scrollWidth - 4,
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [isExpanded, features.length]);

  const scrollBy = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.6), behavior: 'smooth' });
  };

  const getSortIcon = (key) =>
    sortKey !== key
      ? <span style={{opacity:0.3}}>↕</span>
      : (sortAsc ? '↑' : '↓');

  return (
    <div className={`table-section ${isExpanded ? 'expanded' : 'collapsed'} ${mobileActive ? 'mobile-active' : ''}`}>
      <div className="table-header" onClick={onToggleExpanded}>
        <span className="table-header-title">
          <span className="table-chevron" aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
          DATA GRID
        </span>
        <span className="table-header-actions">
          {isExpanded && (
            <span className="table-scroll-controls" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="table-scroll-btn"
                onClick={() => scrollBy(-1)}
                disabled={!scrollState.canLeft}
                aria-label="Scroll left"
              >←</button>
              <button
                type="button"
                className="table-scroll-btn"
                onClick={() => scrollBy(1)}
                disabled={!scrollState.canRight}
                aria-label="Scroll right"
              >→</button>
            </span>
          )}
          <span className="table-row-count">{features.length} rows</span>
          <span className="table-toggle-label">{isExpanded ? 'HIDE' : 'SHOW'}</span>
        </span>
      </div>
      <div
        className={`table-content ${scrollState.canLeft ? 'fade-left' : ''} ${scrollState.canRight ? 'fade-right' : ''}`}
        ref={scrollRef}
      >
        <table className="data-grid">
          <thead>
            <tr>
              {COLUMNS.map((col, i) => (
                <th
                  key={col.key}
                  className={col.sticky ? `sticky-col sticky-col-${i}` : ''}
                  onClick={() => onSort(col.key)}
                >
                  {col.label} {getSortIcon(col.key)}
                </th>
              ))}
              {onOpenNotes && <th>Notes</th>}
            </tr>
          </thead>
          <tbody>
            {features.map(f => {
              const r = f.properties;
              const isSel = selectedId === r.id;
              return (
                <tr
                  key={r.id}
                  ref={isSel ? selectedRowRef : null}
                  onClick={() => onSelect(f)}
                  className={isSel ? 'selected' : ''}
                >
                  {COLUMNS.map((col, i) => {
                    const raw = r[col.key];
                    const style = col.signed ? { color: deltaColor(raw), fontVariantNumeric: 'tabular-nums' } : { fontVariantNumeric: 'tabular-nums' };
                    return (
                      <td
                        key={col.key}
                        className={col.sticky ? `sticky-col sticky-col-${i}` : ''}
                        style={style}
                      >
                        {col.fmt(raw)}
                      </td>
                    );
                  })}
                  {onOpenNotes && (
                    <td onClick={(e) => e.stopPropagation()}>
                      {r.id && r.id !== 'AGGREGATE' && (
                        <CommentChip
                          scope="tract"
                          scopeId={r.id}
                          alwaysShow
                          onOpen={() => onOpenNotes({ scope: 'tract', scopeId: String(r.id), scopeLabel: String(r.id) })}
                        />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
