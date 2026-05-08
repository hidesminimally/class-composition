import React from 'react';

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

const Row = ({ label, value, delta = null, deltaSuffix = '%' }) => (
  <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f1f5f9', alignItems:'baseline'}}>
    <span style={{color:'#475569'}}>{label}</span>
    <span>
      <strong>{value}</strong>
      {delta !== null && <span style={{marginLeft:8, fontSize:'0.85rem'}}><Delta value={delta} suffix={deltaSuffix} /></span>}
    </span>
  </div>
);

const StackedBar = ({ segments }) => {
  // segments: [{label, value, color}] — value is a percentage
  return (
    <div style={{display:'flex', height:24, borderRadius:4, overflow:'hidden', border:'1px solid #e2e8f0', marginBottom:8}}>
      {segments.map((s, i) => s.value > 0 && (
        <div key={i} title={`${s.label}: ${s.value}%`} style={{width:`${s.value}%`, background:s.color}} />
      ))}
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

const FactSheet = ({ p }) => {
  const isAgg = p.id === 'AGGREGATE';

  // Top 3 non-English languages, sorted by share
  const topLangs = LANG_KEYS
    .map(l => ({ ...l, value: p[l.key] || 0 }))
    .filter(l => l.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  // Recent-mover headline = sum of 2015+ buckets
  const recentMovers = (p.pct_lor_2019_or_later || 0) + (p.pct_lor_2015_2018 || 0);

  return (
    <div style={{height:'100%', display:'flex', flexDirection:'column', overflow:'auto'}}>
      <div style={{borderBottom:'4px solid #0f172a', paddingBottom:16, marginBottom:24}}>
        <h1 style={{fontSize:'2.2rem', fontWeight:800, margin:0, lineHeight:1}}>
          {isAgg ? `${p.tanc_local} Local` : `Tract ${p.id}`}
        </h1>
        <div style={{color:'#64748b', marginTop:5, fontSize:'1rem'}}>
          {isAgg ? `Consolidated Analysis (${p.tract_count} Tracts)` : `${p.tanc_local} Chapter`}
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:32}}>
        {/* LEFT */}
        <div>
          <Section title="POPULATION & HOUSING">
            <Row label="Total population" value={fmt(p.total_pop)} delta={p.total_pop_delta_pct} />
            <Row label="Avg. household size" value={fmt(p.avg_household_size)} />
            <Row label="Median rent" value={p.median_gross_rent ? `$${fmt(p.median_gross_rent)}` : '—'} delta={p.median_gross_rent_delta_pct} />
            <Row label="Median household income" value={p.median_hh_income ? `$${fmt(p.median_hh_income)}` : '—'} delta={p.median_hh_income_delta_pct} />
            <Row label="Median year built" value={fmt(p.median_year_built)} />
          </Section>

          <Section title="RISK SIGNALS">
            <Row label="Rent burden (renters >30%)" value={fmt(p.rent_burden, '%')} />
            <Row label="Unemployment rate" value={fmt(p.unemployment, '%')} />
            <Row label="Poverty rate" value={fmt(p.poverty_rate, '%')} />
            <Row label="Vacancy rate" value={fmt(p.vacancy_rate, '%')} />
            <Row label="Occupancy rate" value={fmt(p.occupancy_rate, '%')} />
            <Row
              label="Eviction rate (per 1k renters)"
              value={p.eviction_rate !== null && p.eviction_rate !== undefined ? p.eviction_rate.toFixed(1) : '—'}
            />
          </Section>

          <Section title="CLASS COMPOSITION">
            <Row label="Foreign-born" value={fmt(p.pct_foreign_born, '%')} />
            <Row label="Naturalized citizen" value={fmt(p.pct_naturalized, '%')} />
            <Row label="Non-citizen" value={fmt(p.pct_noncitizen, '%')} />
            <Row label="Limited-English households" value={fmt(p.pct_limited_eng_any, '%')} />
            <Row label="  · Spanish-speaking" value={fmt(p.pct_limited_eng_spanish, '%')} />
            <Row label="  · Asian/Pacific Island lang." value={fmt(p.pct_limited_eng_apilang, '%')} />
            <Row label="SNAP / public assistance" value={fmt(p.pct_pub_assist_or_snap, '%')} />
            <Row label="Renter HHs with no vehicle" value={fmt(p.pct_renter_no_vehicle, '%')} />
            <Row label="Households earning < $35k" value={fmt(p.pct_under_35k, '%')} />
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
            ]} />
            <Row label="Black / African American" value={fmt(p.pct_black, '%')} delta={p.pct_black_delta_pct} />
            <Row label="Hispanic / Latinx" value={fmt(p.pct_hispanic, '%')} delta={p.pct_hispanic_delta_pct} />
            <Row label="Asian" value={fmt(p.pct_asian, '%')} delta={p.pct_asian_delta_pct} />
            <Row label="White (non-Hispanic)" value={fmt(p.pct_white, '%')} delta={p.pct_white_delta_pct} />
          </Section>

          <Section title="LANGUAGE AT HOME">
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12}}>
              <span style={{color:'#475569'}}>English-only households</span>
              <strong style={{fontSize:'1.6rem', color:'#2563eb'}}>{fmt(p.pct_lang_english_only, '%')}</strong>
            </div>
            <div style={{fontSize:'0.85rem', color:'#475569', marginBottom:6}}>Top non-English languages:</div>
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
              <span style={{color:'#475569'}}>Moved in within last ~5 years</span>
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
              <Row key={r.key} label={r.label} value={fmt(p[r.key], '%')} />
            ))}
          </Section>
        </div>
      </div>

      <div style={{marginTop:'auto', paddingTop:24, borderTop:'1px dashed #cbd5e1', textAlign:'center', color:'#94a3b8', fontSize:'0.75rem'}}>
        TANC Internal Document • Generated {new Date().toLocaleDateString()} • Source: ACS 5-year + RAP + user-provided data
      </div>
    </div>
  );
};

export default FactSheet;
