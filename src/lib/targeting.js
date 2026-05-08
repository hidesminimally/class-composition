// Pure helpers for the TargetingPanel: threshold filtering, sorting,
// and centroid computation.

export function applyThresholds(features, thresholds) {
  if (!features) return [];
  return features.filter(f => {
    const p = f.properties || {};
    for (const [key, min] of Object.entries(thresholds)) {
      if (min <= 0) continue; // 0 means "no filter"
      const v = p[key];
      if (v === null || v === undefined || Number.isNaN(v)) return false;
      if (v < min) return false;
    }
    return true;
  });
}

export function getCentroid(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  let ring;
  if (geometry.type === 'Polygon') {
    ring = geometry.coordinates[0];
  } else if (geometry.type === 'MultiPolygon') {
    // Use the first ring of the first polygon — sufficient for tract-scale.
    ring = geometry.coordinates[0]?.[0];
  } else {
    return null;
  }
  if (!ring || ring.length === 0) return null;
  let sx = 0, sy = 0;
  let count = 0;
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    sx += pt[0];
    sy += pt[1];
    count++;
  }
  if (count === 0) return null;
  return [+(sx / count).toFixed(5), +(sy / count).toFixed(5)];
}

// Build the export-row payload (properties + centroid) from a feature.
export function featureToExportRow(feature) {
  return {
    ...(feature.properties || {}),
    _centroid: getCentroid(feature.geometry),
  };
}
