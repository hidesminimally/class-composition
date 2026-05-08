import React, { useState, useMemo, useRef, useEffect } from 'react';
import './App.css';
import { METRICS } from './config/metrics';
import FactSheet from './components/FactSheet';
import ConsolidatedReport from './components/ConsolidatedReport';
import Card from './components/Card';
import DataTable from './components/DataTable';
import TancMap from './components/Map';
import TargetingPanel from './components/TargetingPanel';
import VersionBadge from './components/VersionBadge';
import Landing from './components/Landing';
import { calculateAggregate } from './lib/aggregate';
import { sortFeatures, filterByLocals } from './lib/sort';
import { getCentroid } from './lib/targeting';

function App() {
  const mapRef = useRef();
  const selectedCardRef = useRef(null);
  const [view, setView] = useState('landing'); // 'landing' | 'map'
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
      setAllLocals(uniqueLocals);
      setSelectedLocals(uniqueLocals.includes('Central') ? ['Central'] : uniqueLocals);
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

  // Top 50 by current sort, but force the selected tract into the list so the
  // user can always see/scroll-to it even if it ranks below 50 on this metric.
  const visibleFeatures = useMemo(() => {
    const top = sortedFeatures.slice(0, 50);
    const selId = selectedFeature?.properties?.id;
    if (!selId || selId === 'AGGREGATE') return top;
    if (top.some(f => f.properties.id === selId)) return top;
    const selInList = sortedFeatures.find(f => f.properties.id === selId);
    return selInList ? [selInList, ...top] : top;
  }, [sortedFeatures, selectedFeature]);

  useEffect(() => {
    if (!selectedFeature || selectedFeature.properties.id === 'AGGREGATE') return;
    selectedCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedFeature?.properties?.id]);

  // Defensive: pattern density can't encode signed change, so a diverging metric
  // in the overlay slot is meaningless. The dropdown filters them out, but if a
  // user lands here from a stale URL/state, clear it.
  useEffect(() => {
    if (overlayMetric !== 'none' && METRICS[overlayMetric]?.kind === 'diverging') {
      setOverlayMetric('none');
    }
  }, [overlayMetric]);

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
            <FactSheet p={selectedFeature.properties} allFeatures={mapData} />
          </div>
        </div>
      )}

      {showConsolidated && (
        <ConsolidatedReport
          locals={selectedLocals}
          dataFunc={aggregateFor}
          allFeatures={mapData}
          onClose={() => setShowConsolidated(false)}
        />
      )}

      <div className="view-switch">
        <button
          className={`view-tab ${view === 'landing' ? 'active' : ''}`}
          onClick={() => setView('landing')}
        >Locals overview</button>
        <button
          className={`view-tab ${view === 'map' ? 'active' : ''}`}
          onClick={() => setView('map')}
        >TANC Map</button>
      </div>

      {view === 'landing' && (
        <Landing
          features={mapData}
          allLocals={allLocals}
          aggregateFor={aggregateFor}
          onOpenLocal={(localName) => {
            const aggStats = aggregateFor(localName);
            if (aggStats) {
              setSelectedFeature({ properties: aggStats, geometry: null });
              setShowFactSheet(true);
            }
          }}
          onDrillToMap={(localName) => {
            setSelectedLocals([localName]);
            setView('map');
          }}
        />
      )}

      {view === 'map' && (
      <>
      <div className="middle-section">
        <div className={`sidebar-left ${activeTab === 'controls' ? 'mobile-active' : ''}`}>
          <h1 className="app-header">TANC Map</h1>
          <div className="control-group"><span className="label-header">Metric</span><div className="select-wrapper"><select className="select-input" value={baseMetric} onChange={e => setBaseMetric(e.target.value)}>{Object.entries(METRICS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div></div>
          <div className="control-group"><span className="label-header">Second Metric (overlay pattern)</span><div className="select-wrapper"><select className="select-input" value={overlayMetric} onChange={e => setOverlayMetric(e.target.value)}><option value="none">-- None (color only) --</option>{Object.entries(METRICS).filter(([k,v]) => k !== baseMetric && v.kind !== 'diverging').map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}</select></div><div style={{fontSize:'0.65rem', color:'#94a3b8', marginTop:4, lineHeight:1.4}}>Pattern density shows magnitude only. Diverging metrics (signed change) belong in the color slot above.</div></div>
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
                    title="Filter and export this local's tracts (sliders, sort, CSV for blockwalking)"
                    onClick={() => setTargetingLocal(targetingLocal === l ? null : l)}
                    style={{
                      background: targetingLocal === l ? '#2563eb' : 'transparent',
                      color: targetingLocal === l ? 'white' : '#2563eb',
                      border: '1px solid #2563eb',
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 4,
                      marginLeft: 4,
                    }}
                  >{targetingLocal === l ? '✓ Tracts' : 'Tracts'}</button>
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
          {targetingLocal && (
            <TargetingPanel
              tracts={targetingFeatures}
              currentLocal={targetingLocal}
              onSelectTract={(t) => onSelect(t)}
            />
          )}
          <div className="list-section">
            <div className="right-header"><div>Top Targets</div><div className="bar-legend"><div className="legend-item"><div className="legend-dot" style={{background:'#ea580c'}}/>Blk</div><div className="legend-item"><div className="legend-dot" style={{background:'#16a34a'}}/>Hisp</div><div className="legend-item"><div className="legend-dot" style={{background:'#9333ea'}}/>Asn</div></div></div>
            {visibleFeatures.map(f => {
              const isSel = f.properties.id === selectedFeature?.properties?.id;
              return (
                <Card
                  key={f.properties.id}
                  ref={isSel ? selectedCardRef : null}
                  feature={f}
                  metric={baseMetric}
                  overlayMetric={overlayMetric}
                  isSelected={isSel}
                  onClick={() => onSelect(f)}
                  onFactSheet={() => setShowFactSheet(true)}
                  onDeselect={() => onSelect(null)}
                />
              );
            })}
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
      </>
      )}

      <VersionBadge />
    </div>
  );
}

export default App;
