import React, { useState, useMemo } from 'react';
import { tractsToCsv, downloadCsv } from '../lib/csvExport';

// Metrics organizers want to filter on
const FILTER_METRICS = [
  { key: 'rent_burden', label: 'Rent Burden ≥', max: 100, default: 0 },
  { key: 'unemployment', label: 'Unemployment ≥', max: 50, default: 0 },
  { key: 'poverty_rate', label: 'Poverty Rate ≥', max: 100, default: 0 },
  { key: 'eviction_rate', label: 'Eviction Rate ≥', max: 100, default: 0 },
  { key: 'pct_lor_2019_or_later', label: 'Recent Movers ≥', max: 100, default: 0 },
  { key: 'pct_hispanic', label: 'Hispanic ≥', max: 100, default: 0 },
  { key: 'pct_black', label: 'Black ≥', max: 100, default: 0 },
  { key: 'pct_asian', label: 'Asian ≥', max: 100, default: 0 },
];

const SORT_OPTIONS = FILTER_METRICS.map(m => ({ key: m.key, label: m.label.replace(' ≥', '') }));

const EXPORT_COLUMNS = [
  'id', 'tanc_local',
  'total_pop', 'avg_household_size',
  'median_gross_rent', 'median_hh_income',
  'rent_burden', 'unemployment', 'poverty_rate',
  'vacancy_rate', 'occupancy_rate', 'eviction_rate',
  'pct_white', 'pct_black', 'pct_hispanic', 'pct_asian',
  'pct_lang_english_only', 'pct_lang_spanish', 'pct_lang_chinese',
  'pct_lor_2019_or_later', 'pct_lor_2015_2018',
  'median_year_built',
  'total_pop_delta_pct', 'median_gross_rent_delta_pct', 'median_hh_income_delta_pct',
  '_centroid',
];

function getCentroid(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  // Polygon: coordinates[0] is the outer ring
  const ring = geometry.coordinates[0];
  if (!ring || !ring.length) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of ring) { sx += x; sy += y; }
  return [+(sx / ring.length).toFixed(5), +(sy / ring.length).toFixed(5)];
}

const TargetingPanel = ({ tracts, currentLocal, onSelectTract }) => {
  const [thresholds, setThresholds] = useState(
    Object.fromEntries(FILTER_METRICS.map(m => [m.key, m.default]))
  );
  const [sortKey, setSortKey] = useState('rent_burden');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const filtered = useMemo(() => {
    let rows = tracts.slice();
    for (const m of FILTER_METRICS) {
      if (thresholds[m.key] > 0) {
        rows = rows.filter(t => (t.properties[m.key] ?? 0) >= thresholds[m.key]);
      }
    }
    rows.sort((a, b) => (b.properties[sortKey] ?? 0) - (a.properties[sortKey] ?? 0));
    return rows;
  }, [tracts, thresholds, sortKey]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(new Set(filtered.map(t => t.properties.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  const exportSelected = () => {
    const rows = filtered
      .filter(t => selectedIds.has(t.properties.id))
      .map(t => ({
        ...t.properties,
        _centroid: getCentroid(t.geometry),
      }));
    if (!rows.length) {
      alert('No tracts selected. Check boxes next to tracts in the list, or use "Select all visible".');
      return;
    }
    const csv = tractsToCsv(rows, EXPORT_COLUMNS);
    const stamp = new Date().toISOString().slice(0,10);
    downloadCsv(csv, `tanc-${currentLocal || 'all'}-targets-${stamp}.csv`);
  };

  return (
    <div className="targeting-panel" style={{padding:12, background:'#f8fafc', borderRadius:6}}>
      <div style={{fontWeight:800, fontSize:'0.9rem', marginBottom:8}}>
        TARGET TRACTS{currentLocal ? ` IN ${currentLocal.toUpperCase()}` : ''} ({filtered.length} match)
      </div>

      <div style={{maxHeight:200, overflow:'auto', marginBottom:12, borderTop:'1px solid #e2e8f0', paddingTop:8}}>
        {FILTER_METRICS.map(m => (
          <div key={m.key} style={{marginBottom:6}}>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.75rem', color:'#475569'}}>
              <span>{m.label}</span><strong>{thresholds[m.key]}{m.max === 100 ? '%' : ''}</strong>
            </div>
            <input
              type="range" min={0} max={m.max} step={1}
              value={thresholds[m.key]}
              onChange={e => setThresholds(t => ({ ...t, [m.key]: Number(e.target.value) }))}
              style={{width:'100%'}}
            />
          </div>
        ))}
      </div>

      <div style={{display:'flex', gap:6, marginBottom:8, fontSize:'0.75rem'}}>
        <span>Sort:</span>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={{flex:1, fontSize:'0.75rem'}}>
          {SORT_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      <div style={{display:'flex', gap:6, marginBottom:8}}>
        <button onClick={selectAllVisible} style={{fontSize:'0.7rem', padding:'4px 8px', flex:1}}>Select all visible</button>
        <button onClick={clearSelection} style={{fontSize:'0.7rem', padding:'4px 8px'}}>Clear</button>
      </div>

      <div style={{maxHeight:240, overflow:'auto', borderTop:'1px solid #e2e8f0'}}>
        {filtered.map(t => {
          const p = t.properties;
          return (
            <div key={p.id} style={{display:'flex', alignItems:'center', padding:'4px 0', borderBottom:'1px solid #f1f5f9', fontSize:'0.8rem'}}>
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onChange={() => toggleSelect(p.id)}
                style={{marginRight:6}}
              />
              <span style={{flex:1, cursor:'pointer'}} onClick={() => onSelectTract(t)}>
                <strong>Tract {p.id}</strong> · {p.tanc_local}
              </span>
              <span style={{color:'#dc2626', fontWeight:600}}>{p[sortKey] ?? '—'}{typeof p[sortKey] === 'number' ? '%' : ''}</span>
            </div>
          );
        })}
      </div>

      <button
        onClick={exportSelected}
        style={{
          width:'100%', marginTop:10, padding:10, background:'#2563eb',
          color:'white', border:'none', borderRadius:6, fontWeight:'bold', cursor:'pointer', fontSize:'0.85rem'
        }}
      >
        Export {selectedIds.size} selected to CSV
      </button>
    </div>
  );
};

export default TargetingPanel;
