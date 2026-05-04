import React, { useState, useMemo, useRef, useEffect } from 'react';
import './App.css';
import { METRICS } from './config/metrics';
import FactSheet from './components/FactSheet';
import ConsolidatedReport from './components/ConsolidatedReport';
import Card from './components/Card';
import DataTable from './components/DataTable';
import TancMap from './components/Map';
import TargetingPanel from './components/TargetingPanel';
import { calculateAggregate } from './lib/aggregate';
import { sortFeatures, filterByLocals } from './lib/sort';
import { getCentroid } from './lib/targeting';

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
  const [targetingLocal, setTargetingLocal] = useState(null);

  useEffect(() => {
    fetch('/data.geojson').then(r => r.json()).then(json => {
      setMapData(json.features);
      const uniqueLocals = [...new Set(json.features.map(f => f.properties.tanc_local))].filter(Boolean).sort();
      setAllLocals(uniqueLocals); setSelectedLocals(uniqueLocals);
    }).catch(console.error);
  }, []);

  const aggregateFor = (localName) => calculateAggregate(mapData, localName);

  const onLocalClick = (localName) => {
    const aggStats = aggregateFor(localName);
    if (aggStats) {
      setSelectedFeature({ properties: aggStats, geometry: null });
      setShowFactSheet(true);
    }
  };

  // Features (with geometry preserved) for the Top Targets list,
  // DataTable, and any other consumer that needs to flyTo on click.
  const sortedFeatures = useMemo(
    () => sortFeatures(filterByLocals(mapData, selectedLocals), sortKey, sortAsc),
    [mapData, selectedLocals, sortKey, sortAsc]
  );

  const handleSort = (key) => { if (sortKey === key) setSortAsc(!sortAsc); else { setSortKey(key); setSortAsc(false); } };

  const targetingFeatures = useMemo(() => {
    if (!targetingLocal) return [];
    return mapData.filter(f => f.properties.tanc_local === targetingLocal);
  }, [mapData, targetingLocal]);

  const onSelect = (f) => {
    setSelectedFeature(f);
    if (f && f.geometry) {
      const c = getCentroid(f.geometry);
      if (c) mapRef.current?.flyTo({ center: c, zoom: 13.5 });
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
          dataFunc={aggregateFor}
          onClose={() => setShowConsolidated(false)}
        />
      )}
      <div className="middle-section">
        <div className={`sidebar-left ${activeTab === 'controls' ? 'mobile-active' : ''}`}>
          <h1 className="app-header">TANC Map</h1>
          <div className="control-group"><span className="label-header">Metric</span><div className="select-wrapper"><select className="select-input" value={baseMetric} onChange={e => setBaseMetric(e.target.value)}>{Object.entries(METRICS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div></div>
          <div className="control-group"><span className="label-header">Second Metric (bivariate)</span><div className="select-wrapper"><select className="select-input" value={overlayMetric} onChange={e => setOverlayMetric(e.target.value)}><option value="none">-- None (univariate) --</option>{Object.entries(METRICS).filter(([k]) => k !== baseMetric).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div></div>
          <div className="control-group">
            <span className="label-header">Locals</span>
            <button onClick={() => setShowConsolidated(true)} style={{width:'100%',padding:'10px',marginBottom:'12px',background:'#2563eb',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontWeight:'bold',fontSize:'0.8rem'}}>
              Generate Report ({selectedLocals.length})
            </button>
            <div className="checkbox-list">
              {allLocals.map(l => (
                <div key={l} className="checkbox-row">
                  <input type="checkbox" checked={selectedLocals.includes(l)} onChange={() => setSelectedLocals(p => p.includes(l) ? p.filter(x=>x!==l) : [...p,l])} />
                  <span className="local-label-btn" onClick={() => onLocalClick(l)} style={{flex:1}}>{l}</span>
                  <button
                    title="Open targeting panel"
                    onClick={() => setTargetingLocal(targetingLocal === l ? null : l)}
                    style={{background:'none', border:'none', cursor:'pointer', fontSize:'1rem', padding:'0 4px', opacity: targetingLocal === l ? 1 : 0.5}}
                  >🎯</button>
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
          {selectedFeature && selectedFeature.properties.id !== 'AGGREGATE' && (<div className="pinned-section"><Card feature={selectedFeature} metric={baseMetric} isPinned={true} onClick={() => onSelect(null)} onFactSheet={() => setShowFactSheet(true)} /></div>)}
          {targetingLocal && (
            <TargetingPanel
              tracts={targetingFeatures}
              currentLocal={targetingLocal}
              onSelectTract={(t) => onSelect(t)}
            />
          )}
          <div className="list-section">
            <div className="right-header"><div>Top Targets</div><div className="bar-legend"><div className="legend-item"><div className="legend-dot" style={{background:'#ea580c'}}/>Blk</div><div className="legend-item"><div className="legend-dot" style={{background:'#16a34a'}}/>Hisp</div><div className="legend-item"><div className="legend-dot" style={{background:'#9333ea'}}/>Asn</div></div></div>
            {sortedFeatures.slice(0, 50).map(f => <Card key={f.properties.id} feature={f} metric={baseMetric} isPinned={false} onClick={() => onSelect(f)} />)}
          </div>
        </div>
      </div>

      <div className="mobile-nav"><div className={`tab ${activeTab === 'controls'?'active':''}`} onClick={()=>setActiveTab('controls')}>Filters</div><div className={`tab ${activeTab === 'targets'?'active':''}`} onClick={()=>setActiveTab('targets')}>List</div><div className={`tab ${activeTab === 'table'?'active':''}`} onClick={()=>setActiveTab('table')}>Data</div></div>

      <DataTable
        features={sortedFeatures}
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
