import React, { useState, useEffect, useMemo, useRef } from 'react';
import Map, { Source, Layer, Popup, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Search, Info, X, Maximize2, Minimize2, Download, Table as TableIcon } from 'lucide-react';
import Papa from 'papaparse';
import * as maplibregl from 'maplibre-gl';

// --- PATTERN GENERATOR UTILITY ---
// This creates simple diagonal line patterns (cross-hatch) in memory
// so we don't need external image files.
function createPattern(density = 'medium', color = 'black') {
  const size = density === 'dense' ? 8 : density === 'sparse' ? 16 : 12;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Transparent background
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, size, size);

  // Draw Line
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

const App = () => {
  // --- STATE ---
  const [data, setData] = useState([]);
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [hoveredFeature, setHoveredFeature] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Variable Selection State
  const [baseVariable, setBaseVariable] = useState('Rent Burden'); // Controls Color
  const [overlayVariable, setOverlayVariable] = useState('None');  // Controls Pattern

  const mapRef = useRef(null);

  // Load Data
  useEffect(() => {
    // Load CSV
    Papa.parse('/data/tanc_data_clean.csv', {
      download: true,
      header: true,
      complete: (results) => {
        setData(results.data);
      }
    });

    // Load GeoJSON
    fetch('/data/tanc_map_data.geojson')
      .then(res => res.json())
      .then(data => setGeoJsonData(data));
  }, []);

  // --- MAP PATTERN INITIALIZATION ---
  // When the map loads, we generate our hatch patterns and add them to the map style
  const onMapLoad = (e) => {
    const map = e.target;
    if (!map.hasImage('pattern-sparse')) map.addImage('pattern-sparse', createPattern('sparse', '#333'));
    if (!map.hasImage('pattern-medium')) map.addImage('pattern-medium', createPattern('medium', '#333'));
    if (!map.hasImage('pattern-dense')) map.addImage('pattern-dense', createPattern('dense', '#333'));
  };

  // --- VARIABLE CONFIGURATION ---
  // Helper to get color scale based on variable
  const getFillColor = (variable) => {
    switch (variable) {
      case 'Rent Burden':
        return [
          'interpolate', ['linear'], ['get', 'Rent Burden'],
          0, '#f7f7f7',
          20, '#cccccc',
          40, '#969696',
          60, '#525252',
          80, '#252525'
        ];
      case 'Percent White':
        return [
          'interpolate', ['linear'], ['get', 'Percent White'],
          0, '#fff5f0', 50, '#fb6a4a', 100, '#67000d'
        ];
      case 'Percent Black':
        return [
          'interpolate', ['linear'], ['get', 'Percent Black'],
          0, '#f7fbff', 50, '#6baed6', 100, '#08306b'
        ];
      case 'Percent Asian':
        return [
          'interpolate', ['linear'], ['get', 'Percent Asian'],
          0, '#f7fcf5', 50, '#74c476', 100, '#00441b'
        ];
      default:
        return '#cccccc';
    }
  };

  // Helper to get pattern based on overlay variable
  const getFillPattern = (variable) => {
    if (variable === 'None') return undefined;
    
    // Example logic: Higher values = denser patterns
    // We use a 'step' expression to assign patterns based on values
    return [
      'step', ['get', variable],
      'pattern-sparse', // Default (low value)
      10, 'pattern-medium',
      20, 'pattern-dense'
    ];
  };

  // --- FILTERED DATA FOR TABLE ---
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;
    return data.filter(row => 
      Object.values(row).some(val => 
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [data, searchTerm]);

  return (
    // 1. CHANGED: removed "h-screen overflow-hidden", added "min-h-screen flex-col"
    <div className="flex flex-col min-h-screen bg-gray-50 font-sans">
      
      {/* HEADER */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <h1 className="text-xl font-bold text-gray-800">TANC Data Map</h1>
        <div className="flex gap-4 text-sm">
            <a href="#" className="text-blue-600 hover:underline">About</a>
            <a href="#" className="text-blue-600 hover:underline">Methodology</a>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      {/* 2. CHANGED: This section holds the Map and Controls. It is NOT full screen anymore. */}
      <div className="flex flex-col lg:flex-row h-[80vh]"> 
        
        {/* SIDEBAR CONTROLS */}
        <div className="w-full lg:w-80 bg-white border-r p-4 flex flex-col gap-6 overflow-y-auto">
          
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Info size={16}/> Map Layers
            </h2>
            
            {/* BASE LAYER SELECTOR */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Base Color (Fill)</label>
              <select 
                className="w-full p-2 border rounded bg-white"
                value={baseVariable}
                onChange={(e) => setBaseVariable(e.target.value)}
              >
                <option value="Rent Burden">Rent Burden</option>
                <option value="Percent White">% White</option>
                <option value="Percent Black">% Black</option>
                <option value="Percent Asian">% Asian</option>
              </select>
            </div>

            {/* OVERLAY LAYER SELECTOR */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">Overlay Pattern (Hatch)</label>
              <select 
                className="w-full p-2 border rounded bg-white"
                value={overlayVariable}
                onChange={(e) => setOverlayVariable(e.target.value)}
              >
                <option value="None">None</option>
                {/* Assuming these columns exist in your data, otherwise map them */}
                <option value="Unemployment">Unemployment (Mock)</option> 
                <option value="Poverty Rate">Poverty Rate (Mock)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Adds a cross-hatch pattern on top of the base color.
              </p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h2 className="font-semibold text-gray-700 mb-2">Search</h2>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <input 
                type="text"
                placeholder="Search zip, city..."
                className="w-full pl-9 pr-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

        </div>

        {/* MAP CONTAINER */}
        <div className="flex-grow relative bg-gray-200">
          <Map
            ref={mapRef}
            initialViewState={{
              longitude: -122.27,
              latitude: 37.80,
              zoom: 10
            }}
            mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
            onLoad={onMapLoad}
            interactiveLayerIds={['tanc-fill']}
            onMouseMove={(e) => {
              if (e.features && e.features.length > 0) {
                setHoveredFeature(e.features[0]);
              } else {
                setHoveredFeature(null);
              }
            }}
          >
            <NavigationControl position="top-right" />

            {geoJsonData && (
              <Source type="geojson" data={geoJsonData}>
                {/* 1. BASE COLOR LAYER */}
                <Layer
                  id="tanc-fill"
                  type="fill"
                  paint={{
                    'fill-color': getFillColor(baseVariable),
                    'fill-opacity': 0.8,
                    'fill-outline-color': '#ffffff'
                  }}
                />

                {/* 2. OVERLAY PATTERN LAYER */}
                {/* This only renders if an overlay variable is selected */}
                {overlayVariable !== 'None' && (
                  <Layer
                    id="tanc-pattern"
                    type="fill"
                    paint={{
                      'fill-pattern': getFillPattern(overlayVariable),
                      'fill-opacity': 0.5 // Semi-transparent pattern
                    }}
                  />
                )}

                {/* HIGHLIGHT LAYER (Hover) */}
                {hoveredFeature && (
                  <Layer
                    id="tanc-highlight"
                    type="line"
                    paint={{
                      'line-color': '#000000',
                      'line-width': 2
                    }}
                    filter={['==', 'id', hoveredFeature.properties.id || '']} 
                  />
                )}
              </Source>
            )}

            {/* POPUP */}
            {hoveredFeature && (
              <Popup
                longitude={hoveredFeature.geometry.coordinates[0][0][0]}
                latitude={hoveredFeature.geometry.coordinates[0][0][1]}
                closeButton={false}
                closeOnClick={false}
                className="z-50"
              >
                <div className="p-2">
                  <h3 className="font-bold">{hoveredFeature.properties.name || 'Zone'}</h3>
                  <div className="text-sm">
                    <p>{baseVariable}: {hoveredFeature.properties[baseVariable]}</p>
                    {overlayVariable !== 'None' && (
                       <p>{overlayVariable}: {hoveredFeature.properties[overlayVariable]}</p>
                    )}
                  </div>
                </div>
              </Popup>
            )}
          </Map>
        </div>
      </div>

      {/* 3. CHANGED: TABLE SECTION */}
      {/* Now sits below the map, full width, allowing page scroll */}
      <div className="bg-white border-t p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-2xl font-bold flex items-center gap-2">
               <TableIcon /> Detailed Data
             </h2>
             <button className="flex items-center gap-2 px-4 py-2 border rounded hover:bg-gray-50 text-sm">
               <Download size={16}/> Export CSV
             </button>
          </div>
          
          <div className="overflow-x-auto border rounded-lg shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-100 text-gray-600 uppercase font-medium">
                <tr>
                  <th className="px-6 py-3 border-b">Zip/Tract</th>
                  <th className="px-6 py-3 border-b">City</th>
                  <th className="px-6 py-3 border-b">Rent Burden</th>
                  <th className="px-6 py-3 border-b">% White</th>
                  <th className="px-6 py-3 border-b">% Black</th>
                  <th className="px-6 py-3 border-b">% Asian</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredData.slice(0, 50).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium">{row.zip || row.tract}</td>
                    <td className="px-6 py-3">{row.city || 'N/A'}</td>
                    <td className="px-6 py-3">{row['Rent Burden']}</td>
                    <td className="px-6 py-3">{row['Percent White']}</td>
                    <td className="px-6 py-3">{row['Percent Black']}</td>
                    <td className="px-6 py-3">{row['Percent Asian']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredData.length > 50 && (
              <div className="p-4 text-center text-gray-500 bg-gray-50 border-t">
                Showing first 50 results. Search to refine.
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default App;