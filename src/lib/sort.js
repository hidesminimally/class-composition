// Pure sort helpers shared across the right-sidebar Top Targets list,
// the DataTable, and the TargetingPanel.
//
// All inputs are arrays of *features* (objects with .properties + .geometry),
// not bare property objects, so callers can keep geometry intact for flyTo.

export function sortFeatures(features, sortKey, sortAsc = false) {
  if (!features || features.length === 0) return [];
  const dir = sortAsc ? 1 : -1;
  return features.slice().sort((a, b) => {
    const av = a.properties?.[sortKey];
    const bv = b.properties?.[sortKey];
    // Push null/undefined to the bottom regardless of dir
    if (av === null || av === undefined || Number.isNaN(av)) return 1;
    if (bv === null || bv === undefined || Number.isNaN(bv)) return -1;
    if (typeof av === 'string' || typeof bv === 'string') {
      return String(av).localeCompare(String(bv)) * dir;
    }
    return (av - bv) * dir;
  });
}

export function filterByLocals(features, selectedLocals) {
  if (!features) return [];
  if (!selectedLocals || selectedLocals.length === 0) return features.slice();
  const set = new Set(selectedLocals);
  return features.filter(f => set.has(f.properties?.tanc_local));
}
