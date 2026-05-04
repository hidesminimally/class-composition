import React, { useMemo, useRef } from 'react';
import MapGL, { Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { METRICS, HIGHLIGHT_STYLE } from '../config/metrics';
import { computeTertiles } from '../lib/bivariate';
import { buildBivariateFillExpr } from '../lib/bivariatePaint';
import BivariateLegend from './BivariateLegend';

const TancMap = React.forwardRef(({ baseMetric, overlayMetric, selectedLocals, selectedFeature, onSelect, hoverInfo, allFeatures }, ref) => {
  const mapRef = useRef();
  React.useImperativeHandle(ref, () => ({
    flyTo: (opts) => mapRef.current?.flyTo(opts)
  }));

  // Compute county-wide tertile breaks once when allFeatures changes (i.e., at app load).
  // Held stable as user toggles selectedLocals.
  const tertileBreaks = useMemo(() => {
    if (!allFeatures || !allFeatures.length) return {};
    const breaks = {};
    for (const metric of Object.keys(METRICS)) {
      const values = allFeatures.map(f => f.properties[metric]);
      breaks[metric] = computeTertiles(values);
    }
    return breaks;
  }, [allFeatures]);

  const isBivariate = overlayMetric && overlayMetric !== 'none' && tertileBreaks[overlayMetric] && tertileBreaks[baseMetric];

  // Univariate base layer (dimmed when bivariate is active so swatch shows through cleanly)
  const baseLayerStyle = useMemo(() => {
    if (isBivariate) {
      const xBreaks = tertileBreaks[baseMetric];
      const yBreaks = tertileBreaks[overlayMetric];
      const fillColor = buildBivariateFillExpr(baseMetric, overlayMetric, xBreaks, yBreaks, selectedLocals);
      return {
        id: 'census-base', type: 'fill',
        paint: { 'fill-color': fillColor, 'fill-opacity': 0.75 }
      };
    }
    // Univariate
    return {
      id: 'census-base', type: 'fill',
      paint: {
        'fill-color': ['case',
          ['in', ['get', 'tanc_local'], ['literal', selectedLocals]],
          ['interpolate', ['linear'], ['get', baseMetric], 0, '#fff7ec', METRICS[baseMetric].max, METRICS[baseMetric].color],
          '#eee'],
        'fill-opacity': 0.6
      }
    };
  }, [baseMetric, overlayMetric, selectedLocals, tertileBreaks, isBivariate]);

  const highlightFilter = useMemo(() =>
    (selectedFeature && selectedFeature.properties.id !== 'AGGREGATE')
      ? ['==', 'id', selectedFeature.properties.id]
      : ['==', 'id', ''],
    [selectedFeature]
  );

  return (
    <>
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: -122.2712, latitude: 37.8044, zoom: 11 }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        style={{width:'100%',height:'100%'}}
        onClick={e => onSelect(e.features?.[0] || null)}
        interactiveLayerIds={['census-base']}
      >
        <Source type="geojson" data="/data.geojson">
          <Layer {...baseLayerStyle} />
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
              {isBivariate && <span> · {hoverInfo.feature.properties[overlayMetric]}% {METRICS[overlayMetric]?.label}</span>}
            </div>
          </Popup>
        )}
      </MapGL>
      {isBivariate && <BivariateLegend xMetric={baseMetric} yMetric={overlayMetric} />}
    </>
  );
});

export default TancMap;
