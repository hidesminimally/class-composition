import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Source, Layer, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

// "Granular" view — per-record complaint / petition / inspection points over
// Oakland Census tracts. Designed as a prioritization tool for organizers.
//
// Layers are config-driven (see LAYERS below). Each layer has:
//   - a points geojson (clickable, clusterable, heatmap-able)
//   - a pre-aggregated by-tract JSON (drives choropleth)
//   - a `dateField` and `categoryField` (drives the cross-layer filter UI)
//
// Filters apply to points + heatmap modes (maplibre filter expressions).
// Choropleth uses the pre-aggregated counts and does NOT respect the date /
// category filters — that's by design (the JSONs are pre-rolled).

const TRACTS_URL = '/data.geojson'; // existing Census tract polygons

const LAYERS = [
  {
    key: 'habitability',
    label: 'Habitability complaints',
    color: '#dc2626',
    clusterColors: ['#fed7aa', '#fb923c', '#dc2626'],
    pointsUrl: '/data/oakland_habitability.geojson',
    aggUrl: '/data/oakland_habitability_by_tract.json',
    dateField: 'date_opened',
    // habitability is all complaint_type=Code Enforcement, so filter on
    // category (OTHER / etc.) which has more spread.
    categoryField: 'category',
    casePopupKind: 'Habitability complaint',
    heatmapColor: [
      'interpolate', ['linear'], ['heatmap-density'],
      0,   'rgba(255,237,213,0)',
      0.2, 'rgba(254,215,170,0.6)',
      0.4, 'rgba(251,146,60,0.7)',
      0.6, 'rgba(234,88,12,0.8)',
      0.8, 'rgba(185,28,28,0.85)',
      1,   'rgba(127,29,29,0.9)',
    ],
  },
  {
    key: 'oak311',
    label: '311 housing-related',
    color: '#0891b2',
    clusterColors: ['#a5f3fc', '#22d3ee', '#0e7490'],
    pointsUrl: '/data/oakland_311_housing.geojson',
    aggUrl: '/data/oakland_311_housing_by_tract.json',
    dateField: 'date_opened',
    categoryField: 'complaint_type',
    casePopupKind: '311 housing',
    heatmapColor: [
      'interpolate', ['linear'], ['heatmap-density'],
      0,   'rgba(207,250,254,0)',
      0.2, 'rgba(165,243,252,0.55)',
      0.4, 'rgba(34,211,238,0.65)',
      0.6, 'rgba(8,145,178,0.75)',
      0.8, 'rgba(14,116,144,0.8)',
      1,   'rgba(22,78,99,0.85)',
    ],
  },
  {
    key: 'evictions',
    label: 'RAP / Eviction petitions',
    color: '#7c3aed',
    clusterColors: ['#ddd6fe', '#a78bfa', '#6d28d9'],
    pointsUrl: '/data/oakland_rap_cases.geojson',
    aggUrl: '/data/oakland_evictions_by_tract.json',
    dateField: 'date_filed',
    categoryField: 'record_kind', // Tenant / Landlord
    casePopupKind: 'RAP petition',
    heatmapColor: [
      'interpolate', ['linear'], ['heatmap-density'],
      0,   'rgba(237,233,254,0)',
      0.2, 'rgba(221,214,254,0.55)',
      0.4, 'rgba(167,139,250,0.7)',
      0.6, 'rgba(124,58,237,0.8)',
      0.8, 'rgba(91,33,182,0.85)',
      1,   'rgba(76,29,149,0.9)',
    ],
  },
  {
    key: 'inspections',
    label: 'ROW Inspections (weak signal)',
    color: '#ca8a04',
    clusterColors: ['#fef3c7', '#fbbf24', '#a16207'],
    pointsUrl: '/data/oakland_inspections.geojson',
    aggUrl: '/data/oakland_inspections_by_tract.json',
    dateField: 'date_opened',
    categoryField: 'complaint_type',
    casePopupKind: 'ROW inspection',
    defaultOff: true,
    heatmapColor: [
      'interpolate', ['linear'], ['heatmap-density'],
      0,   'rgba(254,249,195,0)',
      0.2, 'rgba(254,240,138,0.55)',
      0.4, 'rgba(250,204,21,0.7)',
      0.6, 'rgba(202,138,4,0.8)',
      0.8, 'rgba(133,77,14,0.85)',
      1,   'rgba(66,32,6,0.9)',
    ],
    note: 'Right-of-way inspections — not rental-unit complaints. Use as a tertiary signal only.',
  },
];

async function safeJson(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch (_) {
    return null;
  }
}

// Pull the year out of an ISO-ish date string. Returns null when malformed.
function yearOf(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

const GranularMap = ({ onOpenNotes }) => {
  const mapRef = useRef();
  const [tracts, setTracts] = useState(null);
  const [layerData, setLayerData] = useState({}); // { [key]: { points, agg } }
  const [loaded, setLoaded] = useState(false);

  // Per-layer enable + per-layer selected categories ('all' sentinel = no filter)
  const [enabled, setEnabled] = useState(() =>
    Object.fromEntries(LAYERS.map(l => [l.key, !l.defaultOff])),
  );
  const [selectedCats, setSelectedCats] = useState(() =>
    Object.fromEntries(LAYERS.map(l => [l.key, 'all'])),
  );
  const [catPanelOpen, setCatPanelOpen] = useState(null); // layer key or null

  const [yearFrom, setYearFrom] = useState(2020);
  const [yearTo, setYearTo] = useState(new Date().getFullYear());

  const [viewMode, setViewMode] = useState('points'); // 'points' | 'heatmap' | 'tracts'
  const [aggregateSource, setAggregateSource] = useState('habitability');
  const [popup, setPopup] = useState(null);

  const aggregateMode = viewMode === 'tracts';
  const heatmapMode = viewMode === 'heatmap';
  const pointsMode = viewMode === 'points';

  // Load everything in parallel. Each layer is independently 404-tolerant —
  // a missing file disables that layer but doesn't crash the page.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      safeJson(TRACTS_URL),
      ...LAYERS.flatMap(l => [safeJson(l.pointsUrl), safeJson(l.aggUrl)]),
    ]).then((res) => {
      if (cancelled) return;
      const [t, ...rest] = res;
      const next = {};
      LAYERS.forEach((l, i) => {
        next[l.key] = { points: rest[i * 2], agg: rest[i * 2 + 1] };
      });
      setTracts(t);
      setLayerData(next);
      setLoaded(true);

      // Auto-tune the year range to fit the data we actually have.
      let minY = Infinity, maxY = -Infinity;
      for (const l of LAYERS) {
        const pts = next[l.key]?.points;
        if (!pts?.features) continue;
        for (const ft of pts.features) {
          const y = yearOf(ft.properties?.[l.dateField]);
          if (y == null) continue;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (Number.isFinite(minY) && Number.isFinite(maxY)) {
        const upper = maxY;
        const lower = Math.max(minY, upper - 4); // default to last 5 years
        setYearFrom(lower);
        setYearTo(upper);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Per-layer category list (sorted by frequency desc, top 12). Computed once
  // points are loaded; used to populate the multi-select panel.
  const layerCategories = useMemo(() => {
    const out = {};
    for (const l of LAYERS) {
      const pts = layerData[l.key]?.points;
      if (!pts?.features) { out[l.key] = []; continue; }
      const counts = new Map();
      for (const ft of pts.features) {
        const v = ft.properties?.[l.categoryField];
        if (v == null) continue;
        const s = Array.isArray(v) ? v.join(', ') : String(v);
        counts.set(s, (counts.get(s) || 0) + 1);
      }
      out[l.key] = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([k, n]) => ({ value: k, count: n }));
    }
    return out;
  }, [layerData]);

  // Pre-filter each layer's features in JS. We can't put year/category filter
  // expressions on the cluster circle layer because cluster features have no
  // date_opened / complaint_type — they're aggregations. So we slice the raw
  // GeoJSON down here, hand the filtered FeatureCollection to the clustered
  // Source, and let maplibre re-cluster on the smaller set.
  const filteredLayerData = useMemo(() => {
    const lower = `${yearFrom}-01-01`;
    const upper = `${yearTo}-12-31`;
    const out = {};
    for (const l of LAYERS) {
      const pts = layerData[l.key]?.points;
      if (!pts?.features) { out[l.key] = pts; continue; }
      const sel = selectedCats[l.key];
      const catSet = sel && sel !== 'all' ? sel : null;
      const features = pts.features.filter(f => {
        const p = f.properties || {};
        const d = p[l.dateField];
        if (typeof d === 'string') {
          if (d < lower || d > upper + '￿') return false;
        }
        if (catSet) {
          const v = p[l.categoryField];
          const s = Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v));
          if (!catSet.has(s)) return false;
        }
        return true;
      });
      out[l.key] = { ...pts, features };
    }
    return out;
  }, [layerData, yearFrom, yearTo, selectedCats]);

  // Tract aggregate join — same robust 11-digit ↔ 6-digit lookup as before,
  // now generalized over the 4 layers.
  const tractsWithDensity = useMemo(() => {
    if (!tracts || !aggregateMode) return null;
    const raw = layerData[aggregateSource]?.agg;
    if (!raw) return null;
    const src = raw && typeof raw === 'object' && raw.tracts ? raw.tracts : raw;

    const lookup = new Map();
    const setVal = (key, val) => {
      if (key != null && val != null) lookup.set(String(key), val);
    };
    const extractCount = (v) => {
      if (typeof v === 'number') return v;
      return v?.total ?? v?.count ?? v?.n ?? 0;
    };

    if (Array.isArray(src)) {
      for (const r of src) {
        const count = extractCount(r);
        setVal(r.id, count);
        setVal(r.tract_id, count);
        setVal(r.geoid, count);
        setVal(r.GEOID, count);
      }
    } else if (typeof src === 'object') {
      for (const [k, v] of Object.entries(src)) {
        if (k.startsWith('_')) continue; // skip _meta keys
        const count = extractCount(v);
        setVal(k, count);
        setVal(v?.tract_id, count);
        if (typeof k === 'string' && k.length === 11) setVal(k.slice(5), count);
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
  }, [tracts, layerData, aggregateMode, aggregateSource]);

  const densityStops = useMemo(() => {
    if (!tractsWithDensity) return null;
    const vals = tractsWithDensity.features
      .map(f => f.properties._density || 0)
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    if (vals.length === 0) return null;
    const pct = (p) => vals[Math.min(vals.length - 1, Math.floor(vals.length * p))];
    return {
      p50: pct(0.5),
      p75: pct(0.75),
      p90: pct(0.9),
      max: vals[vals.length - 1],
    };
  }, [tractsWithDensity]);

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
    if (feat.geometry?.type === 'Point') {
      setPopup({
        lng: feat.geometry.coordinates[0],
        lat: feat.geometry.coordinates[1],
        props: feat.properties || {},
        layer: feat.layer.id,
      });
    }
  }, []);

  const interactiveLayerIds = useMemo(() => {
    const ids = [];
    if (pointsMode) {
      for (const l of LAYERS) {
        if (enabled[l.key] && layerData[l.key]?.points) {
          ids.push(`${l.key}-clusters`, `${l.key}-points`);
        }
      }
    }
    if (aggregateMode && tractsWithDensity) ids.push('tracts-density');
    return ids;
  }, [enabled, layerData, pointsMode, aggregateMode, tractsWithDensity]);

  const anyPoints = LAYERS.some(l => layerData[l.key]?.points);
  const anyAgg = LAYERS.some(l => layerData[l.key]?.agg);
  const noData = loaded && !anyPoints && !tracts;

  const toggleLayer = (key) =>
    setEnabled(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleCategory = (layerKey, value) => {
    setSelectedCats(prev => {
      const cur = prev[layerKey];
      const set = cur === 'all' ? new Set() : new Set(cur);
      if (set.has(value)) set.delete(value); else set.add(value);
      return { ...prev, [layerKey]: set.size === 0 ? 'all' : set };
    });
  };
  const clearCategories = (layerKey) =>
    setSelectedCats(prev => ({ ...prev, [layerKey]: 'all' }));

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <aside style={{
        width: 290, minWidth: 290,
        background: 'white',
        borderRight: '1px solid var(--border)',
        padding: 16, overflowY: 'auto',
        flexShrink: 0,
      }} className="granular-controls">
        <h1 className="app-header" style={{ marginBottom: 12 }}>Granular</h1>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 0 }}>
          Building-level complaints, petitions, and inspections. Filter by year
          and complaint type to see where pressure is concentrated.
        </p>

        <div className="control-group">
          <span className="label-header">Layers</span>
          {LAYERS.map(l => {
            const data = layerData[l.key];
            const total = data?.points?.features?.length ?? null;
            const filtered = filteredLayerData[l.key]?.features?.length ?? null;
            const cats = layerCategories[l.key] || [];
            const sel = selectedCats[l.key];
            const selSize = sel === 'all' ? 0 : sel.size;
            const open = catPanelOpen === l.key;
            return (
              <div key={l.key} style={{ marginBottom: 10 }}>
                <label style={layerToggleStyle}>
                  <input
                    type="checkbox"
                    checked={!!enabled[l.key]}
                    onChange={() => toggleLayer(l.key)}
                    disabled={!data?.points}
                  />
                  <span style={{ ...colorDot, background: l.color }} />
                  <span style={{ flex: 1 }}>{l.label}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    {filtered != null && total != null && filtered !== total
                      ? `${filtered.toLocaleString()} / ${total.toLocaleString()}`
                      : (total != null ? total.toLocaleString() : '—')}
                  </span>
                </label>
                {enabled[l.key] && cats.length > 1 && (
                  <div style={{ marginLeft: 22, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => setCatPanelOpen(open ? null : l.key)}
                      style={catToggleBtn}
                    >
                      {open ? '▾' : '▸'} {selSize === 0
                        ? `All ${l.categoryField.replace('_', ' ')}s`
                        : `${selSize} selected`}
                      {selSize > 0 && (
                        <span
                          onClick={(e) => { e.stopPropagation(); clearCategories(l.key); }}
                          style={{ marginLeft: 6, color: 'var(--accent)', textDecoration: 'underline' }}
                        >clear</span>
                      )}
                    </button>
                    {open && (
                      <div style={catPanelStyle}>
                        {cats.map(c => {
                          const checked = sel !== 'all' && sel.has(c.value);
                          return (
                            <label key={c.value} style={catRowStyle}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCategory(l.key, c.value)}
                              />
                              <span style={{ flex: 1, fontSize: '0.72rem' }}>{c.value}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                                {c.count.toLocaleString()}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {l.note && enabled[l.key] && (
                  <div style={{
                    marginLeft: 22, marginTop: 4,
                    fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.35,
                  }}>{l.note}</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="control-group">
          <span className="label-header">Year range</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="number"
              min="2000" max="2030"
              value={yearFrom}
              onChange={(e) => setYearFrom(Number(e.target.value))}
              style={yearInputStyle}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>to</span>
            <input
              type="number"
              min="2000" max="2030"
              value={yearTo}
              onChange={(e) => setYearTo(Number(e.target.value))}
              style={yearInputStyle}
            />
          </div>
          <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: 1.35, marginTop: 6, marginBottom: 0 }}>
            Filter applies to points + heatmap. Tract choropleth uses pre-aggregated totals.
          </p>
        </div>

        <div className="control-group">
          <span className="label-header">View mode</span>
          <label style={layerToggleStyle}>
            <input type="radio" name="view-mode"
              checked={pointsMode} onChange={() => setViewMode('points')} />
            <span>Points (clustered)</span>
          </label>
          <label style={layerToggleStyle}>
            <input type="radio" name="view-mode"
              checked={heatmapMode} onChange={() => setViewMode('heatmap')}
              disabled={!anyPoints} />
            <span>Heatmap (density)</span>
          </label>
          <label style={layerToggleStyle}>
            <input type="radio" name="view-mode"
              checked={aggregateMode} onChange={() => setViewMode('tracts')}
              disabled={!anyAgg} />
            <span>Tract aggregates (choropleth)</span>
          </label>
          {aggregateMode && (
            <div style={{ marginTop: 8 }}>
              <select
                className="select-input"
                value={aggregateSource}
                onChange={(e) => setAggregateSource(e.target.value)}
              >
                {LAYERS.map(l => (
                  <option key={l.key} value={l.key} disabled={!layerData[l.key]?.agg}>
                    {l.label} density
                  </option>
                ))}
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

        {!loaded && <div style={infoBoxStyle}>Loading data…</div>}
        {loaded && (() => {
          const missing = LAYERS.filter(l => !layerData[l.key]?.points).map(l => l.label);
          if (missing.length === 0) return null;
          return <div style={infoBoxStyle}>Pending: {missing.join(', ')}.</div>;
        })()}
      </aside>

      <div style={{ flex: 1, position: 'relative' }}>
        {noData ? (
          <div style={emptyStateStyle}>
            <div>
              <h2 style={{ marginTop: 0 }}>Data not yet available</h2>
              <p style={{ color: 'var(--text-muted)', maxWidth: 420 }}>
                Complaint datasets are built by a separate pipeline. Refresh once
                the build completes.
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
            {tracts && (
              <Source id="tracts" type="geojson" data={tracts}>
                {aggregateMode && tractsWithDensity && densityStops ? (
                  (() => {
                    let s1 = Math.max(1, densityStops.p50);
                    let s2 = Math.max(s1 + 1, densityStops.p75);
                    let s3 = Math.max(s2 + 1, densityStops.p90);
                    let s4 = Math.max(s3 + 1, densityStops.max);
                    return (
                      <Layer
                        id="tracts-density"
                        type="fill"
                        paint={{
                          'fill-color': [
                            'interpolate', ['linear'],
                            ['coalesce', ['get', '_density'], 0],
                            0,  '#f8fafc',
                            s1, '#fde68a',
                            s2, '#fb923c',
                            s3, '#dc2626',
                            s4, '#7f1d1d',
                          ],
                          'fill-opacity': 0.75,
                          'fill-outline-color': '#475569',
                        }}
                      />
                    );
                  })()
                ) : null}
                <Layer
                  id="tracts-outline"
                  type="line"
                  paint={{ 'line-color': '#475569', 'line-opacity': 0.2, 'line-width': 0.6 }}
                />
              </Source>
            )}

            {aggregateMode && tractsWithDensity && (
              <Source id="tracts-density-src" type="geojson" data={tractsWithDensity} />
            )}

            {/* Heatmap layers — one per enabled layer. Uses filtered data. */}
            {heatmapMode && LAYERS.map(l => {
              const pts = filteredLayerData[l.key];
              if (!pts || !enabled[l.key] || pts.features.length === 0) return null;
              return (
                <Source key={`${l.key}-heat`} id={`${l.key}-heat`} type="geojson" data={pts}>
                  <Layer
                    id={`${l.key}-heatmap`}
                    type="heatmap"
                    paint={{
                      'heatmap-weight': 1,
                      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 3],
                      'heatmap-radius':    ['interpolate', ['linear'], ['zoom'], 10, 14, 15, 30],
                      'heatmap-opacity':   ['interpolate', ['linear'], ['zoom'], 14, 0.8, 16, 0.45],
                      'heatmap-color':     l.heatmapColor,
                    }}
                  />
                </Source>
              );
            })}

            {/* Points layers — one source per enabled layer. Cluster on the
                pre-filtered feature set so cluster counts reflect the filter. */}
            {pointsMode && LAYERS.map(l => {
              const pts = filteredLayerData[l.key];
              if (!pts || !enabled[l.key] || pts.features.length === 0) return null;
              const [c1, c2, c3] = l.clusterColors;
              return (
                <Source
                  key={l.key}
                  id={l.key}
                  type="geojson"
                  data={pts}
                  cluster={true}
                  clusterRadius={50}
                  clusterMaxZoom={14}
                >
                  <Layer
                    id={`${l.key}-clusters`}
                    type="circle"
                    filter={['has', 'point_count']}
                    paint={{
                      'circle-color': ['step', ['get', 'point_count'], c1, 25, c2, 100, c3],
                      'circle-radius': ['step', ['get', 'point_count'], 14, 25, 20, 100, 28],
                      'circle-stroke-width': 1.5,
                      'circle-stroke-color': 'white',
                    }}
                  />
                  <Layer
                    id={`${l.key}-cluster-count`}
                    type="symbol"
                    filter={['has', 'point_count']}
                    layout={{
                      'text-field': ['get', 'point_count_abbreviated'],
                      'text-size': 12,
                      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    }}
                    paint={{ 'text-color': '#1e293b' }}
                  />
                  <Layer
                    id={`${l.key}-points`}
                    type="circle"
                    filter={['!', ['has', 'point_count']]}
                    paint={{
                      'circle-color': l.color,
                      'circle-radius': 5,
                      'circle-stroke-width': 1,
                      'circle-stroke-color': 'white',
                    }}
                  />
                </Source>
              );
            })}

            {popup && (
              <Popup
                longitude={popup.lng}
                latitude={popup.lat}
                anchor="bottom"
                onClose={() => setPopup(null)}
                closeOnClick={false}
                maxWidth="300px"
              >
                <PopupContent
                  props={popup.props}
                  layerId={popup.layer}
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

// Match a clicked layer ID like "evictions-points" back to its LAYERS entry.
function layerForId(layerId) {
  if (!layerId) return null;
  return LAYERS.find(l => layerId.startsWith(`${l.key}-`)) || null;
}

function PopupContent({ props, layerId, onOpenNotes }) {
  const layer = layerForId(layerId);
  const kind = layer?.casePopupKind ?? 'Record';
  const accent = layer?.color ?? '#0f172a';

  const caseId = props.case_id ?? props.case_number ?? props.petition_number ?? props.id ?? '—';
  const opened = props[layer?.dateField] ?? props.date_opened ?? props.date_filed ?? '—';
  const status = props.status ?? '—';
  const address = props.address ?? props.location ?? '—';
  const tractId = props.tract_id ?? props.tract ?? props.GEOID ?? null;

  const recordUrl = caseId && caseId !== '—' && (layer?.key === 'habitability' || layer?.key === 'oak311' || layer?.key === 'inspections')
    ? `https://data.oaklandca.gov/resource/quth-gb8e.json?casenumber=${encodeURIComponent(caseId)}`
    : null;
  const mapsUrl = address && address !== '—'
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ' Oakland CA')}`
    : null;

  const isEvictions = layer?.key === 'evictions';
  const grounds = Array.isArray(props.grounds) ? props.grounds.join(', ') : props.grounds;

  return (
    <div style={{ fontSize: '0.78rem', color: '#1e293b', lineHeight: 1.45 }}>
      <div style={{
        fontWeight: 700, color: accent,
        textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em',
        marginBottom: 4,
      }}>{kind}</div>
      <div>
        <b>{isEvictions ? 'Petition' : 'Case'}</b>{' '}
        {recordUrl ? (
          <a href={recordUrl} target="_blank" rel="noopener noreferrer"
             style={{ color: 'var(--accent)', textDecoration: 'underline' }}
             title="Open record on data.oaklandca.gov (JSON)">
            {String(caseId)} ↗
          </a>
        ) : String(caseId)}
      </div>

      {isEvictions ? (
        <>
          {props.record_kind && <div><b>Filed by</b> {props.record_kind}</div>}
          {grounds && <div><b>Grounds</b> {String(grounds)}</div>}
          {props.hearing_date && <div><b>Hearing</b> {String(props.hearing_date)}</div>}
        </>
      ) : (
        <>
          {props.complaint_type && <div><b>Type</b> {String(props.complaint_type)}</div>}
          {props.category && layer?.categoryField !== 'complaint_type' && (
            <div><b>Category</b> {String(props.category)}</div>
          )}
          {status !== '—' && <div><b>Status</b> {String(status)}</div>}
        </>
      )}

      {opened !== '—' && <div><b>{isEvictions ? 'Filed' : 'Opened'}</b> {String(opened).slice(0, 10)}</div>}
      <div>
        <b>Address</b>{' '}
        {mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
             style={{ color: 'var(--accent)', textDecoration: 'underline' }}
             title="Open in Google Maps">
            {String(address)} ↗
          </a>
        ) : String(address)}
      </div>
      {props.councildistrict && <div><b>Council</b> {String(props.councildistrict)}</div>}

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

const layerToggleStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: '0.82rem', color: 'var(--text)',
  marginBottom: 6, cursor: 'pointer',
};
const colorDot = {
  display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
  border: '1px solid white', boxShadow: '0 0 0 1px rgba(0,0,0,0.15)',
};
const catToggleBtn = {
  fontSize: '0.7rem', color: 'var(--text)',
  background: 'none', border: 'none', padding: '2px 0',
  cursor: 'pointer', textAlign: 'left', width: '100%',
};
const catPanelStyle = {
  marginTop: 4, padding: '6px 8px',
  background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 4,
  maxHeight: 180, overflowY: 'auto',
};
const catRowStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '2px 0', cursor: 'pointer',
};
const yearInputStyle = {
  width: 70, padding: '4px 6px',
  fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums',
  border: '1px solid var(--border)', borderRadius: 4,
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
