import React, { useEffect, useRef } from 'react';

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

const DataTable = ({ features, isExpanded, onToggleExpanded, sortKey, sortAsc, onSort, selectedId, onSelect, mobileActive }) => {
  const selectedRowRef = useRef(null);

  useEffect(() => {
    if (!selectedId || selectedId === 'AGGREGATE' || !isExpanded) return;
    selectedRowRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId, isExpanded]);

  const getSortIcon = (key) =>
    sortKey !== key
      ? <span style={{opacity:0.3}}>↕</span>
      : (sortAsc ? '↑' : '↓');

  return (
    <div className={`table-section ${isExpanded ? 'expanded' : 'collapsed'} ${mobileActive ? 'mobile-active' : ''}`}>
      <div className="table-header" onClick={onToggleExpanded}>
        <span>DATA GRID</span>
        <span style={{fontSize:'0.7rem', color:'#94a3b8', fontWeight:500}}>scroll →</span>
        <span>{features.length} rows</span>
      </div>
      <div className="table-content">
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
