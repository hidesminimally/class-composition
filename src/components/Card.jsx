import React from 'react';
import { METRICS } from '../config/metrics';

const Card = React.forwardRef(({ feature, metric, isSelected, onClick, onFactSheet, onDeselect }, ref) => {
  const p = feature?.properties || {};
  const color = METRICS[metric]?.color || '#0f172a';
  const value = p[metric];
  const display = value === null || value === undefined ? '—' : `${value}%`;

  return (
    <div ref={ref} className={`stat-card${isSelected ? ' selected' : ''}`} onClick={onClick}>
      <div className="card-top">
        <div><div className="card-title">{p.tanc_local}</div><div className="card-sub">Tract {p.id}</div></div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <div className="card-val" style={{color}}>{display}</div>
          {isSelected && (
            <>
              <button
                className="pinned-btn"
                onClick={(e) => { e.stopPropagation(); onFactSheet?.(); }}
              >Sheet</button>
              <button
                onClick={(e) => { e.stopPropagation(); onDeselect?.(); }}
                style={{background:'none', border:'none', fontSize:'1.1rem', cursor:'pointer', color:'#94a3b8', padding:0, lineHeight:1}}
                aria-label="Deselect"
              >×</button>
            </>
          )}
        </div>
      </div>
      <div className="card-grid">
        <div><b>{p.total_pop ?? '—'}</b> Pop</div>
        <div><b>{p.unemployment ?? '—'}%</b> Unemp</div>
        <div><b>{p.rent_burden ?? '—'}%</b> Burden</div>
      </div>
      <div className="mini-bar">
        <div style={{width:`${p.pct_black || 0}%`, background:'#ea580c'}} />
        <div style={{width:`${p.pct_hispanic || 0}%`, background:'#16a34a'}} />
        <div style={{width:`${p.pct_asian || 0}%`, background:'#9333ea'}} />
        <div style={{flex:1, background:'#e2e8f0'}} />
      </div>
    </div>
  );
});

export default Card;
