import React, { useMemo, useRef, useCallback } from 'react';
import MapGL, { Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { METRICS, HIGHLIGHT_STYLE } from '../config/metrics';
import { computeTertiles } from '../lib/bivariate';
import { buildPatternFilter, buildPatternExpr } from '../lib/dualEncodingPaint';
import { makeHatchSprites } from '../lib/hatch';
import DualEncodingLegend from './DualEncodingLegend';

const TancMap = React.forwardRef(({ baseMetric, overlayMetric, selectedLocals, selectedFeature, onSelect, hoverInfo, allFeatures }, ref) => {
  const mapRef = useRef();
  React.useImperativeHandle(ref, () => ({
    flyTo: (opts) => mapRef.current?.flyTo(opts)
  }));

  // Compute county-wide tertile breaks once when allFeatures changes (i.e., at app load).
  // Held stable as the user toggles selectedLocals.
  const tertileBreaks = useMemo(() => {
    if (!allFeatures || !allFeatures.length) return {};
    const breaks = {};
    for (const metric of Object.keys(METRICS)) {
      const values = allFeatures.map(f => f.properties[metric]);
      breaks[metric] = computeTertiles(values);
    }
    return breaks;
  }, [allFeatures]);

  const isDual = overlayMetric && overlayMetric !== 'none' && tertileBreaks[overlayMetric];

  // Register hatch sprites on the underlying maplibre instance once it loads.
  // Both sprites are needed even in univariate mode (the user can flip the
  // dropdown at any time and the layer's fill-pattern needs them already there).
  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    const sprites = makeHatchSprites();
    for (const [id, image] of Object.entries(sprites)) {
      if (!map.hasImage(id)) map.addImage(id, image, { pixelRatio: 1 });
    }
  }, []);

  const baseLayerStyle = useMemo(() => {
    const m = METRICS[baseMetric];
    // Diverging: blue→neutral→red across [low, 0, high]; null treated as 0 (no change).
    // Sequential: cream→accent across [0, max]; legacy behavior, null falls to lowest.
    const fillExpr = m.kind === 'diverging'
      ? ['interpolate', ['linear'], ['coalesce', ['to-number', ['get', baseMetric]], 0],
          m.domain[0], m.colors[0],
          m.domain[1], m.colors[1],
          m.domain[2], m.colors[2]]
      : ['interpolate', ['linear'], ['get', baseMetric], 0, '#fff7ec', m.max, m.color];
    return {
      id: 'census-base', type: 'fill',
      paint: {
        'fill-color': ['case',
          ['in', ['get', 'tanc_local'], ['literal', selectedLocals]],
          fillExpr,
          '#eee'],
        'fill-opacity': 0.6,
      },
    };
  }, [baseMetric, selectedLocals]);

  const patternLayerStyle = useMemo(() => {
    if (!isDual) return null;
    const yBreaks = tertileBreaks[overlayMetric];
    return {
      id: 'census-pattern',
      type: 'fill',
      filter: buildPatternFilter(overlayMetric, yBreaks, selectedLocals),
      paint: {
        'fill-pattern': buildPatternExpr(overlayMetric, yBreaks),
        'fill-opacity': 0.85,
      },
    };
  }, [isDual, overlayMetric, tertileBreaks, selectedLocals]);

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
        onLoad={onMapLoad}
        onClick={e => onSelect(e.features?.[0] || null)}
        interactiveLayerIds={['census-base']}
      >
        <Source type="geojson" data="/data.geojson">
          <Layer {...baseLayerStyle} />
          {patternLayerStyle && <Layer {...patternLayerStyle} />}
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
              {isDual && <span> · {hoverInfo.feature.properties[overlayMetric]}% {METRICS[overlayMetric]?.label}</span>}
            </div>
          </Popup>
        )}
      </MapGL>
      {isDual && <DualEncodingLegend xMetric={baseMetric} yMetric={overlayMetric} />}
    </>
  );
});

export default TancMap;
