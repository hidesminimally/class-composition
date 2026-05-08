export const METRICS = {
  rent_burden: { label: "Rent Burden", color: "#ef3b2c", max: 60 },
  unemployment: { label: "Unemployment", color: "#2563eb", max: 15 },
  poverty_rate: { label: "Poverty Rate", color: "#b91c1c", max: 50 },
  pct_hispanic: { label: "% Hispanic", color: "#16a34a", max: 80 },
  pct_black: { label: "% Black", color: "#ea580c", max: 80 },
  pct_asian: { label: "% Asian", color: "#9333ea", max: 80 },
  pct_white: { label: "% White", color: "#64748b", max: 80 },
  // Class composition layer (added 2026-05-03)
  pct_foreign_born: { label: "% Foreign-born", color: "#0891b2", max: 75 },
  pct_noncitizen: { label: "% Non-citizen", color: "#0e7490", max: 55 },
  pct_limited_eng_any: { label: "% Limited-English Households", color: "#7c3aed", max: 40 },
  pct_limited_eng_spanish: { label: "% Limited-English Households (Spanish)", color: "#16a34a", max: 25 },
  pct_limited_eng_apilang: { label: "% Limited-English Households (Asian/Pacific Islander languages)", color: "#9333ea", max: 40 },
  pct_pub_assist_or_snap: { label: "% on SNAP or Public Assistance", color: "#dc2626", max: 40 },
  pct_renter_no_vehicle: { label: "% Renter Households without a Vehicle", color: "#ca8a04", max: 50 },
  pct_under_35k: { label: "% Households Earning Under $35,000", color: "#991b1b", max: 65 },
  // Diverging — racial change since 2010 (relative % change). Domain centered on 0.
  // p10/p90 across Alameda is roughly ±50 / +130, so [-50, 0, +100] gives useful
  // contrast without burning out on a few extreme gentrifying tracts.
  pct_black_delta_pct:    { label: "% Black change since 2010",    kind: 'diverging', domain: [-50, 0, 100], colors: ['#2563eb', '#f8fafc', '#dc2626'] },
  pct_hispanic_delta_pct: { label: "% Hispanic change since 2010", kind: 'diverging', domain: [-50, 0, 100], colors: ['#2563eb', '#f8fafc', '#dc2626'] },
  pct_asian_delta_pct:    { label: "% Asian change since 2010",    kind: 'diverging', domain: [-50, 0, 100], colors: ['#2563eb', '#f8fafc', '#dc2626'] },
  pct_white_delta_pct:    { label: "% White change since 2010",    kind: 'diverging', domain: [-50, 0, 100], colors: ['#2563eb', '#f8fafc', '#dc2626'] },
};

export const HIGHLIGHT_STYLE = {
  id: 'highlight', type: 'line',
  paint: { 'line-color': '#00FFFF', 'line-width': 4 }
};
