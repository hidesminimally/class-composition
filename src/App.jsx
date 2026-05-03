import React, { useState, useMemo, useRef, useEffect } from 'react';
import Map, { Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';

import { METRICS, HIGHLIGHT_STYLE } from './config/metrics';
import FactSheet from './components/FactSheet';
import ConsolidatedReport from './components/ConsolidatedReport';
import Card from './components/Card';
import DataTable from './components/DataTable';

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

  return (
    <div className="app-container">
      {/* SINGLE FACT SHEET */}
      {showFactSheet && selectedFeature && (
        <div className="fs-overlay" onClick={() => setShowFactSheet(false)}>
          <div className="fs-paper" onClick={e => e.stopPropagation()}>
            <button className="fs-close" onClick={() => setShowFactSheet(false)}>Close</button>
            <FactSheet p={selectedFeature.properties} />
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

      <DataTable
        rows={sortedData}
        isExpanded={isTableExpanded}
        onToggleExpanded={() => setIsTableExpanded(!isTableExpanded)}
        sortKey={sortKey}
        sortAsc={sortAsc}
        onSort={handleSort}
        selectedId={selectedFeature?.properties.id}
        onSelect={onSelect}
        mobileActive={activeTab === 'table'}
      />
    </div>
  );
}

export default App;