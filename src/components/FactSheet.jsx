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
  const geoid = !isAgg && p.id ? `06001${p.id}` : null;
  const censusReporterUrl = geoid ? `https://censusreporter.org/profiles/14000US${geoid}/` : null;
  const dataCensusUrl = geoid ? `https://data.census.gov/all?g=1400000US${geoid}` : null;
  const smallBase = !isAgg && typeof p.total_pop === 'number' && p.total_pop > 0 && p.total_pop < 200;

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
      <div style={{borderBottom:'4px solid #0f172a', paddingBottom:16, marginBottom:24, display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:16, flexWrap:'wrap'}}>
        <div>
          <h1 style={{fontSize:'2.2rem', fontWeight:800, margin:0, lineHeight:1}}>
            {isAgg ? `${p.tanc_local} Local` : `Tract ${p.id}`}
          </h1>
          <div style={{color:'#64748b', marginTop:5, fontSize:'1rem'}}>
            {isAgg ? `Consolidated Analysis (${p.tract_count} Tracts)` : `${p.tanc_local} Chapter${geoid ? ` · GEOID ${geoid}` : ''}`}
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

      {smallBase && (
        <div style={{background:'#fef3c7', border:'1px solid #f59e0b', borderRadius:4, padding:'8px 12px', marginBottom:16, fontSize:'0.8rem', color:'#78350f'}}>
          <strong>⚠ Small population base ({p.total_pop}).</strong> ACS percentages and change-over-time numbers in this tract carry wide margins of error — interpret directional, not precise.
        </div>
      )}

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
          <a href="https://data.census.gov/table?q=B16001" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb'}}>B16001</a> language at home.
        </div>
        <div style={{textAlign:'center', color:'#94a3b8', marginTop:8}}>
          TANC Internal Document • Generated {new Date().toLocaleDateString()}
        </div>
      </div>
    </div>
  );
};

export default FactSheet;
