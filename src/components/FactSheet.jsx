import React from 'react';

const FactSheet = ({ p }) => {
  const isAgg = p.id === 'AGGREGATE';
  return (
    <div style={{height:'100%', display:'flex', flexDirection:'column'}}>
      <div style={{borderBottom:'4px solid #0f172a', paddingBottom:20, marginBottom:30}}>
        <h1 style={{fontSize:'2.5rem', fontWeight:800, margin:0, lineHeight:1}}>
          {isAgg ? `${p.tanc_local} Local` : `Tract ${p.id}`}
        </h1>
        <div style={{color:'#64748b', marginTop:5, fontSize:'1.1rem'}}>
          {isAgg ? `Consolidated Analysis (${p.tract_count} Tracts)` : `${p.tanc_local} Chapter`}
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:40}}>
        <div>
          <h3 style={{borderBottom:'1px solid #ddd', paddingBottom:8, color:'#64748b', fontSize:'0.85rem', fontWeight:800, letterSpacing:'0.05em'}}>RISK METRICS</h3>
          <div style={{display:'flex', gap:30, marginTop:20, marginBottom:20}}>
            <div>
              <div style={{fontSize:'3.5rem', fontWeight:800, color:'#ef3b2c', lineHeight:1}}>{p.rent_burden}%</div>
              <div style={{color:'#64748b', fontWeight:600, fontSize:'0.9rem', marginTop:5}}>Rent Burden</div>
            </div>
            <div>
              <div style={{fontSize:'3.5rem', fontWeight:800, color:'#2563eb', lineHeight:1}}>{p.unemployment}%</div>
              <div style={{color:'#64748b', fontWeight:600, fontSize:'0.9rem', marginTop:5}}>Unemployment</div>
            </div>
          </div>
          <p style={{lineHeight:1.6, fontSize:'1rem', color:'#334155'}}>
            Total Population: <strong>{p.total_pop?.toLocaleString()}</strong>.<br/>
            {isAgg
              ? "Data represents a weighted average across all census tracts within this Local's jurisdiction."
              : (p.rent_burden > 40 ? "This tract shows severe housing distress signs." : "This tract shows moderate housing stability.")}
          </p>
        </div>

        <div>
          <h3 style={{borderBottom:'1px solid #ddd', paddingBottom:8, color:'#64748b', fontSize:'0.85rem', fontWeight:800, letterSpacing:'0.05em'}}>DEMOGRAPHICS</h3>
          <div style={{marginTop:20, marginBottom:20}}>
            <div style={{display:'flex', height:24, borderRadius:4, overflow:'hidden', border:'1px solid #e2e8f0'}}>
              <div style={{width:`${p.pct_black}%`, background:'#ea580c'}} />
              <div style={{width:`${p.pct_hispanic}%`, background:'#16a34a'}} />
              <div style={{width:`${p.pct_asian}%`, background:'#9333ea'}} />
              <div style={{flex:1, background:'#f1f5f9'}} />
            </div>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f1f5f9'}}><span>Black / African American</span><strong>{p.pct_black}%</strong></div>
          <div style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f1f5f9'}}><span>Hispanic / Latinx</span><strong>{p.pct_hispanic}%</strong></div>
          <div style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f1f5f9'}}><span>Asian</span><strong>{p.pct_asian}%</strong></div>
          <div style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f1f5f9'}}><span>White / Other</span><strong>{p.pct_white}%</strong></div>
        </div>
      </div>

      <div style={{marginTop:'auto', paddingTop:30, borderTop:'1px dashed #cbd5e1', textAlign:'center', color:'#94a3b8', fontSize:'0.8rem'}}>
        TANC Internal Document • Generated {new Date().toLocaleDateString()}
      </div>
    </div>
  );
};

export default FactSheet;
