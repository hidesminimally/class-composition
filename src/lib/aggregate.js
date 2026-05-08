// Compute a Local-level aggregate from a list of GeoJSON features.
// Returns an object that mirrors a tract's `properties` shape so it can
// flow through FactSheet, Card, etc. unchanged.
//
// Strategy:
//  - Population-weighted average for all rate / percentage / dollar metrics.
//  - Simple sum for total_pop and eviction_filings.
//  - Mean of available _delta_pct values for time-shift fields (these are
//    percentage changes; weighting by total_pop is reasonable but for
//    "average displacement across this Local" a simple mean is what
//    organizers expect).
//  - Top language and longest-residency are derived after weighting.

const PCT_FIELDS = [
  'rent_burden', 'unemployment', 'poverty_rate',
  'vacancy_rate', 'occupancy_rate',
  'pct_white', 'pct_black', 'pct_hispanic', 'pct_asian',
  'pct_lang_english_only', 'pct_lang_spanish', 'pct_lang_chinese',
  'pct_lang_vietnamese', 'pct_lang_tagalog', 'pct_lang_korean', 'pct_lang_french',
  'pct_lor_2019_or_later', 'pct_lor_2015_2018', 'pct_lor_2010_2014',
  'pct_lor_2000_2009', 'pct_lor_1990_1999', 'pct_lor_1989_or_earlier',
  // Social composition (added 2026-05-03; previously omitted from aggregator)
  'pct_foreign_born', 'pct_naturalized', 'pct_noncitizen',
  'pct_limited_eng_any', 'pct_limited_eng_spanish', 'pct_limited_eng_apilang',
  'pct_limited_eng_indoeuropean', 'pct_limited_eng_other',
  'pct_pub_assist_or_snap', 'pct_renter_no_vehicle', 'pct_under_35k',
];

const DOLLAR_FIELDS = ['median_gross_rent', 'median_hh_income'];

const SCALAR_FIELDS = ['avg_household_size', 'median_year_built', 'eviction_rate'];

const DELTA_FIELDS = [
  'total_pop_delta_pct',
  'median_gross_rent_delta_pct',
  'median_hh_income_delta_pct',
  'pct_white_delta_pct', 'pct_black_delta_pct',
  'pct_hispanic_delta_pct', 'pct_asian_delta_pct',
];

function weightedAvg(rows, key, weightKey) {
  let weightSum = 0;
  let valueSum = 0;
  for (const r of rows) {
    const v = r[key];
    const w = r[weightKey];
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    if (!w || Number.isNaN(w)) continue;
    valueSum += v * w;
    weightSum += w;
  }
  if (weightSum === 0) return null;
  return Math.round((valueSum / weightSum) * 10) / 10;
}

function meanIgnoreNull(rows, key) {
  const vals = rows.map(r => r[key]).filter(v => v !== null && v !== undefined && !Number.isNaN(v));
  if (vals.length === 0) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return Math.round((sum / vals.length) * 10) / 10;
}

function sumIgnoreNull(rows, key) {
  let sum = 0;
  let any = false;
  for (const r of rows) {
    const v = r[key];
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    sum += v;
    any = true;
  }
  return any ? sum : null;
}

export function calculateAggregate(features, localName) {
  if (!features || features.length === 0) return null;
  const tracts = features
    .filter(f => f && f.properties && f.properties.tanc_local === localName)
    .map(f => f.properties);
  if (tracts.length === 0) return null;

  const totalPop = sumIgnoreNull(tracts, 'total_pop') ?? 0;

  const out = {
    id: 'AGGREGATE',
    tanc_local: localName,
    tract_count: tracts.length,
    total_pop: totalPop,
    eviction_filings: sumIgnoreNull(tracts, 'eviction_filings'),
  };

  for (const k of PCT_FIELDS) {
    out[k] = weightedAvg(tracts, k, 'total_pop');
  }
  for (const k of DOLLAR_FIELDS) {
    const v = weightedAvg(tracts, k, 'total_pop');
    out[k] = v === null ? null : Math.round(v);
  }
  for (const k of SCALAR_FIELDS) {
    out[k] = weightedAvg(tracts, k, 'total_pop');
  }
  for (const k of DELTA_FIELDS) {
    out[k] = meanIgnoreNull(tracts, k);
  }

  return out;
}

// Exported for tests
export const AGGREGATE_FIELDS = {
  PCT_FIELDS, DOLLAR_FIELDS, SCALAR_FIELDS, DELTA_FIELDS,
};
