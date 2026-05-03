import React, { useState, useMemo, useRef, useEffect } from 'react';
import './App.css';
import { METRICS } from './config/metrics';
import FactSheet from './components/FactSheet';
import ConsolidatedReport from './components/ConsolidatedReport';
import Card from './components/Card';
import DataTable from './components/DataTable';
import TancMap from './components/Map';

function App() {
  const mapRef = useRef();
  const [baseMetric, setBaseMetric] = useState('rent_burden');
  const [overlayMetric, setOverlayMetric] = useState('none');
  const [isTableExpanded, setIsTableExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState('controls');
  const [showFactSheet, setShowFactSheet] = useState(false);
  const [showConsolidated, setShowConsolidated] = useState(false);
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

  return (
    <div className="app-container">
      {showFactSheet && selectedFeature && (
        <div className="fs-overlay" onClick={() => setShowFactSheet(false)}>
          <div className="fs-paper" onClick={e => e.stopPropagation()}>
            <button className="fs-close" onClick={() => setShowFactSheet(false)}>Close</button>
            <FactSheet p={selectedFeature.properties} />
          </div>
        </div>
      )}

      {showConsolidated && (
        <ConsolidatedReport
          locals={selectedLocals}
          dataFunc={calculateAggregate}
          onClose={() => setShowConsolidated(false)}
        />
      )}
      <div className="middle-section">
        <div className={`sidebar-left ${activeTab === 'controls' ? 'mobile-active' : ''}`}>
          <h1 className="app-header">TANC Map</h1>
          <div className="control-group"><span className="label-header">Metric</span><div className="select-wrapper"><select className="select-input" value={baseMetric} onChange={e => setBaseMetric(e.target.value)}>{Object.entries(METRICS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div></div>
          <div className="control-group"><span className="label-header">Second Metric (bivariate)</span><div className="select-wrapper"><select className="select-input" value={overlayMetric} onChange={e => setOverlayMetric(e.target.value)}><option value="none">-- None (univariate) --</option>{Object.entries(METRICS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div></div>
          <div className="control-group">
            <span className="label-header">Locals</span>
            <button onClick={() => setShowConsolidated(true)} style={{width:'100%',padding:'10px',marginBottom:'12px',background:'#2563eb',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontWeight:'bold',fontSize:'0.8rem'}}>
              Generate Report ({selectedLocals.length})
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
          <TancMap
            ref={mapRef}
            baseMetric={baseMetric}
            overlayMetric={overlayMetric}
            selectedLocals={selectedLocals}
            selectedFeature={selectedFeature}
            onSelect={onSelect}
            hoverInfo={hoverInfo}
            allFeatures={mapData}
          />
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