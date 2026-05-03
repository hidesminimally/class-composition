import React, { useState, useMemo, useRef, useEffect } from 'react';
import Map, { Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';

import { METRICS, HIGHLIGHT_STYLE } from './config/metrics';

// --- UTILITIES ---
function generateDotPattern(density) {
  const size = 12; const ctx = document.createElement('canvas').getContext('2d');
  ctx.canvas.width = size; ctx.canvas.height = size;
  ctx.clearRect(0, 0, size, size); ctx.fillStyle = 'rgba(0,0,0,0.85)'; 
  const r = 1.3;
  if (density >= 1) { ctx.beginPath(); ctx.arc(6, 6, r, 0, Math.PI*2); ctx.fill(); }
  if (density >= 2) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(12, 12, r, 0, Math.PI*2); ctx.fill(); }
  if (density >= 3) { ctx.beginPath(); ctx.arc(12, 0, r, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(0, 12, r, 0, Math.PI*2); ctx.fill(); }
  if (density >= 4) { ctx.beginPath(); ctx.arc(6, 0, r, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(6, 12, r, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(0, 6, r, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(12, 6, r, 0, Math.PI*2); ctx.fill(); }
  return ctx.getImageData(0, 0, size, size);
}

// --- CORE COMPONENT: THE PAPER FACT SHEET (Reusable) ---
const FactSheetContent = ({ p }) => {
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
        {/* LEFT COL */}
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

        {/* RIGHT COL */}
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

// --- NEW COMPONENT: CONSOLIDATED REPORT ---
const ConsolidatedReport = ({ locals, onClose, dataFunc }) => {
  // Generate data for ALL requested locals
  const reports = locals.map(local => dataFunc(local)).filter(Boolean);

  return (
    <div className="report-modal">
      <div className="report-controls">
        <button className="btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
        <button className="btn-secondary" onClick={onClose}>Close</button>
      </div>
      <div className="report-container">
        {reports.map((stats, i) => (
          <div key={i} className="report-page">
            <FactSheetContent p={stats} />
          </div>
        ))}
      </div>
    </div>
  );
};

// --- EXISTING COMPONENTS (Card, etc) ---
const Card = ({ p, metric, isPinned, onClick, onFactSheet }) => {
  if (isPinned) {
    return (
      <div className="stat-card pinned">
        <div className="pinned-left">
          <h3>{p.tanc_local}</h3><span>Tract {p.id}</span>
        </div>
        <div className="pinned-right">
          <div className="pinned-metric" style={{color: METRICS[metric].color}}>{p[metric]}%</div>
          <button className="pinned-btn" onClick={(e) => { e.stopPropagation(); onFactSheet(); }}>Sheet</button>
          <button onClick={onClick} style={{background:'none', border:'none', fontSize:'1.2rem', cursor:'pointer', color:'#94a3b8'}}>×</button>
        </div>
      </div>
    );
  }
  return (
    <div className="stat-card" onClick={onClick}>
      <div className="card-top">
        <div><div className="card-title">{p.tanc_local}</div><div className="card-sub">Tract {p.id}</div></div>
        <div className="card-val" style={{color: METRICS[metric].color}}>{p[metric]}%</div>
      </div>
      <div className="card-grid">
        <div><b>{p.total_pop}</b> Pop</div><div><b>{p.unemployment}%</b> Unemp</div><div><b>{p.rent_burden}%</b> Burden</div>
      </div>
      <div className="mini-bar">
        <div style={{width:`${p.pct_black}%`, background:'#ea580c'}} /><div style={{width:`${p.pct_hispanic}%`, background:'#16a34a'}} /><div style={{width:`${p.pct_asian}%`, background:'#9333ea'}} /><div style={{flex:1, background:'#e2e8f0'}} />
      </div>
    </div>
  );
};

// --- APP ---
function App() {
  const mapRef = useRef();
  
  const [baseMetric, setBaseMetric] = useState('rent_burden');
  const [overlayMetric, setOverlayMetric] = useState('none');
  const [isTableExpanded, setIsTableExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState('controls');
  
  // MODAL STATES
  const [showFactSheet, setShowFactSheet] = useState(false);
  const [showConsolidated, setShowConsolidated] = useState(false); // NEW STATE
  
  const [sortKey, setSortKey] = useState('rent_burden');
  const [sortAsc, setSortAsc] = useState(false);
  const [mapData, setMapData] = useState([]);
  const [allLocals, setAllLocals] = useState([]);
  const [selectedLocals, setSelectedLocals] = useState([]);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [hoverInfo, setHoverInfo] = useState(null);

  useEffect(() => {
    fetch('/data.geojson').then(r => r.json()).then(json => {
      setMapData(json.features);
      const uniqueLocals = [...new Set(json.features.map(f => f.properties.tanc_local))].filter(Boolean).sort();
      setAllLocals(uniqueLocals); setSelectedLocals(uniqueLocals);
    }).catch(console.error);
  }, []);

  const onMapLoad = (e) => {
    [1, 2, 3, 4].forEach(level => { if (!e.target.hasImage(`dots-${level}`)) e.target.addImage(`dots-${level}`, generateDotPattern(level)); });
  };

  // AGGREGATION LOGIC (Reused for Consolidated Report)
  const calculateAggregate = (localName) => {
    const tracts = mapData.filter(f => f.properties.tanc_local === localName).map(f => f.properties);
    if (!tracts.length) return null;
    const totalPop = tracts.reduce((sum, t) => sum + (t.total_pop || 0), 0);
    const wAvg = (key) => {
      const sum = tracts.reduce((acc, t) => acc + (t[key] || 0) * (t.total_pop || 0), 0);
      return totalPop ? Math.round((sum / totalPop) * 10) / 10 : 0;
    };
    return {
      tanc_local: localName, id: "AGGREGATE", tract_count: tracts.length, total_pop: totalPop,
      rent_burden: wAvg('rent_burden'), unemployment: wAvg('unemployment'),
      pct_black: wAvg('pct_black'), pct_hispanic: wAvg('pct_hispanic'), pct_asian: wAvg('pct_asian'), pct_white: wAvg('pct_white')
    };
  };

  const onLocalClick = (localName) => {
    const aggStats = calculateAggregate(localName);
    if (aggStats) {
      setSelectedFeature({ properties: aggStats, geometry: null });
      setShowFactSheet(true);
    }
  };

  const sortedData = useMemo(() => {
    if (!mapData.length) return [];
    return mapData.map(f => f.properties).filter(p => selectedLocals.includes(p.tanc_local))
      .sort((a, b) => (sortAsc ? (a[sortKey] - b[sortKey]) : (b[sortKey] - a[sortKey])));
  }, [mapData, selectedLocals, sortKey, sortAsc]);

  const handleSort = (key) => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(false); } };

  const onSelect = (f) => {
    setSelectedFeature(f);
    if (f && f.geometry) {
      mapRef.current?.flyTo({ center: f.geometry.coordinates[0][0], zoom: 13.5 });
      if (window.innerWidth <= 768) setActiveTab('targets');
    }
  };

  const baseLayerStyle = useMemo(() => ({
    id: 'census-base', type: 'fill', paint: { 'fill-color': ['case', ['in', ['get', 'tanc_local'], ['literal', selectedLocals]], ['interpolate', ['linear'], ['get', baseMetric], 0, '#fff7ec', METRICS[baseMetric].max, METRICS[baseMetric].color], '#eee'], 'fill-opacity': 0.6 }
  }), [baseMetric, selectedLocals]);

  const overlayLayerStyle = useMemo(() => {
    if (overlayMetric === 'none') return null;
    const { max } = METRICS[overlayMetric];
    const steps = [0.2, 0.4, 0.6, 0.8].map(p => max * p);
    return {
      id: 'census-pattern', type: 'fill',
      paint: { 'fill-pattern': ['step', ['get', overlayMetric], 'dots-1', steps[0], 'dots-1', steps[1], 'dots-2', steps[2], 'dots-3', steps[3], 'dots-4'], 'fill-opacity': 0.5 },
      filter: ['all', ['in', ['get', 'tanc_local'], ['literal', selectedLocals]], ['>', ['get', overlayMetric], steps[0]]]
    };
  }, [overlayMetric, selectedLocals]);

  const highlightFilter = useMemo(() => (selectedFeature && selectedFeature.properties.id !== 'AGGREGATE') ? ['==', 'id', selectedFeature.properties.id] : ['==', 'id', ''], [selectedFeature]);
  const getSortIcon = (key) => sortKey !== key ? <span style={{opacity:0.3}}>↕</span> : (sortAsc ? '↑' : '↓');

  return (
    <div className="app-container">
      {/* SINGLE FACT SHEET */}
      {showFactSheet && selectedFeature && (
        <div className="fs-overlay" onClick={() => setShowFactSheet(false)}>
          <div className="fs-paper" onClick={e => e.stopPropagation()}>
            <button className="fs-close" onClick={() => setShowFactSheet(false)}>Close</button>
            <FactSheetContent p={selectedFeature.properties} />
          </div>
        </div>
      )}

      {/* CONSOLIDATED REPORT MODAL */}
      {showConsolidated && (
        <ConsolidatedReport 
          locals={selectedLocals} // Pass ALL currently checked locals
          dataFunc={calculateAggregate} // Pass the math function
          onClose={() => setShowConsolidated(false)} 
        />
      )}
      
      <div className="middle-section">
        <div className={`sidebar-left ${activeTab === 'controls' ? 'mobile-active' : ''}`}>
          <h1 className="app-header">TANC Map</h1>
          <div className="control-group"><span className="label-header">Metric</span><div className="select-wrapper"><select className="select-input" value={baseMetric} onChange={e => setBaseMetric(e.target.value)}>{Object.entries(METRICS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div></div>
          <div className="control-group"><span className="label-header">Overlay</span><div className="select-wrapper"><select className="select-input" value={overlayMetric} onChange={e => setOverlayMetric(e.target.value)}><option value="none">-- None --</option>{Object.entries(METRICS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div></div>
          
          {/* LOCALS LIST + BATCH BUTTON */}
          <div className="control-group">
            <span className="label-header">Locals</span>
            
            {/* NEW BUTTON */}
            <button 
              onClick={() => setShowConsolidated(true)}
              style={{
                width:'100%', padding:'10px', marginBottom:'12px', background:'#2563eb', 
                color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'bold', fontSize:'0.8rem'
              }}
            >
              📄 Generate Report ({selectedLocals.length})
            </button>

            <div className="checkbox-list">
              {allLocals.map(l => (
                <div key={l} className="checkbox-row">
                  <input type="checkbox" checked={selectedLocals.includes(l)} onChange={() => setSelectedLocals(p => p.includes(l) ? p.filter(x=>x!==l) : [...p,l])} />
                  <span className="local-label-btn" onClick={() => onLocalClick(l)}>{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="map-wrapper">
          <Map ref={mapRef} initialViewState={{ longitude: -122.2712, latitude: 37.8044, zoom: 11 }} mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json" style={{width:'100%',height:'100%'}} onLoad={onMapLoad} onClick={e => onSelect(e.features?.[0] || null)} interactiveLayerIds={['census-base']}>
            <Source type="geojson" data="/data.geojson"><Layer {...baseLayerStyle} />{overlayLayerStyle && <Layer {...overlayLayerStyle} />}<Layer {...HIGHLIGHT_STYLE} filter={highlightFilter} /></Source>
            {hoverInfo && (<Popup longitude={hoverInfo.feature.geometry.coordinates[0][0][0]} latitude={hoverInfo.feature.geometry.coordinates[0][0][1]} closeButton={false}><div style={{color:'black', padding:'4px', fontWeight:'bold', fontSize:'0.9rem'}}>{hoverInfo.feature.properties[baseMetric]}%</div></Popup>)}
          </Map>
        </div>

        <div className={`sidebar-right ${activeTab === 'targets' ? 'mobile-active' : ''}`}>
          {selectedFeature && selectedFeature.properties.id !== 'AGGREGATE' && (<div className="pinned-section"><Card p={selectedFeature.properties} metric={baseMetric} isPinned={true} onClick={() => onSelect(null)} onFactSheet={() => setShowFactSheet(true)} /></div>)}
          <div className="list-section">
            <div className="right-header"><div>Top Targets</div><div className="bar-legend"><div className="legend-item"><div className="legend-dot" style={{background:'#ea580c'}}/>Blk</div><div className="legend-item"><div className="legend-dot" style={{background:'#16a34a'}}/>Hisp</div><div className="legend-item"><div className="legend-dot" style={{background:'#9333ea'}}/>Asn</div></div></div>
            {sortedData.slice(0, 50).map(p => <Card key={p.id} p={p} metric={baseMetric} isPinned={false} onClick={() => onSelect({ type:'Feature', geometry: p.geometry || { coordinates: [[[-122,37]]], type: 'Polygon' }, properties: p })} />)}
          </div>
        </div>
      </div>

      <div className="mobile-nav"><div className={`tab ${activeTab === 'controls'?'active':''}`} onClick={()=>setActiveTab('controls')}>Filters</div><div className={`tab ${activeTab === 'targets'?'active':''}`} onClick={()=>setActiveTab('targets')}>List</div><div className={`tab ${activeTab === 'table'?'active':''}`} onClick={()=>setActiveTab('table')}>Data</div></div>

      <div className={`table-section ${isTableExpanded ? 'expanded' : 'collapsed'} ${activeTab === 'table' ? 'mobile-active' : ''}`}>
        <div className="table-header" onClick={() => setIsTableExpanded(!isTableExpanded)}><span>DATA GRID</span><span>{sortedData.length} rows</span></div>
        <div className="table-content">
          <table>
            <thead><tr><th onClick={() => handleSort('tanc_local')}>Local {getSortIcon('tanc_local')}</th><th onClick={() => handleSort('id')}>ID {getSortIcon('id')}</th><th onClick={() => handleSort('rent_burden')}>Burden {getSortIcon('rent_burden')}</th><th onClick={() => handleSort('unemployment')}>Unemp {getSortIcon('unemployment')}</th><th>Pop</th><th>Blk</th><th>Hisp</th><th>Asn</th></tr></thead>
            <tbody>{sortedData.map(r => <tr key={r.id} onClick={() => onSelect({properties:r, geometry:{coordinates:[[[-122,37]]]}})} className={selectedFeature?.properties.id===r.id?'selected':''}><td>{r.tanc_local}</td><td>{r.id}</td><td>{r.rent_burden}%</td><td>{r.unemployment}%</td><td>{r.total_pop}</td><td>{r.pct_black}%</td><td>{r.pct_hispanic}%</td><td>{r.pct_asian}%</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;