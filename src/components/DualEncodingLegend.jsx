import React from 'react';
import { METRICS } from '../config/metrics';
import { hatchSvgDataUri } from '../lib/hatch';

// Two-axis legend for the dual encoding (color = base metric, pattern = second metric).
// Color ramp on top, pattern ramp on the bottom. Each ramp is independent so the
// reader can decode any tract by looking at color first, then pattern.
const DualEncodingLegend = ({ xMetric, yMetric }) => {
  if (!xMetric || !yMetric || xMetric === 'none' || yMetric === 'none') return null;

  const xMeta = METRICS[xMetric];
  const isDiverging = xMeta?.kind === 'diverging';
  const baseColor = xMeta?.color || '#0f172a';
  const colorGradient = isDiverging
    ? `linear-gradient(to right, ${xMeta.colors[0]}, ${xMeta.colors[1]}, ${xMeta.colors[2]})`
    : `linear-gradient(to right, #fff7ec, ${baseColor})`;
  const colorLabels = isDiverging
    ? [`${xMeta.domain[0]}%`, '0', `${xMeta.domain[2]}%+`]
    : ['low', null, 'high'];
  const patternRow = [
    { label: 'low', density: null },
    { label: 'mid', density: 'hatch-mid' },
    { label: 'high', density: 'hatch-dense' },
  ];

  const cellW = 36;
  const cellH = 18;

  return (
    <div
      className="dual-encoding-legend"
      style={{
        position: 'absolute', bottom: 20, right: 20,
        background: 'white', padding: 12, borderRadius: 6,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: '0.75rem', minWidth: cellW * 3 + 24,
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
          Color: {METRICS[xMetric]?.label || xMetric}
        </div>
        <div style={{
          height: cellH,
          background: colorGradient,
          border: '1px solid #cbd5e1', borderRadius: 2,
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#64748b', marginTop: 2 }}>
          <span>{colorLabels[0]}</span>
          {colorLabels[1] !== null && <span>{colorLabels[1]}</span>}
          <span>{colorLabels[2]}</span>
        </div>
      </div>

      <div>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
          Pattern: {METRICS[yMetric]?.label || yMetric}
        </div>
        <div style={{ display: 'flex' }}>
          {patternRow.map(({ label, density }) => (
            <div
              key={label}
              style={{
                width: cellW, height: cellH,
                background: density
                  ? `${hatchSvgDataUri(density)} #f1f5f9`
                  : '#f1f5f9',
                backgroundRepeat: 'repeat',
                border: '1px solid #cbd5e1',
                borderLeft: label === 'low' ? '1px solid #cbd5e1' : 'none',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', fontSize: '0.65rem', color: '#64748b', marginTop: 2 }}>
          {patternRow.map(({ label }) => (
            <div key={label} style={{ width: cellW, textAlign: 'center' }}>{label}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DualEncodingLegend;
