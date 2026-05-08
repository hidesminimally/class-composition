import React, { useMemo, useState, useRef, useEffect } from 'react';
import MiniMap from './MiniMap';
import CommentChip from './CommentChip';

// Per-metric metadata: definition, organizing relevance, and source.
// These power the InfoPopover next to each row label.
const META = {
  total_pop: {
    table: 'B01003',
    what: 'Total people counted in this Census tract.',
    why: 'Anchors per-capita metrics. Big drops since 2010 often indicate displacement; big gains usually mean new housing or gentrification pressure.',
  },
  avg_household_size: {
    table: 'B25010',
    what: 'Mean number of people per occupied housing unit.',
    why: 'Larger households often mean children, multigenerational families, and overcrowding — strong reasons to organize against rent hikes.',
  },
  median_gross_rent: {
    table: 'B25064',
    what: 'Median monthly rent paid by renter households (rent + utilities).',
    why: 'The central organizing fact. Compare its trajectory to wage growth — the gap is your displacement story.',
  },
  median_hh_income: {
    table: 'B19013',
    what: 'Median annual income across all households in the tract.',
    why: 'Sets the realistic ceiling on what tenants can pay. Income stagnation alongside rising rent = mounting burden.',
  },
  median_year_built: {
    table: 'B25035',
    what: 'Median year housing units in this tract were built.',
    why: 'Older buildings are more often rent-stabilized under local ordinances. Newer (post-1995 in CA) is typically unregulated, market-rate.',
  },
  rent_burden: {
    table: 'B25070',
    what: 'Share of renter households paying ≥30% of income on gross rent.',
    why: 'HUD\'s definition of "rent-burdened." High values flag eviction risk and households most likely to be receptive to tenant organizing.',
  },
  unemployment: {
    table: 'B23025',
    what: 'Civilian labor force not employed (and looking) ÷ civilian labor force, age 16+.',
    why: 'Joblessness compounds rent burden and signals economic distress beyond just housing cost.',
  },
  poverty_rate: {
    table: 'B17001',
    what: 'Share of population with income below the federal poverty threshold.',
    why: 'The federal line is a crude floor — Bay Area "poor" starts much higher. High-poverty tracts are priority for any safety-net outreach.',
  },
  vacancy_rate: {
    table: 'B25002',
    what: 'Share of housing units that are vacant.',
    why: 'High vacancy in a high-rent tract = warehousing or speculation, not "no demand." Useful evidence in vacancy-tax fights.',
  },
  occupancy_rate: {
    table: 'B25002',
    what: 'Share of housing units that are occupied (1 − vacancy rate).',
    why: 'Inverse of vacancy. Useful as a sanity check that occupancy + vacancy ≈ 100%.',
  },
  eviction_rate: {
    sourceUrl: 'https://evictionlab.org/map/',
    sourceLabel: 'Eviction Lab',
    what: 'Court-recorded eviction filings per 1,000 renter households (Eviction Lab; pre-2018, pre-CARES Act for most CA counties).',
    why: 'The most direct measure of landlord aggression and tenant precarity. Where filings concentrate, organizing pays off most.',
  },
  pct_foreign_born: {
    table: 'B05002',
    what: 'Share of residents born outside the United States.',
    why: 'Concentrations shape language access needs, ICE risk in eviction defense, and which community institutions to partner with.',
  },
  pct_naturalized: {
    table: 'B05002',
    what: 'Share of residents who were born abroad and have become U.S. citizens.',
    why: 'Citizenship changes the calculus on formal political action vs. undocumented-tenant risk.',
  },
  pct_noncitizen: {
    table: 'B05002',
    what: 'Share of residents who were born abroad and are not U.S. citizens (mix of undocumented and lawful permanent residents).',
    why: 'High non-citizen tracts need extra care on ICE risk, public-charge fears, and multilingual outreach.',
  },
  pct_limited_eng_any: {
    table: 'B16002',
    what: 'Households where no member age 14+ speaks English "very well." (ACS phrasing.)',
    why: 'Tells you what languages your flyers, door-knocks, and tenant-rights workshops need to be in.',
  },
  pct_limited_eng_spanish: {
    table: 'B16002',
    what: 'Subset of limited-English households where the primary non-English language is Spanish.',
    why: 'Identifies where Spanish-language outreach would land — vs. tracts that need API-language materials instead.',
  },
  pct_limited_eng_apilang: {
    table: 'B16002',
    what: 'Subset of limited-English households where the primary language is Chinese, Vietnamese, Tagalog, Korean, etc.',
    why: 'East Bay has dense pockets of these populations; signals need for Cantonese/Mandarin/Vietnamese/Korean outreach.',
  },
  pct_pub_assist_or_snap: {
    table: 'B22010',
    what: 'Share of households receiving SNAP (food stamps) or cash public assistance.',
    why: 'Direct indicator of poverty and benefits-cliff vulnerability. Eviction here often means homelessness, not just a move.',
  },
  pct_renter_no_vehicle: {
    table: 'B25044',
    what: 'Share of renter households with no vehicle available.',
    why: 'Class signal in car-dependent California. Predicts dependence on local jobs and services — displacement = job loss too.',
  },
  pct_under_35k: {
    table: 'B19001',
    what: 'Share of households with annual income below $35,000.',
    why: 'In Alameda County, $35k/yr can\'t plausibly cover market rent. These households are by definition rent-burdened or doubled-up.',
  },
  pct_black: {
    table: 'B03002',
    what: 'Share of residents identifying as Black or African American (alone, non-Hispanic).',
    why: 'Bay Area Black communities have been disproportionately displaced since redlining and BART. The "since 2010" delta is the gentrification reading.',
  },
  pct_hispanic: {
    table: 'B03002',
    what: 'Share of residents identifying as Hispanic or Latino (any race).',
    why: 'Often coincides with Spanish-language outreach needs and ICE-vulnerable households.',
  },
  pct_asian: {
    table: 'B03002',
    what: 'Share of residents identifying as Asian (alone, non-Hispanic).',
    why: 'East Bay has large Cantonese / Vietnamese / Tagalog renter communities. Signals language and cultural-organizing needs.',
  },
  pct_white: {
    table: 'B03002',
    what: 'Share of residents identifying as White and not Hispanic.',
    why: 'Trajectory matters more than the level — large White-share growth since 2010 is a classic gentrification fingerprint.',
  },
  pct_lang_english_only: {
    table: 'C16001',
    what: 'Households that speak a language other than English at home (100% minus English-only).',
    why: 'Direct measure of multilingual outreach need. High values = more language access required for any organizing campaign.',
  },
  pct_lor: {
    table: 'B25026',
    what: 'When the current householder moved into their unit, in time cohorts.',
    why: 'High recent-mover share = high turnover = often the signature of gentrification displacing long-time residents.',
  },
};

const fmtRaw = (v, kind) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (kind === 'usd') return `$${Math.round(v).toLocaleString()}`;
  if (kind === 'count') return Math.round(v).toLocaleString();
  return `${Number(v).toFixed(1)}%`;
};

const InfoPopover = ({ meta, geoid, currentRaw, priorRaw, delta, fmtKind = 'pct' }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const closeTimer = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!meta) return null;

  // Vintage-specific links: 2018–22 5yr = ACSDT5Y2022, 2008–12 5yr = ACSDT5Y2012.
  // Tract-scoped via the GEOID g= param so the user lands on the same tract.
  const currentVintageUrl = (meta.table && geoid)
    ? `https://data.census.gov/table/ACSDT5Y2022.${meta.table}?g=1400000US${geoid}`
    : meta.table ? `https://data.census.gov/table?q=${meta.table}` : null;
  const priorVintageUrl = (meta.table && geoid)
    ? `https://data.census.gov/table/ACSDT5Y2012.${meta.table}?g=1400000US${geoid}`
    : null;

  // Back-compute prior endpoint from current + delta when we don't have the raw 2010 field.
  let computedPrior = priorRaw;
  if ((computedPrior === null || computedPrior === undefined) &&
      typeof currentRaw === 'number' && typeof delta === 'number' && delta !== -100) {
    computedPrior = currentRaw / (1 + delta / 100);
  }
  const showMath = typeof currentRaw === 'number' && typeof computedPrior === 'number' && typeof delta === 'number';
  const priorEstimated = showMath && (priorRaw === null || priorRaw === undefined);

  return (
    <span
      ref={wrapRef}
      style={{position:'relative', display:'inline-block', marginLeft:6, fontWeight:'normal'}}
      onMouseEnter={() => { clearTimeout(closeTimer.current); setOpen(true); }}
      onMouseLeave={() => { closeTimer.current = setTimeout(() => setOpen(false), 250); }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        aria-label="What this means and where it comes from"
        style={{
          background:'none', border:'none', padding:0, cursor:'help',
          color: open ? '#2563eb' : '#94a3b8',
          fontSize:'0.78rem', lineHeight:1, verticalAlign:'baseline',
          borderBottom:'1px dotted #cbd5e1',
        }}
      >
        ⓘ
      </button>
      {open && (
        <div
          role="tooltip"
          style={{
            position:'absolute', zIndex:1000, top:'calc(100% + 6px)', left:'-12px',
            width: 340, maxWidth: 'min(340px, 80vw)',
            padding:'12px 14px', background:'white', borderRadius:6,
            border:'1px solid #cbd5e1', boxShadow:'0 12px 24px rgba(15,23,42,0.18)',
            fontSize:'0.78rem', lineHeight:1.5, color:'#1e293b',
            fontWeight:'normal', textAlign:'left',
          }}
        >
          {meta.what && (
            <div style={{marginBottom:10}}>
              <div style={{fontSize:'0.62rem', fontWeight:700, color:'#64748b', letterSpacing:'0.06em', marginBottom:3}}>WHAT THIS IS</div>
              <div>{meta.what}</div>
            </div>
          )}
          {meta.why && (
            <div style={{marginBottom:10}}>
              <div style={{fontSize:'0.62rem', fontWeight:700, color:'#16a34a', letterSpacing:'0.06em', marginBottom:3}}>WHY IT MATTERS</div>
              <div>{meta.why}</div>
            </div>
          )}
          {showMath && (
            <div style={{marginBottom:10, padding:'8px 10px', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:4}}>
              <div style={{fontSize:'0.62rem', fontWeight:700, color:'#64748b', letterSpacing:'0.06em', marginBottom:4}}>HOW THE DELTA IS COMPUTED</div>
              <div style={{fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:'0.78rem'}}>
                <strong>{fmtRaw(computedPrior, fmtKind)}</strong>
                <span style={{color:'#64748b'}}> (2008–12 ACS) → </span>
                <strong>{fmtRaw(currentRaw, fmtKind)}</strong>
                <span style={{color:'#64748b'}}> (2018–22 ACS) = </span>
                <strong style={{color: delta >= 0 ? '#16a34a' : '#dc2626'}}>
                  {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                </strong>
              </div>
              {priorEstimated && (
                <div style={{fontSize:'0.68rem', color:'#94a3b8', marginTop:4, fontStyle:'italic'}}>
                  2008–12 endpoint back-computed from current value and delta.
                </div>
              )}
            </div>
          )}
          <div style={{borderTop:'1px solid #f1f5f9', paddingTop:8}}>
            <div style={{fontSize:'0.62rem', fontWeight:700, color:'#64748b', letterSpacing:'0.06em', marginBottom:5}}>
              VERIFY ON data.census.gov
            </div>
            {currentVintageUrl && (
              <div>
                <a href={currentVintageUrl} target="_blank" rel="noopener noreferrer"
                   onClick={e => e.stopPropagation()}
                   style={{color:'#2563eb', textDecoration:'underline', display:'inline-block'}}>
                  Table {meta.table} · 2018–22 ACS{geoid ? ' · this tract' : ''} ↗
                </a>
              </div>
            )}
            {priorVintageUrl && showMath && (
              <div style={{marginTop:3}}>
                <a href={priorVintageUrl} target="_blank" rel="noopener noreferrer"
                   onClick={e => e.stopPropagation()}
                   style={{color:'#2563eb', textDecoration:'underline', display:'inline-block'}}>
                  Table {meta.table} · 2008–12 ACS · this tract ↗
                </a>
              </div>
            )}
            {meta.sourceUrl && (
              <div style={{marginTop:3}}>
                <a href={meta.sourceUrl} target="_blank" rel="noopener noreferrer"
                   onClick={e => e.stopPropagation()}
                   style={{color:'#2563eb', textDecoration:'underline', display:'inline-block'}}>
                  {meta.sourceLabel || 'Source'} ↗
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
};

const fmt = (v, suffix = '') => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (typeof v === 'number') {
    return suffix === '%' ? `${v}%` : v.toLocaleString();
  }
  return v;
};

const Delta = ({ value, suffix = '%' }) => {
  if (value === null || value === undefined || Number.isNaN(value)) return <span style={{color:'#94a3b8'}}>—</span>;
  const positive = value >= 0;
  const color = positive ? '#16a34a' : '#dc2626';
  const arrow = positive ? '↑' : '↓';
  return <span style={{color, fontWeight:600}}>{arrow} {Math.abs(value).toFixed(1)}{suffix} since 2010</span>;
};

const Section = ({ title, children }) => (
  <div style={{marginBottom:24}}>
    <h3 style={{borderBottom:'1px solid #ddd', paddingBottom:8, color:'#64748b', fontSize:'0.85rem', fontWeight:800, letterSpacing:'0.05em', marginBottom:12}}>{title}</h3>
    {children}
  </div>
);

const Row = ({ label, value, delta = null, deltaSuffix = '%', metaKey = null,
               geoid = null, currentRaw = null, priorRaw = null, fmtKind = 'pct' }) => (
  <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', alignItems:'baseline'}}>
    <span style={{color:'#475569'}}>
      {label}
      <InfoPopover
        meta={metaKey ? META[metaKey] : null}
        geoid={geoid}
        currentRaw={currentRaw}
        priorRaw={priorRaw}
        delta={delta}
        fmtKind={fmtKind}
      />
    </span>
    <span>
      <strong>{value}</strong>
      {delta !== null && <span style={{marginLeft:8, fontSize:'0.85rem'}}><Delta value={delta} suffix={deltaSuffix} /></span>}
    </span>
  </div>
);

const StackedBar = ({ segments }) => {
  // segments: [{label, value, color}] — value is a percentage. Inline legend
  // below the bar so the color→label mapping is visible without hovering.
  const visible = segments.filter(s => s.value > 0);
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:'flex', height:24, borderRadius:4, overflow:'hidden', border:'1px solid #e2e8f0'}}>
        {visible.map((s, i) => (
          <div key={i} title={`${s.label}: ${s.value}%`} style={{width:`${s.value}%`, background:s.color}} />
        ))}
      </div>
      <div style={{display:'flex', flexWrap:'wrap', gap:'6px 14px', marginTop:8, fontSize:'0.72rem', color:'#475569'}}>
        {visible.map((s, i) => (
          <div key={i} style={{display:'flex', alignItems:'center', gap:5}}>
            <span style={{width:10, height:10, borderRadius:2, background:s.color, display:'inline-block'}} />
            <span><strong style={{color:'#0f172a'}}>{s.label}</strong> {s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const LANG_KEYS = [
  { key: 'pct_lang_spanish', label: 'Spanish', color: '#16a34a' },
  { key: 'pct_lang_chinese', label: 'Chinese', color: '#dc2626' },
  { key: 'pct_lang_vietnamese', label: 'Vietnamese', color: '#f59e0b' },
  { key: 'pct_lang_tagalog', label: 'Tagalog', color: '#9333ea' },
  { key: 'pct_lang_korean', label: 'Korean', color: '#0891b2' },
  { key: 'pct_lang_french', label: 'French', color: '#64748b' },
];

const RESIDENCY_KEYS = [
  { key: 'pct_lor_2019_or_later', label: 'Moved in 2019+' },
  { key: 'pct_lor_2015_2018', label: 'Moved 2015–18' },
  { key: 'pct_lor_2010_2014', label: 'Moved 2010–14' },
  { key: 'pct_lor_2000_2009', label: 'Moved 2000–09' },
  { key: 'pct_lor_1990_1999', label: 'Moved 1990–99' },
  { key: 'pct_lor_1989_or_earlier', label: 'Moved 1989 or earlier' },
];

const FactSheet = ({ p, allFeatures = [], onOpenNotes }) => {
  const isAgg = p.id === 'AGGREGATE';
  const geoid = !isAgg && p.id ? `06001${p.id}` : null;
  const censusReporterUrl = geoid ? `https://censusreporter.org/profiles/14000US${geoid}/` : null;
  const dataCensusUrl = geoid ? `https://data.census.gov/all?g=1400000US${geoid}` : null;
  const smallBase = !isAgg && typeof p.total_pop === 'number' && p.total_pop > 0 && p.total_pop < 200;

  // Tracts in this local (context for the mini-map in both aggregate and single-tract views)
  const localFeatures = useMemo(
    () => allFeatures.filter(f => f.properties.tanc_local === p.tanc_local && f.geometry),
    [allFeatures, p.tanc_local]
  );

  // Single-tract feature (used to highlight one tract within its local)
  const tractFeature = useMemo(
    () => isAgg ? null : allFeatures.find(f => f.properties.id === p.id && f.geometry),
    [allFeatures, p.id, isAgg]
  );

  // All non-English languages we have data for, sorted by share, hiding zeros
  const topLangs = LANG_KEYS
    .map(l => ({ ...l, value: p[l.key] || 0 }))
    .filter(l => l.value > 0)
    .sort((a, b) => b.value - a.value);

  // Recent-mover headline = sum of 2015+ buckets
  const recentMovers = (p.pct_lor_2019_or_later || 0) + (p.pct_lor_2015_2018 || 0);

  // B03002 race fields are mutually-exclusive, so the residual = Native American +
  // NHPI + Other + Two-or-more (non-Hispanic). Clamped to [0, 100] for rounding noise.
  const otherRaceShare = Math.max(0, Math.min(100,
    100 - ((p.pct_white || 0) + (p.pct_black || 0) + (p.pct_asian || 0) + (p.pct_hispanic || 0))
  ));

  return (
    <div style={{height:'100%', display:'flex', flexDirection:'column', overflow:'auto'}}>
      <div style={{borderBottom:'4px solid #0f172a', paddingBottom:16, marginBottom:24, display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:16, flexWrap:'wrap'}}>
        <div>
          <h1 style={{fontSize:'2.2rem', fontWeight:800, margin:0, lineHeight:1}}>
            {isAgg ? `${p.tanc_local} Local` : `Tract ${p.id}`}
          </h1>
          <div style={{color:'#64748b', marginTop:5, fontSize:'1rem', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
            <span>{isAgg ? `Consolidated Analysis (${p.tract_count} Tracts)` : `${p.tanc_local} Chapter${geoid ? ` · GEOID ${geoid}` : ''}`}</span>
            {onOpenNotes && (isAgg
              ? <CommentChip
                  scope="local"
                  scopeId={p.tanc_local}
                  alwaysShow
                  onOpen={() => onOpenNotes({ scope: 'local', scopeId: String(p.tanc_local), scopeLabel: String(p.tanc_local) })}
                />
              : <CommentChip
                  scope="tract"
                  scopeId={p.id}
                  alwaysShow
                  onOpen={() => onOpenNotes({ scope: 'tract', scopeId: String(p.id), scopeLabel: String(p.id) })}
                />
            )}
          </div>
        </div>
        {censusReporterUrl && (
          <div style={{display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end'}}>
            <a href={censusReporterUrl} target="_blank" rel="noopener noreferrer"
               style={{fontSize:'0.8rem', fontWeight:700, color:'#2563eb', textDecoration:'none', padding:'6px 10px', border:'1px solid #2563eb', borderRadius:4}}>
              Verify on Census Reporter ↗
            </a>
            <a href={dataCensusUrl} target="_blank" rel="noopener noreferrer"
               style={{fontSize:'0.7rem', color:'#64748b', textDecoration:'none'}}>
              data.census.gov ↗
            </a>
          </div>
        )}
      </div>

      {isAgg && localFeatures.length > 0 && (
        <MiniMap
          highlightFeatures={localFeatures}
          contextFeatures={allFeatures}
          color="#dc2626"
          height={220}
        />
      )}

      {!isAgg && tractFeature && localFeatures.length > 0 && (
        <MiniMap
          highlightFeatures={[tractFeature]}
          contextFeatures={localFeatures}
          color="#dc2626"
          height={180}
        />
      )}

      {smallBase && (
        <div style={{background:'#fef3c7', border:'1px solid #f59e0b', borderRadius:4, padding:'8px 12px', marginBottom:16, fontSize:'0.8rem', color:'#78350f'}}>
          <strong>⚠ Small population base ({p.total_pop}).</strong> ACS percentages and change-over-time numbers in this tract carry wide margins of error — interpret directional, not precise.
        </div>
      )}

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:32}}>
        {/* LEFT */}
        <div>
          <Section title="POPULATION & HOUSING">
            <Row label="Total population" value={fmt(p.total_pop)} delta={p.total_pop_delta_pct} metaKey="total_pop"
                 geoid={geoid} currentRaw={p.total_pop} priorRaw={p.total_pop_2010} fmtKind="count" />
            <Row label="Avg. household size" value={fmt(p.avg_household_size)} metaKey="avg_household_size" geoid={geoid} />
            <Row label="Median rent" value={p.median_gross_rent ? `$${fmt(p.median_gross_rent)}` : '—'} delta={p.median_gross_rent_delta_pct} metaKey="median_gross_rent"
                 geoid={geoid} currentRaw={p.median_gross_rent} fmtKind="usd" />
            <Row label="Median household income" value={p.median_hh_income ? `$${fmt(p.median_hh_income)}` : '—'} delta={p.median_hh_income_delta_pct} metaKey="median_hh_income"
                 geoid={geoid} currentRaw={p.median_hh_income} fmtKind="usd" />
            <Row label="Median year built" value={fmt(p.median_year_built)} metaKey="median_year_built" geoid={geoid} />
          </Section>

          <Section title="RISK SIGNALS">
            <Row label="Rent burden (renters >30%)" value={fmt(p.rent_burden, '%')} metaKey="rent_burden" geoid={geoid} />
            <Row label="Unemployment rate" value={fmt(p.unemployment, '%')} metaKey="unemployment" geoid={geoid} />
            <Row label="Poverty rate" value={fmt(p.poverty_rate, '%')} metaKey="poverty_rate" geoid={geoid} />
            <Row label="Vacancy rate" value={fmt(p.vacancy_rate, '%')} metaKey="vacancy_rate" geoid={geoid} />
            <Row label="Occupancy rate" value={fmt(p.occupancy_rate, '%')} metaKey="occupancy_rate" geoid={geoid} />
            {(p.eviction_rate !== null && p.eviction_rate !== undefined) ? (
              <Row
                label="Eviction rate (per 1k renters)"
                value={p.eviction_rate.toFixed(1)}
                metaKey="eviction_rate"
                geoid={geoid}
              />
            ) : (
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'6px 0', fontSize:'0.85rem', color:'#94a3b8', borderBottom:'1px solid #f1f5f9'}}>
                <span>Eviction rate<InfoPopover meta={META.eviction_rate} /></span>
                <span style={{fontStyle:'italic', fontSize:'0.75rem', maxWidth:220, textAlign:'right', lineHeight:1.3}}>
                  Eviction Lab data is sparse for Alameda — most tracts not covered.
                </span>
              </div>
            )}
          </Section>

          <Section title="SOCIAL COMPOSITION">
            <Row label="Foreign-born" value={fmt(p.pct_foreign_born, '%')} metaKey="pct_foreign_born" geoid={geoid} />
            <Row label="Naturalized citizen" value={fmt(p.pct_naturalized, '%')} metaKey="pct_naturalized" geoid={geoid} />
            <Row label="Non-citizen" value={fmt(p.pct_noncitizen, '%')} metaKey="pct_noncitizen" geoid={geoid} />
            <Row label="Limited-English households" value={fmt(p.pct_limited_eng_any, '%')} metaKey="pct_limited_eng_any" geoid={geoid} />
            <Row label="  · Spanish-speaking" value={fmt(p.pct_limited_eng_spanish, '%')} metaKey="pct_limited_eng_spanish" geoid={geoid} />
            <Row label="  · Asian/Pacific Island lang." value={fmt(p.pct_limited_eng_apilang, '%')} metaKey="pct_limited_eng_apilang" geoid={geoid} />
            <Row label="SNAP / public assistance" value={fmt(p.pct_pub_assist_or_snap, '%')} metaKey="pct_pub_assist_or_snap" geoid={geoid} />
            <Row label="Renter HHs with no vehicle" value={fmt(p.pct_renter_no_vehicle, '%')} metaKey="pct_renter_no_vehicle" geoid={geoid} />
            <Row label="Households earning < $35k" value={fmt(p.pct_under_35k, '%')} metaKey="pct_under_35k" geoid={geoid} />
          </Section>
        </div>

        {/* RIGHT */}
        <div>
          <Section title="RACIAL COMPOSITION">
            <StackedBar segments={[
              { label:'Black', value:p.pct_black, color:'#ea580c' },
              { label:'Hispanic', value:p.pct_hispanic, color:'#16a34a' },
              { label:'Asian', value:p.pct_asian, color:'#9333ea' },
              { label:'White (non-Hisp)', value:p.pct_white, color:'#64748b' },
              { label:'Other / Multiracial', value: otherRaceShare, color:'#94a3b8' },
            ]} />
            <Row label="Black / African American" value={fmt(p.pct_black, '%')} delta={p.pct_black_delta_pct} metaKey="pct_black"
                 geoid={geoid} currentRaw={p.pct_black} priorRaw={p.pct_black_2010} fmtKind="pct" />
            <Row label="Hispanic / Latinx" value={fmt(p.pct_hispanic, '%')} delta={p.pct_hispanic_delta_pct} metaKey="pct_hispanic"
                 geoid={geoid} currentRaw={p.pct_hispanic} priorRaw={p.pct_hispanic_2010} fmtKind="pct" />
            <Row label="Asian" value={fmt(p.pct_asian, '%')} delta={p.pct_asian_delta_pct} metaKey="pct_asian"
                 geoid={geoid} currentRaw={p.pct_asian} priorRaw={p.pct_asian_2010} fmtKind="pct" />
            <Row label="White (non-Hispanic)" value={fmt(p.pct_white, '%')} delta={p.pct_white_delta_pct} metaKey="pct_white"
                 geoid={geoid} currentRaw={p.pct_white} priorRaw={p.pct_white_2010} fmtKind="pct" />
            <Row label="Other / Multiracial" value={fmt(otherRaceShare, '%')} />
          </Section>

          <Section title="LANGUAGE AT HOME">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12}}>
              <span style={{color:'#475569'}}>Non-English-speaking households<InfoPopover meta={META.pct_lang_english_only} /></span>
              <strong style={{fontSize:'1.6rem', color:'#2563eb'}}>
                {p.pct_lang_english_only == null ? '—' : `${(100 - p.pct_lang_english_only).toFixed(1)}%`}
              </strong>
            </div>
            <div style={{fontSize:'0.85rem', color:'#475569', marginBottom:6}}>Top non-English languages<InfoPopover meta={META.pct_lang_english_only} />:</div>
            {topLangs.length === 0 && <div style={{color:'#94a3b8', fontSize:'0.9rem'}}>—</div>}
            {topLangs.map(l => (
              <div key={l.key} style={{marginBottom:6}}>
                <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.9rem'}}>
                  <span>{l.label}</span><strong>{l.value}%</strong>
                </div>
                <div style={{height:6, background:'#f1f5f9', borderRadius:3, overflow:'hidden'}}>
                  <div style={{width:`${l.value}%`, height:'100%', background:l.color}} />
                </div>
              </div>
            ))}
          </Section>

          <Section title="LENGTH OF RESIDENCY">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12}}>
              <span style={{color:'#475569'}}>Moved in within last ~5 years<InfoPopover meta={META.pct_lor} /></span>
              <strong style={{fontSize:'1.4rem', color:'#dc2626'}}>{recentMovers.toFixed(1)}%</strong>
            </div>
            <StackedBar segments={[
              { label:'2019+', value:p.pct_lor_2019_or_later, color:'#dc2626' },
              { label:'2015-18', value:p.pct_lor_2015_2018, color:'#ea580c' },
              { label:'2010-14', value:p.pct_lor_2010_2014, color:'#f59e0b' },
              { label:'2000-09', value:p.pct_lor_2000_2009, color:'#84cc16' },
              { label:'1990-99', value:p.pct_lor_1990_1999, color:'#16a34a' },
              { label:'pre-1990', value:p.pct_lor_1989_or_earlier, color:'#0891b2' },
            ]} />
            {RESIDENCY_KEYS.map(r => (
              <Row key={r.key} label={r.label} value={fmt(p[r.key], '%')} metaKey="pct_lor" geoid={geoid} />
            ))}
          </Section>
        </div>
      </div>

      <div style={{marginTop:'auto', paddingTop:24, borderTop:'1px dashed #cbd5e1', color:'#64748b', fontSize:'0.72rem', lineHeight:1.5}}>
        <div style={{fontWeight:700, color:'#475569', marginBottom:6, letterSpacing:'0.04em'}}>SOURCES & METHODOLOGY</div>
        <div style={{marginBottom:4}}>
          <strong>Current values:</strong> ACS 2018–2022 5-year estimates.
          {' '}<strong>"Since 2010" deltas:</strong> compared against ACS 2008–2012 5-year (labeled "2010" for brevity).
          Eviction data from <a href="https://evictionlab.org/" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>Eviction Lab</a> where available.
        </div>
        <div style={{marginBottom:4}}>
          <strong>ACS tables used:</strong>{' '}
          <a href="https://data.census.gov/table?q=B01003" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B01003</a> pop ·{' '}
          <a href="https://data.census.gov/table?q=B19013" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B19013</a> income ·{' '}
          <a href="https://data.census.gov/table?q=B25064" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B25064</a> rent ·{' '}
          <a href="https://data.census.gov/table?q=B25070" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B25070</a> rent burden ·{' '}
          <a href="https://data.census.gov/table?q=B23025" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B23025</a> unemployment ·{' '}
          <a href="https://data.census.gov/table?q=B17001" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B17001</a> poverty ·{' '}
          <a href="https://data.census.gov/table?q=B25002" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B25002</a> vacancy ·{' '}
          <a href="https://data.census.gov/table?q=B05002" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B05002</a> nativity ·{' '}
          <a href="https://data.census.gov/table?q=B16002" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B16002</a> limited-English ·{' '}
          <a href="https://data.census.gov/table?q=B22010" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B22010</a> SNAP ·{' '}
          <a href="https://data.census.gov/table?q=B25044" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B25044</a> vehicles ·{' '}
          <a href="https://data.census.gov/table?q=B19001" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B19001</a> income brackets ·{' '}
          <a href="https://data.census.gov/table?q=B25034" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B25034</a> year built ·{' '}
          <a href="https://data.census.gov/table?q=B25026" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B25026</a> length of residency ·{' '}
          <a href="https://data.census.gov/table?q=C16001" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>C16001</a> language at home.
        </div>
        <div style={{textAlign:'center', color:'#94a3b8', marginTop:8}}>
          TANC Internal Document • Generated {new Date().toLocaleDateString()}
        </div>
      </div>
    </div>
  );
};

export default FactSheet;
