import React from 'react';
import { METRICS } from '../config/metrics';

const fmtMetric = (val, meta) => {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  if (meta?.kind === 'diverging') {
    const arrow = val > 0 ? '↑' : val < 0 ? '↓' : '·';
    return `${arrow}${Math.abs(val)}%`;
  }
  return `${val}%`;
};

const deltaColor = (val) => {
  if (val === null || val === undefined || Number.isNaN(val)) return 'var(--text)';
  if (val > 5) return '#dc2626';
  if (val < -5) return '#2563eb';
  return 'var(--text)';
};

const Card = React.forwardRef(({ feature, metric, overlayMetric, isSelected, onClick, onFactSheet, onDeselect }, ref) => {
  const p = feature?.properties || {};
  const baseMeta = METRICS[metric];
  const overlayMeta = overlayMetric && overlayMetric !== 'none' && overlayMetric !== metric
    ? METRICS[overlayMetric]
    : null;

  const baseColor = baseMeta?.color || (baseMeta?.kind === 'diverging' ? '#0f172a' : '#0f172a');
  const headlineDisplay = fmtMetric(p[metric], baseMeta);

  const cells = [
    { label: 'Pop', value: p.total_pop ?? '—', valueStyle: {} },
    {
      label: baseMeta?.short || 'Metric',
      value: fmtMetric(p[metric], baseMeta),
      valueStyle: baseMeta?.kind === 'diverging' ? { color: deltaColor(p[metric]) } : {},
    },
  ];
  if (overlayMeta) {
    cells.push({
      label: overlayMeta.short || overlayMetric,
      value: fmtMetric(p[overlayMetric], overlayMeta),
      valueStyle: overlayMeta.kind === 'diverging' ? { color: deltaColor(p[overlayMetric]) } : {},
    });
  }

  const headlineColor = baseMeta?.kind === 'diverging' ? deltaColor(p[metric]) : baseColor;

  return (
    <div ref={ref} className={`stat-card${isSelected ? ' selected' : ''}`} onClick={onClick}>
      <div className="card-top">
        <div><div className="card-title">{p.tanc_local}</div><div className="card-sub">Tract {p.id}</div></div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <div className="card-val" style={{color: headlineColor}}>{headlineDisplay}</div>
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
      <div className="card-grid" style={{gridTemplateColumns: `repeat(${cells.length}, 1fr)`}}>
        {cells.map((c, i) => (
          <div key={i}><b style={c.valueStyle}>{c.value}</b> {c.label}</div>
        ))}
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
