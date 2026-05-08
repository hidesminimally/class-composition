import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

// "Granular" view (label kept in sync with App.jsx tab text). Renders Oakland
// habitability + 311-housing complaint POINTS over a faint tract overlay.
// Tract polygons (the existing Census tract geojson) sit underneath at low
// opacity so an organizer can see which tract a complaint falls in.
//
// Data files are produced by a parallel build script and may not exist yet.
// Fetch is 404-safe — missing files render an inline placeholder rather than
// crashing the app.
//
// Layers:
//   tracts-faint        — grey outlines (always on)
//   tracts-density      — choropleth fill, only shown when "Tract aggregates" mode is on
//   habitability-clusters / habitability-points — red/orange
//   oak311-clusters / oak311-points              — blue/teal
//
// Click cluster → zoom to expansion zoom (standard maplibre cluster pattern).
// Click point   → popup with case ID, type, status, date, address.

const HAB_URL = '/data/oakland_habitability.geojson';
const OAK311_URL = '/data/oakland_311_housing.geojson';
const HAB_BY_TRACT_URL = '/data/oakland_habitability_by_tract.json';
const OAK311_BY_TRACT_URL = '/data/oakland_311_housing_by_tract.json';
const TRACTS_URL = '/data.geojson'; // existing Census tract polygons

// Soft 404-tolerant fetch. Returns null when the file isn't there yet
// (the data agent's build may still be running) or the JSON is malformed.
async function safeJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch (_) {
    return null;
  }
}

const GranularMap = ({ onOpenNotes }) => {
  const mapRef = useRef();
  const [habitability, setHabitability] = useState(null);
  const [oak311, setOak311] = useState(null);
  const [habByTract, setHabByTract] = useState(null);
  const [oak311ByTract, setOak311ByTract] = useState(null);
  const [tracts, setTracts] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // UI state
  const [showHabitability, setShowHabitability] = useState(true);
  const [show311, setShow311] = useState(true);
  // 'points' = clustered dots, 'heatmap' = kernel-density blob, 'tracts' = choropleth
  const [viewMode, setViewMode] = useState('points');
  const [aggregateSource, setAggregateSource] = useState('habitability'); // 'habitability' | 'oak311'
  const [popup, setPopup] = useState(null);

  const aggregateMode = viewMode === 'tracts';
  const heatmapMode = viewMode === 'heatmap';
  const pointsMode = viewMode === 'points';

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      safeJson(HAB_URL),
      safeJson(OAK311_URL),
      safeJson(HAB_BY_TRACT_URL),
      safeJson(OAK311_BY_TRACT_URL),
      safeJson(TRACTS_URL),
    ]).then(([h, o, hbt, obt, t]) => {
      if (cancelled) return;
      setHabitability(h);
      setOak311(o);
      setHabByTract(hbt);
      setOak311ByTract(obt);
      setTracts(t);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Merge the tract-aggregate JSON into the tract geojson. The aggregate file
  // may be either a flat object {tract_id: count} or an array of {id, count}.
  // Build a lookup, then write the count onto each feature for the choropleth.
  const tractsWithDensity = useMemo(() => {
    if (!tracts || !aggregateMode) return null;
    const src = aggregateSource === 'habitability' ? habByTract : oak311ByTract;
    if (!src) return null;
    const lookup = new Map();
    if (Array.isArray(src)) {
      for (const r of src) {
        const id = r.id ?? r.tract_id ?? r.geoid ?? r.GEOID;
        if (id != null) lookup.set(String(id), r.count ?? r.n ?? 0);
      }
    } else if (typeof src === 'object') {
      for (const [k, v] of Object.entries(src)) {
        lookup.set(String(k), typeof v === 'number' ? v : (v?.count ?? 0));
      }
    }
    return {
      ...tracts,
      features: tracts.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          _density: lookup.get(String(f.properties?.id ?? '')) ?? 0,
        },
      })),
    };
  }, [tracts, habByTract, oak311ByTract, aggregateMode, aggregateSource]);

  const densityMax = useMemo(() => {
    if (!tractsWithDensity) return 0;
    let m = 0;
    for (const f of tractsWithDensity.features) {
      const v = f.properties._density || 0;
      if (v > m) m = v;
    }
    return m;
  }, [tractsWithDensity]);

  // Cluster click → zoom to expansion zoom. Standard pattern from maplibre docs.
  const handleClick = useCallback((e) => {
    const feat = e.features?.[0];
    if (!feat) { setPopup(null); return; }
    const map = mapRef.current?.getMap?.();
    const isCluster = !!feat.properties?.cluster;
    if (isCluster && map) {
      const sourceId = feat.layer.source;
      const clusterId = feat.properties.cluster_id;
      const src = map.getSource(sourceId);
      if (src && src.getClusterExpansionZoom) {
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({
            center: feat.geometry.coordinates,
            zoom: Math.min((zoom || map.getZoom()) + 0.2, 17),
            duration: 400,
          });
        });
      }
      return;
    }
    // Single point — show popup.
    if (feat.geometry?.type === 'Point') {
      const p = feat.properties || {};
      setPopup({
        lng: feat.geometry.coordinates[0],
        lat: feat.geometry.coordinates[1],
        props: p,
        layer: feat.layer.id,
      });
    }
  }, []);

  // Layers we want to be clickable. Only register IDs whose source is loaded
  // — passing an id whose layer doesn't exist yet emits a maplibre warning.
  const interactiveLayerIds = useMemo(() => {
    const ids = [];
    if (habitability && showHabitability && pointsMode) {
      ids.push('hab-clusters', 'hab-points');
    }
    if (oak311 && show311 && pointsMode) {
      ids.push('oak311-clusters', 'oak311-points');
    }
    if (aggregateMode && tractsWithDensity) {
      ids.push('tracts-density');
    }
    return ids;
  }, [habitability, oak311, showHabitability, show311, pointsMode, aggregateMode, tractsWithDensity]);

  const noData = loaded && !habitability && !oak311 && !tracts;
  const partialDataMsg = loaded
    ? buildPartialMsg({ habitability, oak311, tracts })
    : 'Loading…';

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <aside style={{
        width: 260, minWidth: 260,
        background: 'white',
        borderRight: '1px solid var(--border)',
        padding: 16, overflowY: 'auto',
        flexShrink: 0,
      }} className="granular-controls">
        <h1 className="app-header" style={{ marginBottom: 16 }}>Granular</h1>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 0 }}>
          Building-level complaint points over Oakland Census tracts. Click a
          cluster to zoom in; click a point for case detail.
        </p>

        <div className="control-group">
          <span className="label-header">Layers</span>
          <label style={layerToggleStyle}>
            <input
              type="checkbox"
              checked={showHabitability}
              onChange={(e) => setShowHabitability(e.target.checked)}
              disabled={!habitability}
            />
            <span style={{ ...colorDot, background: '#dc2626' }} />
            <span>Habitability complaints {habitability ? `(${habitability.features?.length ?? 0})` : '(unavailable)'}</span>
          </label>
          <label style={layerToggleStyle}>
            <input
              type="checkbox"
              checked={show311}
              onChange={(e) => setShow311(e.target.checked)}
              disabled={!oak311}
            />
            <span style={{ ...colorDot, background: '#0891b2' }} />
            <span>311 housing-related {oak311 ? `(${oak311.features?.length ?? 0})` : '(unavailable)'}</span>
          </label>
        </div>

        <div className="control-group">
          <span className="label-header">View mode</span>
          <label style={layerToggleStyle}>
            <input
              type="radio"
              name="view-mode"
              checked={pointsMode}
              onChange={() => setViewMode('points')}
            />
            <span>Points (clustered dots)</span>
          </label>
          <label style={layerToggleStyle}>
            <input
              type="radio"
              name="view-mode"
              checked={heatmapMode}
              onChange={() => setViewMode('heatmap')}
              disabled={!habitability && !oak311}
            />
            <span>Heatmap (point density)</span>
          </label>
          <label style={layerToggleStyle}>
            <input
              type="radio"
              name="view-mode"
              checked={aggregateMode}
              onChange={() => setViewMode('tracts')}
              disabled={!habByTract && !oak311ByTract}
            />
            <span>Tract aggregates (choropleth)</span>
          </label>
          {aggregateMode && (
            <div style={{ marginTop: 8 }}>
              <select
                className="select-input"
                value={aggregateSource}
                onChange={(e) => setAggregateSource(e.target.value)}
              >
                <option value="habitability" disabled={!habByTract}>Habitability density</option>
                <option value="oak311" disabled={!oak311ByTract}>311 density</option>
              </select>
            </div>
          )}
          {heatmapMode && (
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 8, marginBottom: 0 }}>
              Hot zones = highest complaint density. Use this to scan which blocks
              have the most pressure and prioritize canvassing.
            </p>
          )}
        </div>

        {!loaded && (
          <div style={infoBoxStyle}>Loading data…</div>
        )}
        {loaded && partialDataMsg && (
          <div style={infoBoxStyle}>{partialDataMsg}</div>
        )}
      </aside>

      <div style={{ flex: 1, position: 'relative' }}>
        {noData ? (
          <div style={emptyStateStyle}>
            <div>
              <h2 style={{ marginTop: 0 }}>Data not yet available</h2>
              <p style={{ color: 'var(--text-muted)', maxWidth: 420 }}>
                The complaint datasets are built by a separate pipeline. When the
                build finishes the files will appear at <code>/data/oakland_habitability.geojson</code>
                {' '}and <code>/data/oakland_311_housing.geojson</code> and this view
                will populate. Refresh once the build is done.
              </p>
            </div>
          </div>
        ) : (
          <MapGL
            ref={mapRef}
            initialViewState={{ longitude: -122.2712, latitude: 37.8044, zoom: 11 }}
            mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
            style={{ width: '100%', height: '100%' }}
            onClick={handleClick}
            interactiveLayerIds={interactiveLayerIds}
          >
            {/* Tract outlines — always on, faded. */}
            {tracts && (
              <Source id="tracts" type="geojson" data={tracts}>
                {aggregateMode && tractsWithDensity ? (
                  <Layer
                    id="tracts-density"
                    type="fill"
                    paint={{
                      'fill-color': [
                        'interpolate', ['linear'],
                        ['coalesce', ['get', '_density'], 0],
                        0, '#f8fafc',
                        Math.max(densityMax, 1) * 0.25, '#fde68a',
                        Math.max(densityMax, 1) * 0.5,  '#fb923c',
                        Math.max(densityMax, 1),        '#b91c1c',
                      ],
                      'fill-opacity': 0.7,
                    }}
                  />
                ) : null}
                <Layer
                  id="tracts-outline"
                  type="line"
                  paint={{ 'line-color': '#475569', 'line-opacity': 0.2, 'line-width': 0.6 }}
                />
              </Source>
            )}

            {/* Tract aggregate fill mode — switch from points to choropleth. */}
            {aggregateMode && tractsWithDensity && (
              <Source id="tracts-density-src" type="geojson" data={tractsWithDensity}>
                {/* The visible density fill is rendered above on the same data, but
                    we keep this empty source-block placeholder for symmetry / future
                    hover-popups on density tracts. */}
              </Source>
            )}

            {/* Heatmap mode — kernel density blobs. Uses the raw GeoJSONs without
                clustering so intensity reflects every point. Only one heatmap
                source per dataset is registered when this mode is on. */}
            {habitability && showHabitability && heatmapMode && (
              <Source id="hab-heat" type="geojson" data={habitability}>
                <Layer
                  id="hab-heatmap"
                  type="heatmap"
                  paint={{
                    'heatmap-weight': 1,
                    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 3],
                    'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 10, 14, 15, 30],
                    'heatmap-opacity':   ['interpolate', ['linear'], ['zoom'], 14, 0.85, 16, 0.5],
                    'heatmap-color': [
                      'interpolate', ['linear'], ['heatmap-density'],
                      0,    'rgba(255,237,213,0)',
                      0.2,  'rgba(254,215,170,0.6)',
                      0.4,  'rgba(251,146,60,0.7)',
                      0.6,  'rgba(234,88,12,0.8)',
                      0.8,  'rgba(185,28,28,0.85)',
                      1,    'rgba(127,29,29,0.9)',
                    ],
                  }}
                />
              </Source>
            )}
            {oak311 && show311 && heatmapMode && (
              <Source id="oak311-heat" type="geojson" data={oak311}>
                <Layer
                  id="oak311-heatmap"
                  type="heatmap"
                  paint={{
                    'heatmap-weight': 1,
                    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 3],
                    'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 10, 14, 15, 30],
                    'heatmap-opacity':   ['interpolate', ['linear'], ['zoom'], 14, 0.7, 16, 0.4],
                    'heatmap-color': [
                      'interpolate', ['linear'], ['heatmap-density'],
                      0,    'rgba(207,250,254,0)',
                      0.2,  'rgba(165,243,252,0.55)',
                      0.4,  'rgba(34,211,238,0.65)',
                      0.6,  'rgba(8,145,178,0.75)',
                      0.8,  'rgba(14,116,144,0.8)',
                      1,    'rgba(22,78,99,0.85)',
                    ],
                  }}
                />
              </Source>
            )}

            {/* Habitability points — only when not in aggregate mode. */}
            {habitability && showHabitability && pointsMode && (
              <Source
                id="habitability"
                type="geojson"
                data={habitability}
                cluster={true}
                clusterRadius={50}
                clusterMaxZoom={14}
              >
                <Layer
                  id="hab-clusters"
                  type="circle"
                  filter={['has', 'point_count']}
                  paint={{
                    'circle-color': [
                      'step', ['get', 'point_count'],
                      '#fed7aa', 25,
                      '#fb923c', 100,
                      '#dc2626',
                    ],
                    'circle-radius': [
                      'step', ['get', 'point_count'],
                      14, 25,
                      20, 100,
                      28,
                    ],
                    'circle-stroke-width': 1.5,
                    'circle-stroke-color': 'white',
                  }}
                />
                <Layer
                  id="hab-cluster-count"
                  type="symbol"
                  filter={['has', 'point_count']}
                  layout={{
                    'text-field': ['get', 'point_count_abbreviated'],
                    'text-size': 12,
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                  }}
                  paint={{ 'text-color': '#7c2d12' }}
                />
                <Layer
                  id="hab-points"
                  type="circle"
                  filter={['!', ['has', 'point_count']]}
                  paint={{
                    'circle-color': '#dc2626',
                    'circle-radius': 5,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': 'white',
                  }}
                />
              </Source>
            )}

            {/* 311 housing points. */}
            {oak311 && show311 && pointsMode && (
              <Source
                id="oak311"
                type="geojson"
                data={oak311}
                cluster={true}
                clusterRadius={50}
                clusterMaxZoom={14}
              >
                <Layer
                  id="oak311-clusters"
                  type="circle"
                  filter={['has', 'point_count']}
                  paint={{
                    'circle-color': [
                      'step', ['get', 'point_count'],
                      '#a5f3fc', 25,
                      '#22d3ee', 100,
                      '#0e7490',
                    ],
                    'circle-radius': [
                      'step', ['get', 'point_count'],
                      14, 25,
                      20, 100,
                      28,
                    ],
                    'circle-stroke-width': 1.5,
                    'circle-stroke-color': 'white',
                  }}
                />
                <Layer
                  id="oak311-cluster-count"
                  type="symbol"
                  filter={['has', 'point_count']}
                  layout={{
                    'text-field': ['get', 'point_count_abbreviated'],
                    'text-size': 12,
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                  }}
                  paint={{ 'text-color': '#164e63' }}
                />
                <Layer
                  id="oak311-points"
                  type="circle"
                  filter={['!', ['has', 'point_count']]}
                  paint={{
                    'circle-color': '#0891b2',
                    'circle-radius': 4.5,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': 'white',
                  }}
                />
              </Source>
            )}

            {popup && (
              <Popup
                longitude={popup.lng}
                latitude={popup.lat}
                anchor="bottom"
                onClose={() => setPopup(null)}
                closeOnClick={false}
                maxWidth="280px"
              >
                <PopupContent
                  props={popup.props}
                  layer={popup.layer}
                  onOpenNotes={onOpenNotes}
                />
              </Popup>
            )}
          </MapGL>
        )}
      </div>
    </div>
  );
};

function PopupContent({ props, layer, onOpenNotes }) {
  const isHab = layer?.startsWith('hab-');
  const caseId = props.case_id ?? props.id ?? props.case_number ?? props.OBJECTID ?? '—';
  const type = props.complaint_type ?? props.case_type ?? props.request_type ?? props.category ?? props.type ?? '—';
  const status = props.status ?? props.case_status ?? '—';
  const opened = props.date_opened ?? props.opened_date ?? props.created_date ?? props.date ?? '—';
  const address = props.address ?? props.location ?? props.street_address ?? '—';
  const tractId = props.tract_id ?? props.tract ?? props.GEOID ?? null;

  // Both habitability + 311 housing come from Oakland's OAK 311 Socrata dataset
  // (quth-gb8e). SODA filter by casenumber returns the canonical record.
  const recordUrl = caseId && caseId !== '—'
    ? `https://data.oaklandca.gov/resource/quth-gb8e.json?casenumber=${encodeURIComponent(caseId)}`
    : null;
  const mapsUrl = address && address !== '—'
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ' Oakland CA')}`
    : null;

  return (
    <div style={{ fontSize: '0.78rem', color: '#1e293b', lineHeight: 1.45 }}>
      <div style={{
        fontWeight: 700, color: isHab ? '#b91c1c' : '#0e7490',
        textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em',
        marginBottom: 4,
      }}>
        {isHab ? 'Habitability complaint' : '311 housing'}
      </div>
      <div>
        <b>Case</b>{' '}
        {recordUrl ? (
          <a
            href={recordUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'underline' }}
            title="Open record on data.oaklandca.gov (JSON)"
          >{String(caseId)} ↗</a>
        ) : String(caseId)}
      </div>
      <div><b>Type</b> {String(type)}</div>
      <div><b>Status</b> {String(status)}</div>
      <div><b>Opened</b> {String(opened)}</div>
      <div>
        <b>Address</b>{' '}
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'underline' }}
            title="Open in Google Maps"
          >{String(address)} ↗</a>
        ) : String(address)}
      </div>
      {tractId != null && onOpenNotes && (
        <button
          style={{
            marginTop: 8, padding: '4px 8px', fontSize: '0.72rem', fontWeight: 600,
            border: '1px solid var(--accent)', background: 'white', color: 'var(--accent)',
            borderRadius: 4, cursor: 'pointer',
          }}
          onClick={() => onOpenNotes({ scope: 'tract', scopeId: String(tractId), scopeLabel: String(tractId) })}
        >Notes for tract {tractId}</button>
      )}
    </div>
  );
}

function buildPartialMsg({ habitability, oak311, tracts }) {
  const missing = [];
  if (!habitability) missing.push('habitability complaints');
  if (!oak311) missing.push('311 housing');
  if (!tracts) missing.push('tracts overlay');
  if (missing.length === 0) return null;
  return `Pending build: ${missing.join(', ')}. The map will populate once the data agent's pipeline writes these files.`;
}

const layerToggleStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: '0.82rem', color: 'var(--text)',
  marginBottom: 6, cursor: 'pointer',
};
const colorDot = {
  display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
  border: '1px solid white', boxShadow: '0 0 0 1px rgba(0,0,0,0.15)',
};
const infoBoxStyle = {
  marginTop: 12, padding: '8px 10px', borderRadius: 4,
  background: '#fef3c7', border: '1px solid #fbbf24',
  fontSize: '0.72rem', color: '#78350f', lineHeight: 1.4,
};
const emptyStateStyle = {
  position: 'absolute', inset: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  textAlign: 'center', padding: 24, color: 'var(--text)',
  background: '#f8fafc',
};

export default GranularMap;
