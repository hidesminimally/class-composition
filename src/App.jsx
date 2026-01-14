import React, { useState, useMemo, useRef, useEffect } from 'react';
import Map, { Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';

// --- CONFIGURATION ---
const METRICS = {
  rent_burden: { label: "Rent Burden", color: "#ef3b2c", max: 60 },
  unemployment: { label: "Unemployment", color: "#2563eb", max: 15 },
  pct_hispanic: { label: "% Hispanic", color: "#16a34a", max: 80 },
  pct_black: { label: "% Black", color: "#ea580c", max: 80 },
  pct_asian: { label: "% Asian", color: "#9333ea", max: 80 },
  pct_white: { label: "% White", color: "#64748b", max: 80 }
};

const HIGHLIGHT_STYLE = {
  id: 'highlight',
  type: 'line',
  paint: { 'line-color': '#00FFFF', 'line-width': 3 }
};

// --- HELPER COMPONENT: DEMOGRAPHIC BAR (REUSABLE) ---
const DemoBar = ({ p, height = 8 }) => (
  <div style={{ display: 'flex', height: height, width: '100%', borderRadius: 4, overflow: 'hidden', background: '#e2e8f0' }}>
    <div style={{ width: `${p.pct_black}%`, background: '#ea580c' }} title="Black" />
    <div style={{ width: `${p.pct_hispanic}%`, background: '#16a34a' }} title="Hispanic" />
    <div style={{ width: `${p.pct_asian}%`, background: '#9333ea' }} title="Asian" />
    <div style={{ flex: 1, background: '#cbd5e1' }} title="White/Other" />
  </div>
);

// --- NEW COMPONENT: FACT SHEET (MODAL) ---
const FactSheet = ({ feature, onClose }) => {
  if (!feature) return null;
  const p = feature.properties;

  return (
    <div className="fact-sheet-overlay" onClick={onClose}>
      <div className="paper-document" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>Close ✕</button>
        
        {/* HEADER */}
        <div className="fs-header">
          <div>
            <h1 className="fs-title">Tract {p.id}</h1>
            <p className="fs-subtitle">{p.tanc_local} Local Chapter</p>
          </div>
          <div style={{textAlign:'right'}}>
             <div style={{fontSize:'0.8rem', color:'#94a3b8', fontFamily:'sans-serif'}}>GENERATED REPORT</div>
             <div style={{fontSize:'1.2rem', fontWeight:'bold', fontFamily:'sans-serif'}}>{new Date().toLocaleDateString()}</div>
          </div>
        </div>

        {/* TOP STATS */}
        <div className="fs-grid">
          <div>
            <div className="fs-section-title">Primary Risk Factors</div>
            <div style={{display:'flex', gap:'30px', marginBottom:'20px'}}>
              <div>
                <div className="fs-big-stat" style={{color:'#ef3b2c'}}>{p.rent_burden}%</div>
                <div className="fs-stat-label">Rent Burden</div>
              </div>
              <div>
                <div className="fs-big-stat" style={{color:'#2563eb'}}>{p.unemployment}%</div>
                <div className="fs-stat-label">Unemployment</div>
              </div>
            </div>
            <p style={{lineHeight:1.6}}>
              This tract has a total population of <strong>{p.total_pop}</strong>. 
              {p.rent_burden > 40 ? " It is categorized as severely rent-burdened." : " Rent burden is moderate relative to the region."}
              {p.unemployment > 8 ? " Unemployment is significantly higher than the regional average." : ""}
            </p>
          </div>

          <div>
             <div className="fs-section-title">Demographics</div>
             <DemoBar p={p} height={20} />
             <div style={{marginTop:15}}>
                <div className="fs-row"><span>Black / African American</span> <strong>{p.pct_black}%</strong></div>
                <div className="fs-row"><span>Hispanic / Latinx</span> <strong>{p.pct_hispanic}%</strong></div>
                <div className="fs-row"><span>Asian</span> <strong>{p.pct_asian}%</strong></div>
                <div className="fs-row"><span>White / Other</span> <strong>{p.pct_white}%</strong></div>
             </div>
          </div>
        </div>

        {/* DETAILED TABLE */}
        <div className="fs-section-title">Housing & Economic Data</div>
        <table style={{width:'100%', borderCollapse:'collapse', fontFamily:'sans-serif', fontSize:'0.9rem'}}>
           <thead style={{background:'#f8fafc', borderBottom:'2px solid #0f172a'}}>
             <tr>
               <th style={{textAlign:'left', padding:10}}>Metric</th>
               <th style={{textAlign:'left', padding:10}}>Value</th>
               <th style={{textAlign:'left', padding:10}}>Status</th>
             </tr>
           </thead>
           <tbody>
             {[
               { l: 'Rent Burden', v: p.rent_burden, t: 30, unit: '%' },
               { l: 'Unemployment', v: p.unemployment, t: 5, unit: '%' },
               { l: 'Population', v: p.total_pop, t: 0, unit: '' },
             ].map(row => (
               <tr key={row.l} style={{borderBottom:'1px solid #eee'}}>
                 <td style={{padding:10, fontWeight:'600'}}>{row.l}</td>
                 <td style={{padding:10}}>{row.v}{row.unit}</td>
                 <td style={{padding:10}}>
                    {row.l !== 'Population' && (
                      <span style={{
                        background: row.v > row.t ? '#fee2e2' : '#dcfce7',
                        color: row.v > row.t ? '#991b1b' : '#166534',
                        padding:'2px 8px', borderRadius:4, fontSize:'0.8rem', fontWeight:'bold'
                      }}>
                        {row.v > row.t ? 'HIGH' : 'LOW'}
                      </span>
                    )}
                 </td>
               </tr>
             ))}
           </tbody>
        </table>

        <div style={{marginTop:40, padding:20, background:'#f8fafc', border:'1px dashed #cbd5e1', textAlign:'center', color:'#64748b', fontSize:'0.8rem', fontFamily:'sans-serif'}}>
           <em>Confidential Organizer Document • TANC Internal Use Only</em>
        </div>

      </div>
    </div>
  );
};


// --- UTILITIES ---

function generateDotPattern(density) {
  const size = 12; 
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0.8)'; 
  const r = 1.3;
  if (density >= 1) { ctx.beginPath(); ctx.arc(6, 6, r, 0, Math.PI*2); ctx.fill(); }
  if (density >= 2) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(12, 12, r, 0, Math.PI*2); ctx.fill(); }
  if (density >= 3) { ctx.beginPath(); ctx.arc(12, 0, r, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(0, 12, r, 0, Math.PI*2); ctx.fill(); }
  if (density >= 4) { ctx.beginPath(); ctx.arc(6, 0, r, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(6, 12, r, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(0, 6, r, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(12, 6, r, 0, Math.PI*2); ctx.fill(); }
  return ctx.getImageData(0, 0, size, size);
}

// --- MAIN APP ---

function App() {
  const mapRef = useRef();

  // STATE
  const [baseMetric, setBaseMetric] = useState('rent_burden');
  const [overlayMetric, setOverlayMetric] = useState('none');
  const [isTableExpanded, setIsTableExpanded] = useState(true);
  
  const [mapData, setMapData] = useState([]);
  const [allLocals, setAllLocals] = useState([]);
  const [selectedLocals, setSelectedLocals] = useState([]);
  
  const [hoverInfo, setHoverInfo] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [showFactSheet, setShowFactSheet] = useState(false); // NEW STATE

  // 1. LOAD DATA
  useEffect(() => {
    fetch('/data.geojson')
      .then(r => r.json())
      .then(json => {
        setMapData(json.features);
        const uniqueLocals = [...new Set(json.features.map(f => f.properties.tanc_local))].filter(Boolean).sort();
        setAllLocals(uniqueLocals);
        setSelectedLocals(uniqueLocals);
      })
      .catch(e => console.error("Error loading data:", e));
  }, []);

  // 2. LOAD PATTERNS
  const onMapLoad = (e) => {
    const map = e.target;
    [1, 2, 3, 4].forEach(level => {
      if (!map.hasImage(`dots-${level}`)) {
        map.addImage(`dots-${level}`, generateDotPattern(level));
      }
    });
  };

  // 3. MEMOS
  const sortedData = useMemo(() => {
    if (!mapData.length) return [];
    return mapData
      .map(f => f.properties)
      .filter(p => selectedLocals.includes(p.tanc_local))
      .sort((a, b) => (b[baseMetric] || 0) - (a[baseMetric] || 0));
  }, [mapData, selectedLocals, baseMetric]);

  const baseLayerStyle = useMemo(() => {
    const { max, color } = METRICS[baseMetric];
    return {
      id: 'census-base',
      type: 'fill',
      paint: {
        'fill-color': [
          'case',
          ['in', ['get', 'tanc_local'], ['literal', selectedLocals]],
          ['interpolate', ['linear'], ['get', baseMetric], 0, '#fff7ec', max, color],
          ['interpolate', ['linear'], ['get', baseMetric], 0, '#ffffff', max, '#555555']
        ],
        'fill-opacity': 0.6, 
        'fill-outline-color': 'rgba(0,0,0,0.2)'
      }
    };
  }, [baseMetric, selectedLocals]);

  const overlayLayerStyle = useMemo(() => {
    if (overlayMetric === 'none') return null;
    const { max } = METRICS[overlayMetric];
    const steps = [0.2, 0.4, 0.6, 0.8].map(p => max * p);
    
    return {
      id: 'census-pattern',
      type: 'fill',
      paint: {
        'fill-pattern': [
          'step', ['get', overlayMetric],
          'dots-1', steps[0], 'dots-1', steps[1], 'dots-2', steps[2], 'dots-3', steps[3], 'dots-4'
        ],
        'fill-opacity': 0.5
      },
      filter: ['all',
        ['in', ['get', 'tanc_local'], ['literal', selectedLocals]],
        ['>', ['get', overlayMetric], steps[0]]
      ]
    };
  }, [overlayMetric, selectedLocals]);

  const highlightFilter = useMemo(() => 
    selectedFeature ? ['==', 'id', selectedFeature.properties.id] : ['==', 'id', '']
  , [selectedFeature]);

  // HANDLERS
  const onCardClick = (p) => {
    const feature = mapData.find(f => f.properties.id === p.id);
    if (feature) {
      setSelectedFeature(feature);
      mapRef.current?.flyTo({ center: feature.geometry.coordinates[0][0], zoom: 13.5 });
    }
  };

  // REUSABLE CARD RENDERER
  const renderCardContent = (p) => (
    <>
      <div className="card-header-row">
        <div><span className="card-local">{p.tanc_local}</span><span className="card-id">#{p.id}</span></div>
        <span className="card-big-metric" style={{color: METRICS[baseMetric].color}}>{p[baseMetric]}%</span>
      </div>
      <div className="card-stats-grid">
        <div className="stat-box"><span className="stat-label">Pop</span><span className="stat-value">{p.total_pop}</span></div>
        <div className="stat-box"><span className="stat-label">Unemp</span><span className="stat-value" style={{color: p.unemployment > 8 ? '#2563eb' : '#333'}}>{p.unemployment}%</span></div>
        <div className="stat-box"><span className="stat-label">Burden</span><span className="stat-value" style={{color: p.rent_burden > 40 ? '#ef3b2c' : '#333'}}>{p.rent_burden}%</span></div>
      </div>
      <div style={{marginTop:10}}><DemoBar p={p} height={6} /></div>
    </>
  );

  return (
    <div className="app-container">
      {/* FACT SHEET MODAL */}
      {showFactSheet && <FactSheet feature={selectedFeature} onClose={() => setShowFactSheet(false)} />}

      <div className="middle-section">
        {/* LEFT SIDEBAR */}
        <div className="sidebar-left">
          <h1 className="app-header">TANC Map</h1>
          <div className="control-group">
            <span className="label-header">Color Metric</span>
            <select className="select-input" value={baseMetric} onChange={e => setBaseMetric(e.target.value)}>
              {Object.entries(METRICS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="control-group">
            <span className="label-header">Density Overlay</span>
            <select className="select-input" value={overlayMetric} onChange={e => setOverlayMetric(e.target.value)}>
              <option value="none">-- None --</option>
              {Object.entries(METRICS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="control-group">
            <span className="label-header">Filter Locals</span>
            <div className="checkbox-list">
              {allLocals.map(l => (
                <label key={l} className="checkbox-item">
                  <input type="checkbox" checked={selectedLocals.includes(l)}
                    onChange={() => setSelectedLocals(prev => prev.includes(l) ? prev.filter(x=>x!==l) : [...prev,l])}
                  /> {l}
                </label>
              ))}
            </div>
          </div>

          {/* LEFT INFO BOX */}
          {selectedFeature && (
            <div className="info-box-container">
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                <span className="label-header" style={{margin:0}}>Selected Tract</span>
                <button 
                  onClick={() => setShowFactSheet(true)}
                  style={{fontSize:'0.75rem', padding:'4px 8px', cursor:'pointer', background:'#0f172a', color:'white', border:'none', borderRadius:4}}
                >
                  View Fact Sheet
                </button>
              </div>
              <div className="stat-card">
                {renderCardContent(selectedFeature.properties)}
              </div>
            </div>
          )}
        </div>

        {/* MAP */}
        <div className="map-wrapper">
          <Map
            ref={mapRef}
            initialViewState={{ longitude: -122.2712, latitude: 37.8044, zoom: 11 }}
            mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
            style={{ width: '100%', height: '100%' }}
            onLoad={onMapLoad}
            onMouseMove={e => setHoverInfo(e.features && e.features[0] ? {feature:e.features[0], x:e.point.x, y:e.point.y} : null)}
            onClick={e => setSelectedFeature(e.features && e.features[0] || null)}
            interactiveLayerIds={['census-base']}
          >
            <Source type="geojson" data="/data.geojson">
              <Layer {...baseLayerStyle} />
              {overlayLayerStyle && <Layer {...overlayLayerStyle} />}
              <Layer {...HIGHLIGHT_STYLE} filter={highlightFilter} />
            </Source>
            {hoverInfo && (
              <Popup longitude={hoverInfo.feature.geometry.coordinates[0][0][0]} latitude={hoverInfo.feature.geometry.coordinates[0][0][1]} closeButton={false}>
                <div style={{color:'black', padding:'4px', fontWeight:'bold', fontSize:'0.9rem'}}>{hoverInfo.feature.properties[baseMetric]}%</div>
              </Popup>
            )}
          </Map>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="sidebar-right">
          <div className="right-header">
            <div><strong>Top Targets</strong><div style={{fontSize:'0.75rem', color:'#64748b'}}>Sorted by {METRICS[baseMetric].label}</div></div>
            <div className="bar-legend">
              <div className="legend-item"><div className="legend-dot" style={{background:'#ea580c'}}></div>Black</div>
              <div className="legend-item"><div className="legend-dot" style={{background:'#16a34a'}}></div>Hisp</div>
              <div className="legend-item"><div className="legend-dot" style={{background:'#9333ea'}}></div>Asian</div>
            </div>
          </div>
          <div className="right-scroll-area">
            {sortedData.slice(0, 50).map(p => (
              <div key={p.id} className={`stat-card interactive ${selectedFeature?.properties?.id === p.id ? 'active' : ''}`} onClick={() => onCardClick(p)}>
                {renderCardContent(p)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TABLE */}
      <div className={`table-section ${isTableExpanded ? 'expanded' : 'collapsed'}`}>
        <div className="table-header-bar" onClick={() => setIsTableExpanded(!isTableExpanded)}>
          <span>DATA GRID {isTableExpanded ? '▼' : '▲'}</span>
          <span style={{fontWeight:'normal', color:'#94a3b8'}}>{sortedData.length} records</span>
        </div>
        <div className="table-content">
          <table className="data-grid">
            <thead>
              <tr><th>Local</th><th>Tract ID</th><th>Rent Burden</th><th>Unemp</th><th>Pop</th><th>% Black</th><th>% Hisp</th><th>% Asian</th><th>% White</th></tr>
            </thead>
            <tbody>
              {sortedData.map(row => (
                <tr key={row.id} onClick={() => onCardClick(row)} className={selectedFeature?.properties?.id === row.id ? 'selected-row' : ''}>
                  <td>{row.tanc_local}</td><td style={{fontFamily:'monospace'}}>{row.id}</td>
                  <td style={{fontWeight:'bold', color: row.rent_burden > 40 ? '#dc2626' : 'inherit'}}>{row.rent_burden}%</td>
                  <td>{row.unemployment}%</td><td>{row.total_pop}</td><td>{row.pct_black}%</td><td>{row.pct_hispanic}%</td><td>{row.pct_asian}%</td><td>{row.pct_white}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;