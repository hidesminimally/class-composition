# Oakland TPO / Tenant Harassment Data Availability

**Date:** 2026-05-08
**Scope:** Investigate whether Oakland Tenant Protection Ordinance (TPO, OMC 8.22.600 et seq.) and tenant harassment complaint data is available at point or tract granularity for use in the TANC organizing map at `public/data/`.
**Verdict:** **Doc-only. No usable public dataset exists.** TPO complaint records are not published, are not accessible via Oakland's open-data portal or 311, and are not present in the Anti-Eviction Mapping Project's published Oakland scrapes. Recommended next steps below.

---

## What was searched

### 1. Oakland Socrata open-data portal (`data.oaklandca.gov`)

Queried the catalog API (`/api/catalog/v1?domains=data.oaklandca.gov`) and probed every result whose name contains `tenant`, `rent`, `housing`, `harass`, `rap`, `evict`, or `displ`. The full Oakland-domain matches:

| ID | Name | Form |
|---|---|---|
| `up5n-3wjx` | Housing | Aggregate equity-indicator dashboard (no columns) |
| `kjqp-tf46` | Displacement | Aggregate equity-indicator dashboard (no columns) |
| `xs52-nc96` | Housing Quality | Aggregate dashboard |
| `xkux-ga3a` | Housing Habitability Complaints | **3-column aggregate** (`white_nonwhite x year x percentage`) — same false lead the habitability ingestion already documented in `fetch_oakland_data.py` |
| `it5w-25xq` | Eviction Notices | 3 columns (`race_ethnicity`, `rate`, `year`) — aggregate, not record-level |
| `fsve-tisg` | Rent Burden | Aggregate |
| `mv3e-pwbx` | Oakland Public Housing 2014 Geocode | Static legacy geocode |
| `be8m-uau2` | Oakland Assist Housing 2014 Feb Geocode | Static legacy geocode |

**No record-level TPO, tenant harassment, or RAP-petition dataset exists on the Oakland Socrata portal.** Every tenant-related dataset is a pre-aggregated equity-indicator dashboard (race x year x rate/percentage) with no geographic granularity below citywide.

### 2. Oakland 311 (`quth-gb8e`)

Probed the full 311 feed for any record whose `description` matches `TENANT`, `HARASS`, or `TPO`:

```
SELECT reqcategory, description, count(*)
WHERE upper(description) LIKE '%TENANT%' OR '%HARASS%' OR '%TPO%'
=> []
```

Zero matches. Cross-checked all 30 `reqcategory` values — none are tenant- or harassment-related (closest are `BLDGMAINT` which the existing ingestion already documents as city-owned buildings only, and `OTHER`/`Code Enforcement` which is the habitability proxy already ingested). **311 does not carry TPO complaints.**

### 3. Oakland Rent Adjustment Program (RAP)

The RAP office (Department of Housing and Community Development) administers TPO under the same chapter (OMC 8.22) that covers rent control, but TPO and rent-petition records are managed separately:

- **RAP rent petitions** — searchable at the OutSystems-hosted RAP Case Search portal (`apps.oaklandca.gov`). Petition grounds are limited to rent-increase disputes, decreased housing services, code violations, Costa-Hawkins challenges, and similar — see grounds enumeration below. **Harassment is not a petition ground.**
- **TPO complaints** — OMC 8.22.640 creates a private right of action; tenants alleging harassment may sue in court. The City accepts complaints at the RAP office but does **not publish** a complaint dataset, dashboard, or aggregate. The RAP Reports and Data page (`oaklandca.gov/.../RAP-Reports-and-Data`) was inaccessible to this scrape (HTTP 403) but per the city's published RAP annual reports it lists only PDF annual summaries with citywide counts.

### 4. Anti-Eviction Mapping Project (AEMP)

Surveyed `github.com/antievictionmappingproject` for any pre-aggregated Oakland tenant data. Relevant repos:

- **`aemp-rap-scrape`** (last pushed 2026-02-03) — A Selenium-based scraper against the RAP Case Search portal. Pulls **petition-level** records with addresses, hearing dates, petitioner type, and grounds — but only RAP rent petitions, **not TPO complaints**. Tenant-side codebook grounds (`codebooks/tenant_codebook.csv`):
  - `fewer_housing_services` (decrease in services / failure to repair)
  - `allowable_amount`, `notice_to_tenants`, `code_violation`, `unlawful_utilities_charge`, `fraud_or_mistake`, `rent_initiation`, `capital_improvements`, `exceeds_cpi_or_ten_percent`, `no_rap_notice`, `second_increase`, `incorrect_increase`, `no_preapproval`, `no_concurrent_notice`, `violates_state_law`, `exceeds_30_percent`, `no_summary_provided`, `costa_hawkins_violation`, `no_ground_selected`
  - **No "harassment" ground.** The `fewer_housing_services` and `code_violation` grounds are the closest behavioral proxies for landlord harassment patterns (deliberate failure to repair, code violations) but they are filed as rent-adjustment claims, not TPO complaints, and conflate genuine maintenance issues with retaliatory ones.
  - The repo ships scraper + cleaner code only; **no cleaned dataset is published**. Running it for the full 2010-present range requires Selenium + ChromeDriver, an operating Oakland RAP portal that the README warns is "extremely laggy", and many hours of scraping. Output is rent petitions, not harassment.
- **`oakland`** — Static HTML/PNG repo (UD/foreclosure chart, rent chart, ownership map images). No tabular data.
- **`displacementmap-server` / `survey-service`** — Eviction-focused, SF-centric, no Oakland TPO surface.
- **`covid-19-map-data`** — COVID-era emergency tenant protections map (deprecated). Not TPO.
- **`tbor-policy-map`** — Tenant Bill of Rights policy map (qualitative coding of city policies, not complaints).

**No AEMP repo publishes Oakland TPO/harassment data.**

---

## Why it's not usable

1. **Privacy law.** TPO complaints name landlords and tenants; addresses are unit-level. The City has consistently treated complaint records as confidential under the California Public Records Act §7927.700 (personnel/medical/similar files) and §7927.705 (catch-all balancing test). The RAP office's published outputs are aggregate-only.
2. **TPO enforcement is largely judicial, not administrative.** OMC 8.22.640 creates a private right of action; the City does not adjudicate every complaint, so no complete administrative case ledger exists in the first place.
3. **The closest proxies are already ingested.** Code Enforcement (under habitability) and 311 housing categories already cover the building-condition signal that overlaps most heavily with retaliatory-neglect harassment patterns.

## Recommended next steps

Listed in increasing cost and decreasing certainty:

1. **California Public Records Act request to the RAP office** asking for: TPO complaint counts by census tract or zip, year, and disposition (referred / mediated / resolved / closed-no-action) for the last 5 years. Aggregate-only requests rarely trigger privacy refusals. Expected output: tract- or zip-level CSV.
2. **Partner with East Bay Community Law Center / Centro Legal de la Raza / Causa Justa::Just Cause.** These orgs intake TPO complaints and may have de-identified geographic counts they would share with TANC under a data-use agreement.
3. **AEMP collaboration.** AEMP has the working RAP scraper. A joint ingestion of `fewer_housing_services` + `code_violation` petitions, geocoded and tract-joined, would be a defensible behavioral proxy — labeled clearly as "RAP service-decrease / code-violation petitions," not "harassment."
4. **Scrape RAP hearing schedules.** The RAP portal publishes hearing dates and case numbers; cross-referencing with AEMP's address join could surface buildings with disproportionate petition activity. Same caveat: petitions, not harassment.
5. **Scrape published TPO annual reports** (PDF, on the RAP Reports and Data page) for citywide counts. These are not tract-level so they do not feed the granular map, but they bound the universe size and inform whether tract-level disaggregation is even meaningful.

## Files NOT produced

Per task constraints (HONESTY > SHIPPING):

- No `public/data/oakland_tpo.geojson`
- No `public/data/oakland_tpo_by_tract.json`
- No script in `src/scripts/`

If a future CPRA response or partner data-share unlocks tract-level counts, the existing `fetch_oakland_data.py` rollup writer (`build_rollup` / `write_rollup`) is directly reusable — only a new fetch + (optional) spatial-join layer would be needed.
