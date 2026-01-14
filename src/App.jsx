import React, { useState, useMemo, useRef, useEffect } from 'react';
import Map, { Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import './App.css';

function App() {
  const mapRef = useRef();
  const [metric, setMetric] = useState('rent_burden');
  
  // DATA STATE
  const [mapData, setMapData] = useState([]);
  const [allLocals, setAllLocals] = useState([]);
  const [selectedLocals, setSelectedLocals] = useState([]); 
  
  // SELECTION STATE
  const [hoverInfo, setHoverInfo] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);

  const metrics = {
    rent_burden: { label: "Rent Burden", color: "#ef3b2c", max: 60 },
    unemployment: { label: "Unemployment", color: "#2171b5", max: 15 },
    pct_hispanic: { label: "% Hispanic", color: "#74c476", max: 80 },
    pct_black: { label: "% Black", color: "#fd8d3c", max: 80 }
  };

  // --- 1. FETCH & INITIALIZE ---
  useEffect(() => {
    fetch('/data.geojson')
      .then(resp => resp.json())
      .then(json => {
        const features = json.features;
        setMapData(features);

        // AUTO-DETECT LOCALS
        const uniqueLocals = [...new Set(features.map(f => f.properties.tanc_local))].filter(Boolean).sort();
        setAllLocals(uniqueLocals);
        setSelectedLocals(uniqueLocals); 
      })
      .catch(err => console.error("Could not load map data:", err));
  }, []);

  // --- 2. MAP STYLES ---
  const layerStyle = useMemo(() => {
    const maxVal = metrics[metric].max;
    const activeColor = metrics[metric].color;
    
    return {
      id: 'census-data',
      type: 'fill',
      paint: {
        'fill-color': [
          'case',
          // CONDITION: Is the tract's local in our selected list?
          ['in', ['get', 'tanc_local'], ['literal', selectedLocals]],
          
          // TRUE (Selected): Use Colorful Gradient
          ['interpolate', ['linear'], ['get', metric], 0, '#f7f7f7', maxVal, activeColor],
          
          // FALSE (Unselected): Use Greyscale Gradient
          ['interpolate', ['linear'], ['get', metric], 0, '#f7f7f7', maxVal, '#888888']
        ],
        'fill-opacity': 0.8,
        'fill-outline-color': '#999'
      }
    };
  }, [metric, selectedLocals]);

  const highlightStyle = {
    id: 'highlight-layer',
    type: 'line',
    paint: { 'line-color': '#00FFFF', 'line-width': 3 }
  };

  const highlightFilter = useMemo(() => 
    selectedFeature ? ['==', ['get', 'id'], selectedFeature.properties.id] : ['==', 'id', '']
  , [selectedFeature]);

  // --- 3. HIGH PRIORITY LOGIC ---
  const highPriority = useMemo(() => {
    if (!mapData.length) return [];
    return mapData
      .map(f => f.properties)
      .filter(p => selectedLocals.includes(p.tanc_local)) 
      .filter(p => p.rent_burden > 35 && p.total_pop > 500)
      .sort((a, b) => b.rent_burden - a.rent_burden)
      .slice(0, 10);
  }, [mapData, selectedLocals]);

  // --- HANDLERS ---
  const onMapClick = (event) => {
    const feature = event.features && event.features[0];
    
    // Logic: If clicking the SAME feature, deselect it. Otherwise select new.
    if (feature && selectedFeature && feature.properties.id === selectedFeature.properties.id) {
        setSelectedFeature(null);
    } else {
        setSelectedFeature(feature || null);
    }
  };

  const onListClick = (properties) => {
      const feature = mapData.find(f => f.properties.id === properties.id);
      if (feature) setSelectedFeature(feature);
  };

  const toggleLocal = (local) => {
    setSelectedLocals(prev => 
      prev.includes(local) ? prev.filter(l => l !== local) : [...prev, local]
    );
  };

  const activeInfo = selectedFeature || hoverInfo?.feature;

  return (
    <div className="app-container">
      <div className="sidebar">
        <h2 className="logo">✊ TANC Map</h2>
        
        <div className="control-group">
          <label>Data Layer</label>
          <select value={metric} onChange={e => setMetric(e.target.value)}>
            <option value="rent_burden">Rent Burden</option>
            <option value="unemployment">Unemployment Rate</option>
            <option value="pct_hispanic">% Hispanic</option>
            <option value="pct_black">% Black</option>
          </select>
        </div>

        <div className="control-group">
          <label>Focus Local</label>
          <p className="small-text" style={{marginBottom:'10px'}}>Uncheck to see context (Greyscale).</p>
          <div className="checkbox-group">
            {allLocals.length === 0 && <p className="small-text">Loading...</p>}
            {allLocals.map(local => (
              <div key={local} className="checkbox-row">
                <input 
                  type="checkbox" id={local} 
                  checked={selectedLocals.includes(local)} 
                  onChange={() => toggleLocal(local)}
                />
                <label htmlFor={local} style={{marginLeft:'8px', cursor:'pointer'}}>{local}</label>
              </div>
            ))}
          </div>
        </div>

        <hr />
        
        {/* INFO BOX */}
        <div className={`info-box ${selectedFeature ? 'locked' : ''}`}>
          {activeInfo ? (
            <>
              <div style={{display:'flex', justifyContent:'space-between'}}>
                <h3>Tract {activeInfo.properties.id}</h3>
                {selectedFeature && <button onClick={() => setSelectedFeature(null)} style={{fontSize:'0.8em'}}>✕ Clear</button>}
              </div>
              <div className="stat-row">
                <span>{metrics[metric].label}:</span>
                <strong>{activeInfo.properties[metric]}%</strong>
              </div>
              <div className="stat-row"><span>Local:</span><span>{activeInfo.properties.tanc_local}</span></div>
              <div className="stat-row"><span>Population:</span><span>{activeInfo.properties.total_pop}</span></div>
            </>
          ) : (
            <p><i>Hover to preview, Click to lock.</i></p>
          )}
        </div>

        <hr />
        <h3>🔥 High Priority</h3>
        <p className="small-text">Showing targets in <b>selected</b> locals.</p>
        <div className="target-list">
            {highPriority.length === 0 && <p className="small-text">No targets found.</p>}
            {highPriority.map(p => (
                <div key={p.id} className="target-item" onClick={() => onListClick(p)}>
                    <strong>{p.rent_burden}% Burden</strong>
                    <br/><span className="small-text">{p.tanc_local} ({p.id})</span>
                </div>
            ))}
        </div>
      </div>

      <div className="map-wrapper">
        <Map
          ref={mapRef}
          initialViewState={{ longitude: -122.2712, latitude: 37.8044, zoom: 11 }}
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          onMouseMove={evt => setHoverInfo(evt.features && evt.features[0] ? { feature: evt.features[0], x: evt.point.x, y: evt.point.y } : null)}
          onClick={onMapClick}
          interactiveLayerIds={['census-data']}
        >
          <Source type="geojson" data="/data.geojson">
            <Layer {...layerStyle} />
            <Layer {...highlightStyle} filter={highlightFilter} />
          </Source>
          
          {/* FIX: Removed !selectedFeature check. 
            Now the tooltip appears even if something is selected. 
          */}
          {hoverInfo && (
            <Popup
              longitude={hoverInfo.feature.geometry.coordinates[0][0][0]}
              latitude={hoverInfo.feature.geometry.coordinates[0][0][1]}
              closeButton={false}
              anchor="bottom"
            >
              <div style={{color: 'black', padding: '5px'}}><b>{hoverInfo.feature.properties[metric]}%</b></div>
            </Popup>
          )}
        </Map>
      </div>
    </div>
  );
}

export default App;