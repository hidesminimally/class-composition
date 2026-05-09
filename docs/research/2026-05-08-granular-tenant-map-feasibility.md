# Granular tenant-organizing map for the East Bay — feasibility report

**Date:** 2026-05-08
**Audience:** TANC (Tenant And Neighborhood Councils)
**Existing baseline:** [tanc-map.netlify.app](https://tanc-map.netlify.app) — Census ACS tract-level layers (rent burden, racial composition, language, foreign-born, SNAP) on maplibre-gl
**Question:** Can we ship a second map that surfaces *per-address / per-building / per-landlord* organizing signal for Oakland, Berkeley, and unincorporated Alameda County?

---

## 1. TL;DR

- **Yes, a useful MVP is shippable in days, not months.** Two Oakland datasets — **Housing Habitability Complaints** ([data.oaklandca.gov/Equity-Indicators/Housing-Habitability-Complaints/xkux-ga3a](https://data.oaklandca.gov/Equity-Indicators/Housing-Habitability-Complaints/xkux-ga3a)) and **OAK 311 service requests** ([data.oaklandca.gov/Infrastructure/.../quth-gb8e](https://data.oaklandca.gov/Infrastructure/Service-requests-received-by-the-Oakland-Call-Cent/quth-gb8e)) — are point-level Socrata feeds, refreshed regularly, with permissive licenses. Drop them into the existing Vite/maplibre stack via a Python build script. This is the MVP.
- **Highest leverage but harder:** **Oakland RAP petitions** are public records but only exposed through a Selenium-scrapable ASPX site ([apps.oaklandca.gov/rappetitions/Petitions.aspx](https://apps.oaklandca.gov/rappetitions/Petitions.aspx)). AEMP already wrote and maintains a scraper ([github.com/antievictionmappingproject/aemp-rap-scrape](https://github.com/antievictionmappingproject/aemp-rap-scrape), last commit Feb 2026). Fork it; don't rewrite.
- **Effectively blocked:** **Bulk unlawful detainer (UD) court records.** California Civil Code of Procedure §1161.2 (AB 2819, eff. 2017) seals limited-jurisdiction UD filings unless landlord prevails at trial within 60 days. Bulk PACER-style scraping of Alameda Superior Court is not legally viable for current data. Historical (2005–2016) data exists via AEMP's prior FOIA partnership with Tenants Together — ask AEMP, don't try to redo it.
- **Don't reinvent Evictorbook.** [evictorbook.com](https://evictorbook.com) (AEMP, Oakland + SF) already does corporate landlord clustering, eviction history, and code violations on a single per-parcel page. The right play is to *link out* from TANC's map to Evictorbook for landlord-level deep dives, not to rebuild it.
- **Recommended starting architecture:** static-site, Python build script writes GeoJSON to `public/`, maplibre point layers with clustering. Same pattern as the existing tract map.

---

## 2. Data source matrix

| # | Source | Granularity | Cadence | License | Geocoded? | Effort | Org. value |
|---|---|---|---|---|---|---|---|
| 1 | Alameda Superior Court UD filings | Case → address | Daily (sealed) | Public record, **§1161.2 sealed by default** | No | **L (blocked)** | High in theory, blocked in practice |
| 2 | Princeton Eviction Lab | Tract / county | Annual (lag 1–2 yr) | ODC-BY 1.0 | Yes (tract centroid) | S | Low (tract = same as existing map) |
| 3 | Anti-Eviction Mapping Project | Per-eviction point (historical) | Static / sporadic | Mixed; partnership ask | Mostly | M (ask) | Very high if granted |
| 4 | Oakland RAP petitions | Address | Live (scrape) | Public record | No (need Nominatim/Mapbox) | M | Very high |
| 5 | Oakland Housing Habitability Complaints | Address + lat/lon | Quarterly-ish | Public domain (Socrata) | **Yes** | **S** | High |
| 6a | Berkeley Rent Registry | Unit (address-level lookup, no bulk) | Continuous | Public record (no bulk export) | Yes (lookup only) | M-L | High if scraped |
| 6b | Berkeley Building Eye permits | Address | Live | Public record | Yes | M | Medium |
| 7 | Alameda County parcels | Parcel polygon + APN + owner | ~Quarterly | Public domain | Yes (geom) | S | High (join key) |
| 8a | Tenants Together "Hall of Shame" | Landlord (named) | Sporadic | Editorial / CC-likely | No | S | Medium (small N, narrative) |
| 8b | Evictorbook | Parcel + landlord cluster | ~Annual refresh | Web-only, no API | Yes | N/A (link out) | Very high |
| 9a | Oakland 311 (OAK 311) | Lat/lon point | Daily | Public domain (Socrata) | **Yes** | **S** | Medium (signal, lots of noise) |
| 9b | Berkeley 311 / SeeClickFix | Address | Daily | Public | Mostly | M | Medium |
| 10 | Existing maps (CJJC, ACCE, JCO) | n/a | n/a | n/a | n/a | n/a | Reference / partner asks |

### Detail per source

**1. Alameda County Superior Court UDs.** No public bulk endpoint. Court records are accessed through the eCourt Public Portal one case at a time. Critically, **CCP §1161.2** (AB 2819, eff. 2017) seals all limited-jurisdiction UD filings unless the landlord prevails at trial within 60 days; the clerk restricts access to the index for the first 60 days after filing. This means a scraper would only ever see a small biased subset (landlord-wins-at-trial cases). Scraping is also a TOS/PR risk. *Don't pursue without legal review.* Historical (2005–2016) data was obtained by AEMP via record requests partnered with Tenants Together and is what powers the existing AEMP Oakland UD map ([antievictionmap.com/oakland](https://antievictionmap.com/oakland/)).

**2. Princeton Eviction Lab.** [evictionlab.org](https://evictionlab.org/get-the-data/), data on AWS S3 ([data-downloads.evictionlab.org](https://data-downloads.evictionlab.org/)), license ODC-BY 1.0. Confirmed via the Eviction Tracking System page ([evictionlab.org/eviction-tracking/get-the-data](https://evictionlab.org/eviction-tracking/get-the-data/)) that **the live tracking system covers Atlanta, Boston, Milwaukee, Philadelphia, etc., but not the Bay Area.** The historical national dataset goes through ~2018 and is tract/county-level. For our purposes this is a duplicate of what we already have at tract resolution; not worth integrating unless we want a "national context" sidebar.

**3. AEMP.** Long-running counter-cartography collective. Maps include "Top Oakland Evictors" ([antievictionmap.com/top-oakland-evictors](https://antievictionmap.com/top-oakland-evictors)), "Oakland Nuisance Evictions," "UDs and Rental Prices" — all rendered as static visualizations, not downloadable layers. The underlying data comes from the Oakland RAP and (for older UDs) the Tenants Together / court partnership. GitHub org: [github.com/antievictionmappingproject](https://github.com/antievictionmappingproject), 91 repos, including `aemp-rap-scrape` (Python/Selenium, last update Feb 2026), `displacementmap-server` (eviction data API), `corporate-ownership-map` (LLC owners in SF), `sfownership` (residential building ownership in SF). Some repos are scraping/API code rather than published datasets. **Treat AEMP as a partnership ask first, code reuse second, not as a passive download source.**

**4. Oakland RAP petitions.** Public records via [apps.oaklandca.gov/rappetitions/Petitions.aspx](https://apps.oaklandca.gov/rappetitions/Petitions.aspx) (a Telerik ASPX webform — JS-rendered, requires Selenium). Four petition types tracked: tenant petitions, owner petitions (rent increase / capital improvement passthrough / vacancy extension), protected-status determinations, and responses. Per-case fields: property address, case ID, parties, petition type, dates, grounds. AEMP's `aemp-rap-scrape` already pulls this and outputs `data/cleaned/cleaned_data_<startdate>_<enddate>.csv`, with separate codebooks for tenant- and landlord-side standardization. **This is the highest-value live dataset and the existing scraper is the right starting point.** Geocoding the `address` column via Nominatim (free, rate-limited) or Mapbox (paid, faster) is straightforward. RAP started rent registry-style data collection in 2022 (registration deadline July 3, 2023, annual renewal each March), so historical depth is shallow but recency is good.

**5. Oakland Housing Habitability Complaints.** [data.oaklandca.gov/Equity-Indicators/Housing-Habitability-Complaints/xkux-ga3a](https://data.oaklandca.gov/Equity-Indicators/Housing-Habitability-Complaints/xkux-ga3a) — Socrata dataset under "Equity Indicators." Standard Socrata download (CSV/JSON/GeoJSON via the `/resource/xkux-ga3a.geojson` endpoint, no API key needed for read). Detailed schema couldn't be confirmed via WebFetch (page is JS-rendered) but the canonical Socrata pattern guarantees address, complaint type, date, status, and typically lat/lon. **Lowest-friction starting dataset.** Quarterly Code Enforcement reports (PDF) corroborate the underlying enforcement data exists. License: Oakland's portal is "open data" with no usage restrictions for non-commercial mapping.

**6a. Berkeley Rent Board / Rent Registry.** [rentregistry.cityofberkeley.info](https://rentregistry.cityofberkeley.info/) and the public lookup at [rentboard.berkeleyca.gov/services/unit-information-lookup](https://rentboard.berkeleyca.gov/services/unit-information-lookup). Per-unit fields: address, status (rented/vacant/owner-occ), regulation type, initial rent, current rent (partially-covered units only), rent ceiling (fully-covered only), tenancy start, occupant count and type. **Owner is not exposed.** No bulk download, no public API. Quarterly median-rent reports are PDF aggregates. *Scraping is technically doable but high-effort and may draw legal attention given the Rent Board's "for reference only" disclaimer.* Defer.

**6b. Berkeley building permits and code complaints.** [berkeley.buildingeye.com](https://berkeley.buildingeye.com/) (third-party visualization of city Accela data) and [permits.cityofberkeley.info/CitizenAccess](https://permits.cityofberkeley.info/CitizenAccess/Cap/CapHome.aspx?module=Building&TabName=Home). Searchable by address since 1993. Code violations are searchable but not bulk-downloadable. Berkeley does not expose a Socrata-style open-data portal for these; bulk access requires Accela scraping or a public records request. Defer to v2.

**7. Alameda County parcels.** Two endpoints:
- [data.acgov.org/items/2b026350b5dd40b18ed7a321fdcdba81](https://data.acgov.org/items/2b026350b5dd40b18ed7a321fdcdba81) — the Parcels feature layer, downloadable as CSV/KML/Shapefile/GeoJSON, plus ArcGIS REST/WFS/WMS endpoints.
- The Assessor's Parcel Viewer at [acassessor.org/parcel_viewer](https://www.acassessor.org/parcel_viewer/) provides per-parcel ownership but no bulk export.

The data.acgov.org parcels layer typically includes APN + geometry but **owner name is often stripped** from the public layer (privacy convention). Expect to need either (a) a separate assessor join via PRR, or (b) ParcelQuest / Regrid (paid) for owner names. For the MVP, the parcels layer is useful purely as a polygon geometry to anchor the address-level points to a building footprint.

**8a. Tenants Together "Hall of Shame."** [hallofshame.tenantstogether.org](https://hallofshame.tenantstogether.org) — editorial/curated list of nominated landlords statewide. Small N, narrative-driven, not a dataset. Useful as a cross-reference layer ("this address is owned by a Hall of Shame landlord") but won't carry the map.

**8b. Evictorbook.** [evictorbook.com](https://evictorbook.com) — built by AEMP, covers SF and Oakland. Pulls together property ownership + evictions + code violations + LLC unmasking on a single per-parcel page (URL pattern `/parcel/SF_<id>` and `/parcel/OAK_<id>`). They report 25% of Oakland evictions in the past 5 years are attributable to corporate owners, with shell-LLC clustering showing the actual beneficial owners (e.g. Veritas Investments). **No public API, no bulk download.** This is the single biggest existing tool that overlaps with the proposed TANC map. Recommended approach: link out from each TANC map address pin to the corresponding Evictorbook parcel page rather than duplicating the work.

**9a. OAK 311.** [data.oaklandca.gov/Infrastructure/Service-requests-received-by-the-Oakland-Call-Cent/quth-gb8e](https://data.oaklandca.gov/Infrastructure/Service-requests-received-by-the-Oakland-Call-Cent/quth-gb8e). Socrata, point-level (lat/lon), 2012–present, daily refresh. Categories include illegal dumping, graffiti, encampments, building maintenance, and infrastructure. *Building maintenance / habitability subset is the relevant slice for tenants;* most of the volume is dumping/graffiti and is noise for our use case. Filter on category before mapping.

**9b. Berkeley 311.** No equivalent Socrata feed surfaced; Berkeley uses SeeClickFix-style intake but does not appear to publish the resulting service requests as bulk open data. Defer.

**10. Pre-existing maps in the space.**
- **AEMP** — counter-mapping, static visualizations, very strong narrative framing. They are *the* incumbent for "Bay Area landlord power mapping."
- **Causa Justa::Just Cause** — has [oaklandtenantrights.org](https://oaklandtenantrights.org) with a letter-writing tool and tenant rights info, but no public map.
- **Tenants Together** — Hall of Shame and statewide advocacy resources, not a map.
- **ACCE / Just Cause Oakland** — organizing presence, no public dataset/map of their own.
- **Evictorbook** — covered above. Closest competitor; complements rather than replaces.

The novel work for TANC is *combining the live admin datasets (RAP, habitability complaints, 311) into a single organizer-facing map with TANC-specific styling and overlay onto the existing tract demographics*, with deep links out to Evictorbook for landlord-level investigation.

---

## 3. Recommended MVP

**Ship in this order:**

1. **Oakland Housing Habitability Complaints** as a clustered point layer.
2. **OAK 311 service requests filtered to building/habitability categories** as a second point layer.
3. **Oakland RAP petitions** scraped via fork of `aemp-rap-scrape`, geocoded, as a third point layer with petition-type styling (tenant decrease petition vs owner increase vs capital improvement).

**Why these three:**
- All three are Oakland-specific, address-level, and *currently active* (i.e., a complaint filed last week shows up). That's the per-address actionability the existing tract map can't provide.
- (1) and (2) are zero-blocker Socrata feeds — pure ingest.
- (3) reuses an existing AEMP scraper and gives the real political signal (rent-increase petitions, capital-improvement passthroughs, harassment claims).
- All three honor the existing repo's pattern: build script → GeoJSON → maplibre layer.

**Architecture sketch (mirrors the existing tract map):**

```
class-composition/
  scripts/
    build_habitability.py      # Socrata GET → GeoJSON → public/data/
    build_oak311.py            # filter category, GeoJSON
    build_rap_petitions.py     # fork aemp-rap-scrape; nominatim geocode; GeoJSON
  public/data/
    habitability.geojson
    oak311_housing.geojson
    rap_petitions.geojson
  src/layers/
    HabitabilityLayer.jsx      # maplibre clustered circle layer
    Oak311Layer.jsx
    RAPLayer.jsx
```

- **Build cadence:** GitHub Action nightly (cron `0 11 * * *` UTC) that runs the three scripts and commits changed GeoJSON to `main`. Netlify auto-redeploys. Same pattern as the existing tract map.
- **Layer toggle UI:** add a left-rail group "Building stress" with three checkboxes, layered on top of the existing tract demographics. The whole point of the second map is *correlation*: show where habitability complaints + RAP petitions concentrate inside high-rent-burden tracts.
- **Per-pin popup:** address + complaint/petition type + date + a deep link "See landlord on Evictorbook →" using `evictorbook.com/parcel/OAK_<APN>` (need to confirm APN→Evictorbook URL slug is stable).
- **Don't build a tile server.** Static GeoJSON + maplibre clustering scales to ~50k points easily. Only move to vector tiles (Tippecanoe / pmtiles) if/when we add Berkeley + 311 full firehose and the file gets >20MB.

---

## 4. Stretch features (post-MVP)

1. **Landlord clustering via parcel ownership join.** Once parcel polygons + APN + owner are in place, "rolled-up violations per landlord" becomes a SQL `GROUP BY owner_normalized`. The hard part is the assessor-name → beneficial-owner mapping (the LLC-unmasking problem Evictorbook solves). Pragmatic v2: don't try to unmask LLCs ourselves; just deep-link the cluster to Evictorbook.
2. **Building-level stress score.** Composite: (# habitability complaints in last 12 mo) + (# RAP owner-side increase petitions in 24 mo) + (# building-related 311 calls in 12 mo), Z-scored within tract to control for general activity. Render as choropleth on parcel polygons. *Concept-level only — needs methodology review by an organizer before publishing scores against named buildings.*
3. **Eviction-rate-vs-demographics overlay.** Use AEMP's historical 2005–2016 UD point data (if obtained) as a heatmap, with the existing rent-burden tract layer underneath. Useful for grant narrative; less useful for next-week organizing.
4. **Berkeley parity.** Scrape Berkeley Building Eye permits + Rent Board lookup (pending legal review). Add Alameda + Emeryville if scope allows.
5. **Time slider.** All three primary feeds carry dates. A scrubber across the last 24 months turns the static map into a "where is heat *increasing*" tool, which is more organizer-actionable than a static snapshot.
6. **Tenant submission layer.** Crowdsource what no admin dataset captures (intimidation, illegal entry, retaliatory rent hikes that didn't make it to RAP). Requires moderation pipeline; consider only after partnership with TANC's organizing leads.

---

## 5. Open questions / asks

1. **AEMP partnership.** Before scraping the RAP ourselves, ask AEMP: (a) is the scraper output already a maintained dataset they'd share, (b) are they OK with TANC re-skinning the data with attribution, (c) is there a sane way to deep-link Evictorbook from our map. Likely friendly conversation; they share politics with TANC.
2. **Legal review on naming defendants.** Before publishing any UD-derived layer that names tenant defendants, get a legal opinion. CCP §1161.2 sealing exists for tenant protection — a TANC map that re-publishes prevailing-landlord wins would re-stigmatize evicted tenants in their next housing search. The acceptable framing is *building*-level and *landlord*-level aggregation, never tenant-by-name.
3. **Court records strategy.** Two paths if we want UD data: (a) FOIA / record-request push for Alameda County aggregate UD counts by address (parallels what AEMP did in 2016), or (b) ride AEMP's existing 2005–2016 dataset as an embedded layer. (b) is cheaper and avoids the legal/PR exposure of (a).
4. **Owner names for the parcel join.** Decide whether to: (a) PRR Alameda County Assessor for a one-time owner extract, (b) pay for a Regrid/ParcelQuest license, or (c) skip ownership entirely and link to Evictorbook for landlord questions. (c) is the MVP-correct answer.
5. **Hosting cadence.** Nightly Netlify rebuilds are fine for habitability + 311. RAP petition scraping is heavier (Selenium, ~minutes); should it run on Mac launchd or a QNAP/Hermes cron rather than GitHub Actions? Probably yes — fits Dan's existing infra pattern.
6. **TANC editorial review.** Before any "stress score" or "high-complaint building" framing ships publicly, have TANC organizers eyeball a few specific buildings the data flags. False-positive rate matters more than coverage; one wrongly-named building burns trust.
7. **PR/political review of the launch.** The map will read as a "blacklist of landlords." Which it kind of is — that's the point. But the framing, the attribution to AEMP/RAP, and the contact-TANC CTA all need to be deliberate, not just an MVP afterthought.

---

## Sources

- Oakland Housing Habitability Complaints: <https://data.oaklandca.gov/Equity-Indicators/Housing-Habitability-Complaints/xkux-ga3a>
- OAK 311 service requests: <https://data.oaklandca.gov/Infrastructure/Service-requests-received-by-the-Oakland-Call-Cent/quth-gb8e>
- Oakland RAP petitions portal: <https://apps.oaklandca.gov/rappetitions/Petitions.aspx>
- AEMP RAP scraper: <https://github.com/antievictionmappingproject/aemp-rap-scrape>
- AEMP GitHub org: <https://github.com/antievictionmappingproject>
- AEMP Oakland UDs: <https://antievictionmap.com/oakland/>
- AEMP Top Oakland Evictors: <https://antievictionmap.com/top-oakland-evictors>
- Evictorbook: <https://evictorbook.com> / <https://evictorbook.com/about/>
- Princeton Eviction Lab data: <https://evictionlab.org/get-the-data/> / <https://data-downloads.evictionlab.org/>
- Eviction Tracking System (Bay Area not covered): <https://evictionlab.org/eviction-tracking/get-the-data/>
- Alameda County parcels: <https://data.acgov.org/items/2b026350b5dd40b18ed7a321fdcdba81>
- Alameda County Open Data: <https://data.acgov.org/>
- CCP §1161.2 (UD sealing): <https://codes.findlaw.com/ca/code-of-civil-procedure/ccp-sect-1161-2/>
- Berkeley Rent Board unit lookup: <https://rentboard.berkeleyca.gov/services/unit-information-lookup>
- Berkeley Building Eye permits: <https://berkeley.buildingeye.com/>
- Berkeley housing code inspections: <https://berkeleyca.gov/doing-business/operating-berkeley/landlords/housing-code-enforcement-inspections>
- Tenants Together Hall of Shame: <https://www.tenantstogether.org/updates/website-seeks-call-out-bad-landlords-california>
- Causa Justa::Just Cause Oakland: <https://cjjc.org/oakland-tenant-services/>
- Oakland Code Enforcement: <https://www.oaklandca.gov/Planning-Building/Code-Enforcement-Services>
- Oakland Rent Registry: <https://www.oaklandca.gov/resources/rent-registration-in-oakland-information-and-faqs>
