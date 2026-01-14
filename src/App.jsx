import React, { useState, useMemo, useRef, useEffect } from 'react';
import Map, { Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';

// 1. Hatch Pattern Generator for Overlay
function generateHatchPattern() {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 8, 8);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(8, 0);
  ctx.stroke();
  return ctx.getImageData(0, 0, 8, 8);
}

function App() {
  const mapRef = useRef();
  
  // STATE
  const [baseMetric, setBaseMetric] = useState('rent_burden');
  const [overlayMetric, setOverlayMetric] = useState('none');
  const [mapData, setMapData] = useState([]);
  const [allLocals, setAllLocals] = useState([]);
  const [selectedLocals, setSelectedLocals] = useState([]); 
  const [hoverInfo, setHoverInfo] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);

  const metrics = {
    rent_burden: { label: "Rent Burden", color: "#ef3b2c", max: 60 },
    unemployment: { label: "Unemployment", color: "#2171b5", max: 15 },
    pct_hispanic: { label: "% Hispanic", color: "#74c476", max: 80 },
    pct_black: { label: "% Black", color: "#fd8d3c", max: 80 },
    pct_asian: { label: "% Asian", color: "#8c6bb1", max: 80 },
    pct_white: { label: "% White", color: "#999999", max: 80 }
  };

  // 2. FETCH DATA
  useEffect(() => {
    fetch('/data.geojson')
      .then(r => r.json())
      .then(json => {
        setMapData(json.features);
        // Identify all unique locals in the dataset
        const locals = [...new Set(json.features.map(f => f.properties.tanc_local))].filter(Boolean).sort();
        setAllLocals(locals);
        setSelectedLocals(locals); // Select all by default
      })
      .catch(e => console.error(e));
  }, []);

  const onMapLoad = (e) => {
    if (!e.target.hasImage('hatch')) {
      e.target.addImage('hatch', generateHatchPattern());
    }
  };

  // 3. MAP STYLES
  const baseStyle = useMemo(() => {
    const { max, color } = metrics[baseMetric];
    
    return {
      id: 'base-layer',
      type: 'fill',
      paint: {
        'fill-color': [
          'case',
          // CASE 1: Area is in a SELECTED Local -> Use Color Gradient
          ['in', ['get', 'tanc_local'], ['literal', selectedLocals]],
          ['interpolate', ['linear'], ['get', baseMetric], 0, '#fff7ec', max, color],
          
          // CASE 2: Area is NOT selected -> Use Greyscale Gradient (Context)
          ['interpolate', ['linear'], ['get', baseMetric], 0, '#ffffff', max, '#555555']
        ],
        'fill-opacity': 0.85,
        'fill-outline-color': 'rgba(0,0,0,0.2)'
      }
    };
  }, [baseMetric, selectedLocals]);

  const overlayStyle = useMemo(() => {
    if (overlayMetric === 'none') return null;
    return {
      id: 'overlay-layer',
      type: 'fill',
      paint: { 'fill-pattern': 'hatch', 'fill-opacity': 0.5 },
      filter: ['>', ['get', overlayMetric], metrics[overlayMetric].max * 0.3]
    };
  }, [overlayMetric]);

  const highlightStyle = {
    id: 'highlight',
    type: 'line',
    paint: { 'line-color': '#00FFFF', 'line-width': 3 }
  };
  
  const highlightFilter = useMemo(() => 
    selectedFeature ? ['==', 'id', selectedFeature.properties.id] : ['==', 'id', '']
  , [selectedFeature]);

  // 4. SORTED DATA FOR TABLE
  const sortedData = useMemo(() => {
    if(!mapData.length) return [];
    return mapData
      .map(f => f.properties)
      .filter(p => selectedLocals.includes(p.tanc_local))
      .sort((a,b) => (b[baseMetric]||0) - (a[baseMetric]||0));
  }, [mapData, selectedLocals, baseMetric]);

  const onCardClick = (p) => {
    const feature = mapData.find(f => f.properties.id === p.id);
    if(feature) {
      setSelectedFeature(feature);
      mapRef.current?.flyTo({ center: feature.geometry.coordinates[0][0], zoom: 13.5 });
    }
  };

  const activeInfo = selectedFeature || hoverInfo?.feature;

  return (
    <div className="app-container">
      
      {/* TOP SECTION */}
      <div className="top-section">
        <div className="sidebar">
          <h2 style={{marginTop:0}}>✊ TANC Map</h2>
          
          <div className="control-group">
            <label>Color Layer (Base)</label>
            <select value={baseMetric} onChange={e => setBaseMetric(e.target.value)}>
              {Object.entries(metrics).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div className="control-group">
            <label>Overlay (Hatch)</label>
            <select value={overlayMetric} onChange={e => setOverlayMetric(e.target.value)}>
              <option value="none">-- None --</option>
              {Object.entries(metrics).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div className="control-group">
            <label>Filter Locals (Uncheck for Greyscale)</label>
            <div className="checkbox-list">
              {allLocals.map(l => (
                <div key={l} className="checkbox-row">
                  <input type="checkbox" checked={selectedLocals.includes(l)} 
                    onChange={() => setSelectedLocals(p => p.includes(l) ? p.filter(x=>x!==l) : [...p,l])}
                  />
                  <span style={{marginLeft:8}}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {activeInfo && (
            <div className="info-panel">
              <h3>Tract {activeInfo.properties.id}</h3>
              <p><b>{metrics[baseMetric].label}:</b> {activeInfo.properties[baseMetric]}%</p>
              <p><b>Population:</b> {activeInfo.properties.total_pop}</p>
              <small>{activeInfo.properties.tanc_local} Local</small>
            </div>
          )}
        </div>

        <div className="map-wrapper">
          <Map
            ref={mapRef}
            initialViewState={{ longitude: -122.2712, latitude: 37.8044, zoom: 11 }}
            mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
            style={{ width: '100%', height: '100%' }}
            onLoad={onMapLoad}
            onMouseMove={e => setHoverInfo(e.features && e.features[0] ? {feature:e.features[0], x:e.point.x, y:e.point.y} : null)}
            onClick={e => setSelectedFeature(e.features && e.features[0] || null)}
            interactiveLayerIds={['base-layer', 'overlay-layer']}
          >
            <Source type="geojson" data="/data.geojson">
              <Layer {...baseStyle} />
              {overlayStyle && <Layer {...overlayStyle} />}
              <Layer {...highlightStyle} filter={highlightFilter} />
            </Source>
            
            {hoverInfo && (
              <Popup longitude={hoverInfo.feature.geometry.coordinates[0][0][0]} 
                     latitude={hoverInfo.feature.geometry.coordinates[0][0][1]} 
                     closeButton={false}>
                <div style={{color:'black', padding:'5px'}}>
                  {hoverInfo.feature.properties[baseMetric]}%
                </div>
              </Popup>
            )}
          </Map>
        </div>
      </div>

      {/* BOTTOM SECTION: EXPANDED TABLE */}
      <div className="bottom-section">
        <div className="data-header">
          <h3>Ranked Tracts by {metrics[baseMetric].label}</h3>
          <span style={{fontSize:'0.9em', color:'#666'}}>{sortedData.length} tracts shown</span>
        </div>
        
        <div className="grid">
          {sortedData.slice(0, 100).map(p => (
            <div key={p.id} className="card" onClick={() => onCardClick(p)}>
              
              <div className="card-header">
                <div>
                  <div style={{fontWeight:'bold'}}>{p.tanc_local}</div>
                  <div style={{fontSize:'0.75em', color:'#888'}}>Tract #{p.id}</div>
                </div>
                <div style={{textAlign:'right'}}>
                   <div style={{fontSize:'0.8em', color:'#666'}}>Pop: {p.total_pop}</div>
                </div>
              </div>

              {/* Main Metric */}
              <div className="card-stat-main" style={{color: metrics[baseMetric].color}}>
                {p[baseMetric]}% <span style={{fontSize:'0.5em', color:'#333', fontWeight:'normal'}}>{metrics[baseMetric].label}</span>
              </div>
              
              {/* Demographic Breakdown Table */}
              <div style={{marginTop:'auto', paddingTop:'10px', borderTop:'1px dashed #eee'}}>
                <div style={{fontSize:'0.75em', fontWeight:'bold', marginBottom:'5px', color:'#999'}}>DEMOGRAPHICS</div>
                
                {[
                  { l: 'Black', k: 'pct_black', c: '#fd8d3c' },
                  { l: 'Hispanic', k: 'pct_hispanic', c: '#74c476' },
                  { l: 'Asian', k: 'pct_asian', c: '#8c6bb1' },
                  { l: 'White', k: 'pct_white', c: '#999' }
                ].map((d) => (
                  <div key={d.l} className="demo-row">
                    <span style={{width:'60px'}}>{d.l}</span>
                    <span style={{fontWeight:'bold'}}>{p[d.k]}%</span>
                    <div className="bar-bg">
                       <div className="bar-fill" style={{width: `${Math.min(p[d.k], 100)}%`, background: d.c}}></div>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

export default App;