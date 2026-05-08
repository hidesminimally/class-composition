import React, { useMemo, useCallback } from 'react';
import MapGL, { Source, Layer } from 'react-map-gl/maplibre';

const computeBbox = (features) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of features) {
    if (!f.geometry) continue;
    const polys = f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates]
      : f.geometry.coordinates;
    for (const poly of polys) {
      for (const ring of poly) {
        for (const [x, y] of ring) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
  }
  if (!isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
};

const MiniMap = ({ highlightFeatures = [], contextFeatures = [], color = '#dc2626', height = 220 }) => {
  const bbox = useMemo(() => computeBbox(highlightFeatures), [highlightFeatures]);

  const contextGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: contextFeatures,
  }), [contextFeatures]);

  const highlightGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: highlightFeatures,
  }), [highlightFeatures]);

  const onLoad = useCallback((e) => {
    if (!bbox) return;
    const map = e.target;
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
      padding: 24,
      animate: false,
      duration: 0,
    });
  }, [bbox]);

  if (!bbox) return null;

  const initialViewState = {
    longitude: (bbox[0] + bbox[2]) / 2,
    latitude: (bbox[1] + bbox[3]) / 2,
    zoom: 10,
  };

  return (
    <div style={{
      height,
      width: '100%',
      borderRadius: 6,
      overflow: 'hidden',
      border: '1px solid #e2e8f0',
      marginBottom: 20,
      position: 'relative',
    }}>
      <MapGL
        initialViewState={initialViewState}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        style={{ width: '100%', height: '100%' }}
        onLoad={onLoad}
        interactive={false}
        attributionControl={false}
      >
        {contextFeatures.length > 0 && (
          <Source id="mini-ctx" type="geojson" data={contextGeoJson}>
            <Layer id="mini-ctx-fill" type="fill" paint={{
              'fill-color': '#cbd5e1',
              'fill-opacity': 0.35,
            }} />
            <Layer id="mini-ctx-line" type="line" paint={{
              'line-color': '#94a3b8',
              'line-width': 0.3,
              'line-opacity': 0.5,
            }} />
          </Source>
        )}
        <Source id="mini-hl" type="geojson" data={highlightGeoJson}>
          <Layer id="mini-hl-fill" type="fill" paint={{
            'fill-color': color,
            'fill-opacity': 0.55,
          }} />
          <Layer id="mini-hl-line" type="line" paint={{
            'line-color': color,
            'line-width': 1.5,
          }} />
        </Source>
      </MapGL>
    </div>
  );
};

export default MiniMap;
