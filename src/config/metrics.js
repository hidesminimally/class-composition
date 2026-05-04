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
  pct_limited_eng_any: { label: "% Limited-English HH", color: "#7c3aed", max: 40 },
  pct_limited_eng_spanish: { label: "% Lim-Eng Spanish", color: "#16a34a", max: 25 },
  pct_limited_eng_apilang: { label: "% Lim-Eng API lang", color: "#9333ea", max: 40 },
  pct_pub_assist_or_snap: { label: "% on SNAP/Public Assist", color: "#dc2626", max: 40 },
  pct_renter_no_vehicle: { label: "% Renters w/o Vehicle", color: "#ca8a04", max: 50 },
  pct_under_35k: { label: "% Households < $35k", color: "#991b1b", max: 65 }
};

export const HIGHLIGHT_STYLE = {
  id: 'highlight', type: 'line',
  paint: { 'line-color': '#00FFFF', 'line-width': 4 }
};
