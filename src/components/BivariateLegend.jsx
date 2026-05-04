import React from 'react';
import { BIVARIATE_PALETTE } from '../lib/bivariate';
import { METRICS } from '../config/metrics';

const BivariateLegend = ({ xMetric, yMetric }) => {
  if (!xMetric || !yMetric || xMetric === 'none' || yMetric === 'none') return null;
  // Render rows top-down so y=2 (high) appears at top
  const rows = [2, 1, 0];

  const labelStyle = {
    fontWeight: 600,
    fontSize: '0.7rem',
    color: '#475569',
    whiteSpace: 'nowrap',
  };

  const gridWidth = 24 * 3;

  return (
    <div className="bivariate-legend" style={{position:'absolute', bottom:20, right:20, background:'white', padding:12, borderRadius:6, boxShadow:'0 2px 8px rgba(0,0,0,0.15)', fontSize:'0.75rem'}}>
      <div style={{display:'flex', alignItems:'center'}}>
        {/* Y-axis label: rotated via writing-mode so it reserves layout space */}
        <div
          style={{
            ...labelStyle,
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            marginRight: 6,
            height: 24 * 3,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {METRICS[yMetric]?.label || yMetric} →
        </div>

        <div>
          {rows.map(y => (
            <div key={y} style={{display:'flex'}}>
              {[0, 1, 2].map(x => (
                <div key={x} style={{width:24, height:24, background:BIVARIATE_PALETTE[y][x], border:'1px solid white'}} />
              ))}
            </div>
          ))}
          {/* X-axis label: spans the grid width */}
          <div style={{...labelStyle, marginTop:4, width: gridWidth, textAlign: 'center'}}>
            {METRICS[xMetric]?.label || xMetric} →
          </div>
        </div>
      </div>
    </div>
  );
};

export default BivariateLegend;
