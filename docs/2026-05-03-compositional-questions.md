# Class Composition Inquiry — Open Questions & Data Directions

**For:** TANC East Bay class-composition working group
**Date:** 2026-05-03
**Status:** Living menu — not a roadmap. Pick what serves the next campaign.

---

## How to read this doc

Each section poses an organizing question, names the data layer that answers it, and notes the cost. **A "lens" is not a strategy.** Each variable lights up a *different* organizable population. Pick the lenses that match the campaign you're already running, not the inverse.

The first cut (already shipped, 2026-05-03) covers nativity/citizenship, limited-English households by language family, SNAP/public-assistance, renter-no-vehicle, and < $35k income share. The directions below are what's possible *next*.

---

## Tier 1 — Already shipped (2026-05-03)

| Question | Variable | Why it matters |
|---|---|---|
| Where is the foreign-born population concentrated? | `pct_foreign_born` (B05002) | Identifies tracts where a "know-your-rights" frame, ITIN-aware tenant work, or in-language outreach is the entry point. |
| Where are non-citizens vs naturalized citizens? | `pct_noncitizen`, `pct_naturalized` (B05001) | Non-citizen tracts are *more vulnerable* to retaliation (eviction = potential immigration consequence). Different organizing posture than naturalized tracts. |
| Where are Spanish-speaking limited-English households? Asian/PI? Indo-European? | `pct_limited_eng_*` (C16002) | Tells you which language to door-knock in. Aggregate `pct_limited_eng_any` flags any linguistically-isolated tract — those need translated materials, not just bilingual-friendly. |
| Where is SNAP/public-assistance dependence concentrated? | `pct_pub_assist_or_snap` (B19058) | Hard signal of working-poor density. Often correlates with food-insecurity organizing, mutual-aid base. |
| Where are renters without a vehicle? | `pct_renter_no_vehicle` (B25044) | Transit-dependent renter signal. Displacement to the suburbs is *catastrophic* for these households — they lose work access, not just shelter. |
| Where is the working-poor income tail? | `pct_under_35k` (sum B19001_002–007) | Cleaner class signal than median income (which gets pulled by a few professionals). Shares < $35k catch the *base* of the tract's class composition. |

---

## Tier 2 — High-value next layers

These are the directions I'd pick up next, ranked by organizing signal strength relative to engineering cost.

### 2.1 Industry & occupation breakdown (the actual class part of class composition)

> "Class composition" without the labor side is just demographics. This is the layer that turns the tool from "tenant base map" into "worker-tenant base map."

- **`B24030` — Industry by sex (~25 fields)** lets you ask:
  - Which tracts are heavy on **healthcare, education, retail, food service** (the union-organizable service economy)?
  - Which tracts are heavy on **construction, transportation, warehousing** (gig economy + logistics worker base)?
  - Which tracts are **rentier-class** (finance, professional services dominant) — i.e., where *we are not organizing*?
- **`C24010` — Occupation** gets at the manager-vs-worker split inside an industry. A "healthcare" tract dominated by physicians is very different from one dominated by CNAs and home-health aides.
- **Cross with `pct_under_35k`:** a tract that's 30% service-industry + 50% < $35k = a worker-tenant base. A tract that's 30% finance + 5% < $35k = the landlord block.

**Cost:** moderate (1 day) — it's just more ACS variables on the existing pipeline.

### 2.2 Disability + age × tenure × poverty (precarity ≠ poverty)

The most exploited tenants are often *not* the poorest by income — they're elderly, disabled, or both, locked into a fixed-income housing situation where any rent increase is catastrophic.

- **`B18101` — Disability by age and sex** → `pct_disabled`, `pct_disabled_under_65` (working-age disability is a stronger precarity signal than total disability).
- **`B25007` — Tenure by age of householder** → `pct_renter_60plus`, `pct_renter_65plus`. Senior renter density is the canonical "rent-control will save my life" population.
- **`B17001_*` — Poverty by age × sex** → `pct_seniors_poverty`, `pct_children_poverty`. Different organizing entry points (senior centers vs. school-based).

**Compose:** `senior_renter_precarity_index = pct_renter_65plus * pct_seniors_poverty` flags fixed-income senior renter tracts.

**Cost:** moderate (1 day).

### 2.3 Children, household structure, schools

Kids are the entry vector for the strongest tenant organizing in the Bay Area's history. Where are the family households?

- **`B11005` — Households with children under 18** → `pct_hh_with_children`.
- **`B23008` — Children's parental work status** → `pct_children_two_workers` (highest day-care precarity).
- **`B25115` — Tenure by household type** → `pct_renter_families_with_children` (the canonical "school-zoned tenant union" base).
- **`B11003` — Married vs. single-parent family households** → `pct_single_mother_renter` (cross with poverty for one of the strongest organizing signals in the dataset).

**Compose:** flag tracts where `pct_renter_families_with_children > 25%` AND `pct_under_35k > 30%` — those are the *renters whose kids go to underfunded schools*.

**Cost:** low–moderate (half day).

### 2.4 Multi-generational & overcrowded households (the hidden housing crisis)

ACS has a "occupants per room" measure that catches the part of housing precarity that median rent misses.

- **`B25014` — Occupants per room** → `pct_overcrowded` (>1 per room), `pct_severely_overcrowded` (>1.5 per room). Crucial for immigrant tract analysis — a "low rent" tract can be hiding 12 people in a 2-bedroom.
- **`B11017` — Multi-generational households** → `pct_multigen_hh`. Multi-gen + foreign-born = immigrant family clustering, common in API tracts.

**Why this matters:** overcrowding is the *true* rent-burden metric for immigrant tracts. Sticker-price rent looks normal; per-person space is brutal.

**Cost:** low (couple hours).

### 2.5 Educational attainment as a class proxy

Income lags class. Educational attainment is faster, more stable, and segments the working class from the professional class cleanly.

- **`B15003` — Educational attainment 25+** → `pct_no_hs`, `pct_hs_only`, `pct_some_college`, `pct_bachelors_or_more`.
- **The cut:** `pct_bachelors_or_more` < 25% combined with `pct_under_35k` > 30% = the working-class tract by every reasonable definition. Above 50% bachelors = professional/managerial tract.
- **Watch for:** the "diverse but bachelor-degree-saturated" tract. North Oakland, parts of Berkeley — these look "renter and POC" by surface metrics but are actually displacement-doing tracts, not displacement-receiving ones.

**Cost:** low (couple hours).

### 2.6 Internet access & device deserts

Post-pandemic, this is a durable inequality marker that doesn't show up in income.

- **`B28002` — Internet subscriptions** → `pct_no_internet`, `pct_dial_up_or_no_broadband`.
- **`B28005` — Internet × race** → which racial groups within a tract are on the wrong side of the digital divide.
- **Why it matters:** these are the tracts where door-knocking *outperforms* digital outreach by 10x. Also the tracts where accessing court records, eviction notices, and rent-board portals is itself a barrier.

**Cost:** low (half day).

### 2.7 Health insurance status

- **`B27001` — Health insurance by age × sex** → `pct_uninsured`. Pre-ACA this was huge; even now, uninsured rate clusters in non-citizen-heavy tracts (Medi-Cal coverage gaps for undocumented adults).
- **Cross with `pct_noncitizen`:** isolates the undocumented-adjacent population without naming them directly. Useful for siting know-your-rights work.

**Cost:** low (couple hours).

---

## Tier 3 — Composite indices (cross-variable, not new fetches)

These are the "headline numbers" that make the tool *legible* to organizers who don't want to read 30 column charts. Each is computed from variables already (or about to be) in the pipeline.

### 3.1 Immigrant Working-Class Renter Index

```
imm_wc_renter = (
    pct_foreign_born      * 0.30 +
    pct_under_35k         * 0.30 +
    pct_renter_no_vehicle * 0.20 +
    pct_limited_eng_any   * 0.20
)
```
The headline "is this an organizable immigrant working-class tract?" score. Empirically (verified on the 2026-05-03 fetch), tract 403000 lights up on every term. Tract 443321 (immigrant but professional-class) does not.

### 3.2 Linguistically-Isolated Cost-Burdened Index

```
ling_iso_burden = pct_limited_eng_any * 0.5 + rent_burden * 0.5
```
Where rent burden is happening *behind a language barrier*. These are the tracts where the rent board, small claims, and Section 8 paperwork are inaccessible. Translation + tenant counseling = high-leverage spend.

### 3.3 Precarity Index (the catch-all)

```
precarity = mean([
    poverty_rate,
    pct_pub_assist_or_snap,
    pct_under_35k,
    rent_burden,
    pct_noncitizen,
    pct_renter_no_vehicle
])
```
Rough but useful for a "where do we go first" map. Robust against missing one or two component fields.

### 3.4 Senior Fixed-Income Renter Precarity (Tier 2.2 dependency)

```
senior_renter_precarity = pct_renter_65plus * pct_seniors_poverty / 100
```

### 3.5 Working-Poor Family Renter (Tier 2.3 dependency)

```
wp_family_renter = (
    pct_renter_families_with_children * 0.5 +
    pct_under_35k * 0.5
)
```

### 3.6 Worker-Industry Composition (Tier 2.1 dependency)

Don't aggregate — let organizers pick the industry. But *do* compute:
```
service_economy_share = pct_industry_healthcare + pct_industry_education
                      + pct_industry_food_service + pct_industry_retail
```
"Service economy" is the union-organizable face of the working class. Map it.

---

## Tier 4 — Beyond ACS (longer horizon)

These need different data sources and would each be their own project.

| Direction | Source | Question answered |
|---|---|---|
| **Naturalization pipeline** | ACS B05005 (year of entry) | Which tracts are full of recent vs. long-settled immigrants? Different organizing tempo. |
| **Group quarters / SROs** | ACS B26001 / DEC P5 | Where is the "invisible" tenant population — SROs, residential hotels, transitional housing? |
| **School demographics** | CA DOE DataQuest (free CSV by school) | Free/reduced-lunch %, EL %, by attendance area. Cross with tract for "school-zone tenant union" base. |
| **Cal-OSHA injury rates by industry** | Cal-OSHA + BLS QCEW | Which tracts have the highest occupational-injury exposure? Worker-side organizing. |
| **Wage theft claim density** | CA DLSE / public records | Where are workers already filing? Pre-organized base. |
| **Section 8 voucher acceptance** | HUD Picture of Subsidized Households | Where is "source of income" discrimination happening? |
| **Code-enforcement / habitability complaints** | Oakland 311, Berkeley city portal | Where are tenants already complaining (and being ignored)? |
| **CalEnviroScreen 4.0 percentile** | OEHHA | Cumulative environmental burden — pollution, asthma, etc. — overlaid on class composition. |
| **Public-records voter file** | CA voter file (paid or via union) | Voter density × renter density. Where does electoral organizing have leverage? |
| **Permit-pull data** | Oakland, Berkeley, San Leandro public records | Where are landlords pulling permits to evict-and-renovate? Leading indicator of displacement. |
| **Mailing-vs-situs proxy for absentee landlords** | Alameda parcel data | Doable with the layer we already discovered, deferred per user direction. EvictorBook + PropertyRadar fill this. |

---

## Tier 5 — Methodological questions (worth raising before building more)

1. **Tract-level vs. block-group.** Some of these (especially industry, education) are noisy at tract level. Would you rather have 5x the geographic resolution at 2x the noise, or stay at tract level with cleaner numbers? Probably tract for now, but the tooling generalizes.
2. **Time series vs. snapshot.** The tool currently computes 2010→2020 deltas for *some* fields (race, rent, income). Should the class-composition layer get the same treatment? — pct_foreign_born_delta_pct, pct_under_35k_delta_pct, etc. would identify *changing* tracts (gentrifying away from working-class composition, or *toward* immigrant settlement). Probably yes, but it's a second pass.
3. **MOEs (margin of error).** ACS at tract level has wide MOEs for small populations. We don't currently surface them. For headlines like "tract 403000 is 72.5% foreign-born" this is fine. For sliders ("show me tracts where pct_noncitizen > 40%"), an MOE-aware filter prevents organizers from chasing a tract whose true value is 25%±20.
4. **Composite weighting transparency.** Once we ship indices like `imm_wc_renter`, organizers will (rightly) ask "why those weights?" Need a one-page methodology doc per index that lives next to the fact sheet.
5. **Privacy.** None of this is PII (it's all aggregated public data). But intersection of (renter + non-citizen + Spanish-speaking) at the tract level is a fingerprint. If the tool is ever exported externally, threat-model that ICE/landlord lawyers can read it too.

---

## Recommended next move

If I had to pick one Tier 2 direction to ship next, it'd be **2.1 (industry/occupation)** — because the tool is named *class composition* and right now it doesn't actually contain the labor side of class. After that, **2.4 (overcrowding)** is the highest-leverage single ACS variable for understanding immigrant tract precarity.

Composites (Tier 3) are cheap (no API calls) and high-impact for organizer legibility — worth shipping a couple of them in the next iteration regardless of which Tier 2 layer comes next.
