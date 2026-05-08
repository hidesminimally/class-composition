import React, { useMemo } from 'react';

const fmtPct = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${Number(v).toFixed(1)}%`);
const fmtUsd = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `$${Math.round(v).toLocaleString()}`);
const fmtCount = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString());

const Delta = ({ value }) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const v = Number(value);
  const arrow = v > 0 ? '↑' : v < 0 ? '↓' : '·';
  const color = v > 5 ? '#dc2626' : v < -5 ? '#2563eb' : '#64748b';
  return (
    <span style={{ color, fontSize: '0.75rem', marginLeft: 6, fontWeight: 600 }}>
      {arrow}{Math.abs(v).toFixed(1)}%
    </span>
  );
};

// Surfaces the single most-pressing risk signal for organizers. Picks the highest
// rate among rent_burden / poverty_rate / vacancy_rate so each card has a one-line
// "what jumps out about this Local" callout.
const headlineRisk = (agg) => {
  if (!agg) return null;
  const candidates = [
    { key: 'rent_burden',   label: 'Rent burden',  value: agg.rent_burden },
    { key: 'poverty_rate',  label: 'Poverty rate', value: agg.poverty_rate },
    { key: 'vacancy_rate',  label: 'Vacancy',      value: agg.vacancy_rate },
    { key: 'pct_under_35k', label: '< $35k HH',    value: agg.pct_under_35k },
  ].filter(c => c.value !== null && c.value !== undefined && !Number.isNaN(c.value));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.value - a.value);
  return candidates[0];
};

const LocalCard = ({ localName, agg, onOpen, onDrill }) => {
  const risk = headlineRisk(agg);
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{localName}</div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {agg ? `${agg.tract_count} tracts · ${fmtCount(agg.total_pop)} residents` : 'No data'}
          </div>
        </div>
        {risk && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626', lineHeight: 1 }}>
              {fmtPct(risk.value)}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>{risk.label}</div>
          </div>
        )}
      </div>

      {agg && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '6px 16px',
            fontSize: '0.85rem',
            color: '#475569',
            borderTop: '1px solid #f1f5f9',
            paddingTop: 10,
          }}
        >
          <div>
            Median rent <strong style={{ color: '#0f172a' }}>{fmtUsd(agg.median_gross_rent)}</strong>
            <Delta value={agg.median_gross_rent_delta_pct} />
          </div>
          <div>
            Median income <strong style={{ color: '#0f172a' }}>{fmtUsd(agg.median_hh_income)}</strong>
            <Delta value={agg.median_hh_income_delta_pct} />
          </div>
          <div>
            Foreign-born <strong style={{ color: '#0f172a' }}>{fmtPct(agg.pct_foreign_born)}</strong>
          </div>
          <div>
            Limited-Eng HH <strong style={{ color: '#0f172a' }}>{fmtPct(agg.pct_limited_eng_any)}</strong>
          </div>
          <div>
            Renter, no vehicle <strong style={{ color: '#0f172a' }}>{fmtPct(agg.pct_renter_no_vehicle)}</strong>
          </div>
          <div>
            SNAP / public assist <strong style={{ color: '#0f172a' }}>{fmtPct(agg.pct_pub_assist_or_snap)}</strong>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={() => onOpen(localName)}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: '#0f172a',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.8rem',
          }}
        >
          Fact sheet
        </button>
        <button
          onClick={() => onDrill(localName)}
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'white',
            color: '#0f172a',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.8rem',
          }}
        >
          Open on map →
        </button>
      </div>
    </div>
  );
};

const Landing = ({ features, allLocals, aggregateFor, onOpenLocal, onDrillToMap }) => {
  const cards = useMemo(() => {
    if (!features || features.length === 0 || !allLocals.length) return [];
    return allLocals.map(local => ({ local, agg: aggregateFor(local) }));
  }, [features, allLocals, aggregateFor]);

  if (!features || features.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading data…</div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', overflowY: 'auto', height: 'calc(100vh - 56px)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            TANC Locals — at a glance
          </h1>
          <p style={{ color: '#475569', fontSize: '0.95rem', marginTop: 8, maxWidth: 720 }}>
            Each card is a population-weighted snapshot of one Chapter (Local). The big number is the
            most pressing risk signal for that Local. Open the fact sheet for full detail or drill into
            the tract map to plan organizing routes.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {cards.map(({ local, agg }) => (
            <LocalCard
              key={local}
              localName={local}
              agg={agg}
              onOpen={onOpenLocal}
              onDrill={onDrillToMap}
            />
          ))}
        </div>

        <div style={{ marginTop: 32, fontSize: '0.72rem', color: '#94a3b8', lineHeight: 1.6 }}>
          Aggregates are population-weighted across all tracts in a Local. ACS 2018–2022 5-year estimates
          for current values; "since 2010" deltas compare against ACS 2008–2012.
        </div>
      </div>
    </div>
  );
};

export default Landing;
