import React, { useState, useMemo, useRef, useEffect } from 'react';
import Map, { Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';

// --- CONFIG ---
const METRICS = {
  rent_burden: { label: "Rent Burden", color: "#ef3b2c", max: 60 },
  unemployment: { label: "Unemployment", color: "#2563eb", max: 15 },
  pct_hispanic: { label: "% Hispanic", color: "#16a34a", max: 80 },
  pct_black: { label: "% Black", color: "#ea580c", max: 80 },
  pct_asian: { label: "% Asian", color: "#9333ea", max: 80 },
  pct_white: { label: "% White", color: "#64748b", max: 80 }
};

const HIGHLIGHT_STYLE = {
  id: 'highlight', type: 'line',
  paint: { 'line-color': '#00FFFF', 'line-width': 4 }
};

// --- HELPERS ---
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

const DemoBar = ({ p, height = 8 }) => (
  <div style={{ display: 'flex', height: height, width: '100%', borderRadius: 3, overflow: 'hidden', background: '#e2e8f0' }}>
    <div style={{ width: `${p.pct_black}%`, background: '#ea580c' }} title="Black" />
    <div style={{ width: `${p.pct_hispanic}%`, background: '#16a34a' }} title="Hispanic" />
    <div style={{ width: `${p.pct_asian}%`, background: '#9333ea' }} title="Asian" />
    <div style={{ flex: 1, background: '#cbd5e1' }} title="White/Other" />
  </div>
);

// --- COMPONENTS ---
const Card = ({ p, metric, isPinned, onClick, onFactSheet }) => (
  <div className={`stat-card ${isPinned ? 'pinned' : 'interactive'}`} onClick={onClick}>
    <div className="card-top">
      <div>
        <div className="card-title">{p.tanc_local}</div>
        <div className="card-subtitle">Tract {p.id}</div>
      </div>
      <div className="card-metric-main" style={{color: METRICS[metric].color}}>
        {p[metric]}%
      </div>
    </div>
    <div className="card-grid">
      <div className="stat-item"><span className="stat-lbl">Pop</span><span className="stat-val">{p.total_pop}</span></div>
      <div className="stat-item"><span className="stat-lbl">Unemp</span><span className="stat-val">{p.unemployment}%</span></div>
      <div className="stat-item"><span className="stat-lbl">Burden</span><span className="stat-value">{p.rent_burden}%</span></div>
    </div>
    <div className="bar-viz">
      <div style={{width:`${p.pct_black}%`, background:'#ea580c'}} title="Black"/>
      <div style={{width:`${p.pct_hispanic}%`, background:'#16a34a'}} title="Hispanic"/>
      <div style={{width:`${p.pct_asian}%`, background:'#9333ea'}} title="Asian"/>
      <div style={{flex:1, background:'#e5e7eb'}}/>
    </div>
    {isPinned && (
      <button onClick={(e) => { e.stopPropagation(); onFactSheet(); }} className="fs-btn">
        Open Full Fact Sheet
      </button>
    )}
  </div>
);

const FactSheet = ({ feature, onClose }) => {
  if (!feature) return null;
  const p = feature.properties;
  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="sheet-paper" onClick={e => e.stopPropagation()}>
        <div style={{display:'flex', justifyContent:'space-between', marginBottom:30, borderBottom:'4px solid #0f172a', paddingBottom:20}}>
          <div>
            <h1 style={{margin:0, fontSize:'2rem', lineHeight:1}}>Tract {p.id}</h1>
            <div style={{color:'#64748b', marginTop:5, fontFamily:'sans-serif'}}>{p.tanc_local} Local Chapter</div>
          </div>
          <button onClick={onClose} style={{height:40, background:'#f1f5f9', border:'none', padding:'0 20px', borderRadius:4, cursor:'pointer', fontWeight:'bold', fontSize:'0.9rem'}}>Close</button>
        </div>
        
        <div className="fs-grid">
          <div>
            <h3 style={{borderBottom:'1px solid #ddd', paddingBottom:8, color:'#64748b', textTransform:'uppercase', fontSize:'0.8rem', fontFamily:'sans-serif', fontWeight:800}}>Risk Profile</h3>
            <div style={{display:'flex', gap:30, marginBottom:20, marginTop:15}}>
              <div><div className="fs-big-stat" style={{color:'#ef3b2c'}}>{p.rent_burden}%</div><div style={{fontFamily:'sans-serif', fontSize:'0.9rem', color:'#64748b'}}>Rent Burden</div></div>
              <div><div className="fs-big-stat" style={{color:'#2563eb'}}>{p.unemployment}%</div><div style={{fontFamily:'sans-serif', fontSize:'0.9rem', color:'#64748b'}}>Unemployment</div></div>
            </div>
            <p style={{lineHeight:1.6}}>
              Total population: <strong>{p.total_pop}</strong>. 
              {p.rent_burden > 40 ? " This tract is severely rent-burdened." : " Rent burden is moderate."}
            </p>
          </div>
          
          <div>
            <h3 style={{borderBottom:'1px solid #ddd', paddingBottom:8, color:'#64748b', textTransform:'uppercase', fontSize:'0.8rem', fontFamily:'sans-serif', fontWeight:800}}>Demographics</h3>
            <div style={{marginTop:15, marginBottom:15}}>
              <div style={{display:'flex', height:20, borderRadius:4, overflow:'hidden'}}>
                <div style={{width:`${p.pct_black}%`, background:'#ea580c'}}/>
                <div style={{width:`${p.pct_hispanic}%`, background:'#16a34a'}}/>
                <div style={{width:`${p.pct_asian}%`, background:'#9333ea'}}/>
                <div style={{flex:1, background:'#e5e7eb'}}/>
              </div>
            </div>
            <div className="fs-row"><span>Black</span><strong>{p.pct_black}%</strong></div>
            <div className="fs-row"><span>Hispanic</span><strong>{p.pct_hispanic}%</strong></div>
            <div className="fs-row"><span>Asian</span><strong>{p.pct_asian}%</strong></div>
            <div className="fs-row"><span>White</span><strong>{p.pct_white}%</strong></div>
          </div>
        </div>
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
  const [showFactSheet, setShowFactSheet] = useState(false);
  
  const [sortKey, setSortKey] = useState('rent_burden');
  const [sortAsc, setSortAsc] = useState(false);
  
  const [mapData, setMapData] = useState([]);
  const [allLocals, setAllLocals] = useState([]);
  const [selectedLocals, setSelectedLocals] = useState([]);
  const [hoverInfo, setHoverInfo] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);

  useEffect(() => {
    fetch('/data.geojson').then(r => r.json()).then(json => {
        setMapData(json.features);
        const uniqueLocals = [...new Set(json.features.map(f => f.properties.tanc_local))].filter(Boolean).sort();
        setAllLocals(uniqueLocals);
        setSelectedLocals(uniqueLocals);
      }).catch(e => console.error(e));
  }, []);

  const onMapLoad = (e) => {
    [1, 2, 3, 4].forEach(level => { if (!e.target.hasImage(`dots-${level}`)) e.target.addImage(`dots-${level}`, generateDotPattern(level)); });
  };

  const sortedData = useMemo(() => {
    if (!mapData.length) return [];
    return mapData.map(f => f.properties).filter(p => selectedLocals.includes(p.tanc_local))
      .sort((a, b) => {
        const valA = a[sortKey] || 0; const valB = b[sortKey] || 0;
        return sortAsc ? valA - valB : valB - valA;
      });
  }, [mapData, selectedLocals, sortKey, sortAsc]);

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const baseLayerStyle = useMemo(() => ({
    id: 'census-base', type: 'fill',
    paint: {
      'fill-color': ['case', ['in', ['get', 'tanc_local'], ['literal', selectedLocals]], ['interpolate', ['linear'], ['get', baseMetric], 0, '#fff7ec', METRICS[baseMetric].max, METRICS[baseMetric].color], ['interpolate', ['linear'], ['get', baseMetric], 0, '#ffffff', METRICS[baseMetric].max, '#555555']],
      'fill-opacity': 0.6, 'fill-outline-color': 'rgba(0,0,0,0.1)'
    }
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

  const highlightFilter = useMemo(() => selectedFeature ? ['==', 'id', selectedFeature.properties.id] : ['==', 'id', ''], [selectedFeature]);

  const onSelect = (feature) => {
    setSelectedFeature(feature);
    if (feature) {
      mapRef.current?.flyTo({ center: feature.geometry.coordinates[0][0], zoom: 13.5 });
      if (window.innerWidth <= 768) setActiveTab('targets');
    }
  };

  const getSortIcon = (key) => sortKey !== key ? <span style={{opacity:0.3}}>↕</span> : (sortAsc ? '↑' : '↓');

  return (
    <div className="app-container">
      {showFactSheet && <FactSheet feature={selectedFeature} onClose={() => setShowFactSheet(false)} />}

      <div className="middle-section">
        {/* FILTERS */}
        <div className={`sidebar-left ${activeTab === 'controls' ? 'mobile-active' : ''}`}>
          <h1 className="app-header">TANC Map</h1>
          <div className="control-group">
            <span className="label-header">Color Metric</span>
            <div className="select-wrapper"><select className="select-input" value={baseMetric} onChange={e => setBaseMetric(e.target.value)}>{Object.entries(METRICS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          </div>
          <div className="control-group">
            <span className="label-header">Density Overlay</span>
            <div className="select-wrapper"><select className="select-input" value={overlayMetric} onChange={e => setOverlayMetric(e.target.value)}><option value="none">-- None --</option>{Object.entries(METRICS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          </div>
          <div className="control-group">
            <span className="label-header">Filter Locals</span>
            <div className="checkbox-list">
              {allLocals.map(l => (
                <label key={l} className="checkbox-item">
                  <input type="checkbox" checked={selectedLocals.includes(l)} onChange={() => setSelectedLocals(prev => prev.includes(l) ? prev.filter(x=>x!==l) : [...prev,l])} /> {l}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* MAP */}
        <div className="map-wrapper">
          <Map
            ref={mapRef} initialViewState={{ longitude: -122.2712, latitude: 37.8044, zoom: 11 }}
            mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
            style={{ width: '100%', height: '100%' }} onLoad={onMapLoad}
            onMouseMove={e => setHoverInfo(e.features && e.features[0] ? {feature:e.features[0], x:e.point.x, y:e.point.y} : null)}
            onClick={e => onSelect(e.features && e.features[0] || null)}
            interactiveLayerIds={['census-base']}
          >
            <Source type="geojson" data="/data.geojson">
              <Layer {...baseLayerStyle} />{overlayLayerStyle && <Layer {...overlayLayerStyle} />}<Layer {...HIGHLIGHT_STYLE} filter={highlightFilter} />
            </Source>
            {hoverInfo && (
              <Popup longitude={hoverInfo.feature.geometry.coordinates[0][0][0]} latitude={hoverInfo.feature.geometry.coordinates[0][0][1]} closeButton={false}>
                <div style={{color:'black', padding:'4px', fontWeight:'bold', fontSize:'0.9rem'}}>{hoverInfo.feature.properties[baseMetric]}%</div>
              </Popup>
            )}
          </Map>
        </div>

        {/* TARGETS */}
        <div className={`sidebar-right ${activeTab === 'targets' ? 'mobile-active' : ''}`}>
          {selectedFeature && (
            <div className="pinned-section">
              <div className="pinned-header"><span>Selected Tract</span><button onClick={() => setSelectedFeature(null)} style={{background:'none', border:'none', cursor:'pointer'}}>×</button></div>
              <Card p={selectedFeature.properties} metric={baseMetric} isPinned={true} onClick={() => {}} onFactSheet={() => setShowFactSheet(true)} />
            </div>
          )}
          <div className="list-section">
            <div className="list-header"><span>Top Targets</span><span>{sortedData.length} total</span></div>
            {sortedData.slice(0, 50).map(p => (
              <Card key={p.id} p={p} metric={baseMetric} isPinned={false} onClick={() => onSelect({ type:'Feature', geometry: p.geometry || { coordinates: [[[-122,37]]], type: 'Polygon' }, properties: p })} />
            ))}
          </div>
        </div>
      </div>

      <div className="mobile-nav">
        <div className={`tab ${activeTab === 'controls' ? 'active' : ''}`} onClick={() => setActiveTab('controls')}>Filters</div>
        <div className={`tab ${activeTab === 'targets' ? 'active' : ''}`} onClick={() => setActiveTab('targets')}>Targets</div>
        <div className={`tab ${activeTab === 'table' ? 'active' : ''}`} onClick={() => setActiveTab('table')}>Data</div>
      </div>

      <div className={`table-section ${isTableExpanded ? 'expanded' : 'collapsed'} ${activeTab === 'table' ? 'mobile-active' : ''}`}>
        <div className="table-bar" onClick={() => setIsTableExpanded(!isTableExpanded)}>
          <span>Data Grid {isTableExpanded ? '▼' : '▲'}</span>
          <span>{sortedData.length} records</span>
        </div>
        <div className="table-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th onClick={() => handleSort('tanc_local')}>Local {getSortIcon('tanc_local')}</th>
                <th onClick={() => handleSort('id')}>ID {getSortIcon('id')}</th>
                <th onClick={() => handleSort('rent_burden')}>Burden {getSortIcon('rent_burden')}</th>
                <th onClick={() => handleSort('unemployment')}>Unemp {getSortIcon('unemployment')}</th>
                <th onClick={() => handleSort('total_pop')}>Pop {getSortIcon('total_pop')}</th>
                <th onClick={() => handleSort('pct_black')}>Blk {getSortIcon('pct_black')}</th>
                <th onClick={() => handleSort('pct_hispanic')}>Hisp {getSortIcon('pct_hispanic')}</th>
                <th onClick={() => handleSort('pct_asian')}>Asn {getSortIcon('pct_asian')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map(row => (
                <tr key={row.id} onClick={() => onSelect({ properties: row, geometry: { coordinates: [[[-122,37]]] } })} className={selectedFeature?.properties?.id === row.id ? 'is-selected' : ''}>
                  <td>{row.tanc_local}</td><td>{row.id}</td>
                  <td style={{fontWeight:'bold', color: row.rent_burden > 40 ? '#dc2626' : 'inherit'}}>{row.rent_burden}%</td>
                  <td>{row.unemployment}%</td><td>{row.total_pop}</td><td>{row.pct_black}%</td><td>{row.pct_hispanic}%</td><td>{row.pct_asian}%</td>
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