import React, { useMemo, useRef } from 'react';
import MapGL, { Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { METRICS, HIGHLIGHT_STYLE } from '../config/metrics';

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

const TancMap = React.forwardRef(({ baseMetric, overlayMetric, selectedLocals, selectedFeature, onSelect, hoverInfo }, ref) => {
  const mapRef = useRef();
  React.useImperativeHandle(ref, () => ({
    flyTo: (opts) => mapRef.current?.flyTo(opts)
  }));

  const onMapLoad = (e) => {
    [1, 2, 3, 4].forEach(level => {
      if (!e.target.hasImage(`dots-${level}`)) e.target.addImage(`dots-${level}`, generateDotPattern(level));
    });
  };

  const baseLayerStyle = useMemo(() => ({
    id: 'census-base', type: 'fill',
    paint: {
      'fill-color': ['case',
        ['in', ['get', 'tanc_local'], ['literal', selectedLocals]],
        ['interpolate', ['linear'], ['get', baseMetric], 0, '#fff7ec', METRICS[baseMetric].max, METRICS[baseMetric].color],
        '#eee'],
      'fill-opacity': 0.6
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

  const highlightFilter = useMemo(() =>
    (selectedFeature && selectedFeature.properties.id !== 'AGGREGATE')
      ? ['==', 'id', selectedFeature.properties.id]
      : ['==', 'id', ''],
    [selectedFeature]
  );

  return (
    <MapGL
      ref={mapRef}
      initialViewState={{ longitude: -122.2712, latitude: 37.8044, zoom: 11 }}
      mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      style={{width:'100%',height:'100%'}}
      onLoad={onMapLoad}
      onClick={e => onSelect(e.features?.[0] || null)}
      interactiveLayerIds={['census-base']}
    >
      <Source type="geojson" data="/data.geojson">
        <Layer {...baseLayerStyle} />
        {overlayLayerStyle && <Layer {...overlayLayerStyle} />}
        <Layer {...HIGHLIGHT_STYLE} filter={highlightFilter} />
      </Source>
      {hoverInfo && (
        <Popup
          longitude={hoverInfo.feature.geometry.coordinates[0][0][0]}
          latitude={hoverInfo.feature.geometry.coordinates[0][0][1]}
          closeButton={false}
        >
          <div style={{color:'black', padding:'4px', fontWeight:'bold', fontSize:'0.9rem'}}>
            {hoverInfo.feature.properties[baseMetric]}%
          </div>
        </Popup>
      )}
    </MapGL>
  );
});

export default TancMap;
