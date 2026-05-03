import React from 'react';
import { BIVARIATE_PALETTE } from '../lib/bivariate';
import { METRICS } from '../config/metrics';

const BivariateLegend = ({ xMetric, yMetric }) => {
  if (!xMetric || !yMetric || xMetric === 'none' || yMetric === 'none') return null;
  // Render rows top-down so y=2 (high) appears at top
  const rows = [2, 1, 0];

  return (
    <div className="bivariate-legend" style={{position:'absolute', bottom:20, right:20, background:'white', padding:12, borderRadius:6, boxShadow:'0 2px 8px rgba(0,0,0,0.15)', fontSize:'0.75rem'}}>
      <div style={{display:'flex', alignItems:'flex-start'}}>
        <div style={{display:'flex', flexDirection:'column-reverse', justifyContent:'space-between', marginRight:6, fontWeight:600, fontSize:'0.7rem', color:'#475569'}}>
          <span style={{transform:'rotate(-90deg)', whiteSpace:'nowrap', transformOrigin:'left bottom', marginBottom:8}}>{METRICS[yMetric]?.label || yMetric} →</span>
        </div>
        <div>
          {rows.map(y => (
            <div key={y} style={{display:'flex'}}>
              {[0, 1, 2].map(x => (
                <div key={x} style={{width:24, height:24, background:BIVARIATE_PALETTE[y][x], border:'1px solid white'}} />
              ))}
            </div>
          ))}
          <div style={{textAlign:'left', marginTop:4, fontWeight:600, fontSize:'0.7rem', color:'#475569'}}>
            {METRICS[xMetric]?.label || xMetric} →
          </div>
        </div>
      </div>
    </div>
  );
};

export default BivariateLegend;
