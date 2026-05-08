"""
Ingest Oakland open-data feeds for the granular tenant map.

Outputs (to public/data/):
  - oakland_habitability.geojson         - private-property code-enforcement requests as points
  - oakland_311_housing.geojson          - housing-relevant 311 service requests as points
  - oakland_habitability_by_tract.json   - per-tract rollup of habitability points
  - oakland_311_by_tract.json            - per-tract rollup of 311-housing points

Each feature is point-level with properties for: case ID, complaint type, status (open/closed),
date opened, date closed (if any), address (popup), tract id (6-digit) and tract GEOID (11-digit).

Run from repo root or this dir; uses paths relative to the script's own location:
  source .venv/bin/activate
  python src/scripts/fetch_oakland_data.py

============================================================================================
DATASET-1 NOTE — Habitability proxy
--------------------------------------------------------------------------------------------
The feasibility report (docs/research/2026-05-08-granular-tenant-map-feasibility.md) named
Socrata dataset xkux-ga3a as the "Housing Habitability Complaints" record-level feed.
Empirical probe of that dataset found it is a 3-column AGGREGATE (white_nonwhite x year x
percentage) used for the equity-indicator dashboard, NOT individual complaints.

Oakland's open-data portal does not appear to publish a record-level "habitability complaints"
table under any other Socrata id. The closest record-level surface for private-property
code enforcement is filed inside the OAK 311 dataset (quth-gb8e):
    reqcategory = 'OTHER' AND description = 'Code Enforcement'
~30,357 records (2012-present), routed to the Code Enforcement Division. This is what we
ship as oakland_habitability.geojson, and it is what an organizer scanning the map for
"this address has a habitability case open" actually wants.

============================================================================================
DATASET-2 NOTE — 311 housing inclusion list
--------------------------------------------------------------------------------------------
OAK 311 (quth-gb8e) carries ~1.15M records across ~30 categories; most are not housing-
related (parking, graffiti on city property, traffic). Housing-relevant inclusion list:
    - reqcategory = 'ILLDUMP'                           (illegal dumping at addresses)
    - reqcategory = 'HE_CLEAN'                          (homeless encampment cleanup)
    - reqcategory = 'ABANDONED AUTO'                    (abandoned vehicle on private property)
    - reqcategory = 'ENVIRON_ENF'                       (environmental enforcement)
    - reqcategory = 'OTHER' AND description =           (abandoned auto routed via OPD)
        'Oakland Police - Abandoned Auto'
Code Enforcement records are EXCLUDED here because they ship in the habitability file
(prevents double-counting in tract rollups).

Excluded by design:
    - BLDGMAINT  : despite the name, all rows are city-owned buildings (libraries, parks,
                   rec centers), not private housing. Not actionable for tenant organizing.
    - vacant building / blight : no specific category exists; partially covered by Code
                   Enforcement under habitability.
    - GRAFFITI / STREETSW / TREES / etc. : public-realm noise, no signal for tenants.

============================================================================================
Coordinates
--------------------------------------------------------------------------------------------
The dataset has TWO lat/lon fields and only one of them is real:
    - reqaddress.{latitude,longitude} : corrupted across all sampled rows (~30, ~-141)
    - srx (longitude) / sry (latitude) : actual Oakland coordinates
We use srx/sry. Records with null srx/sry are skipped (logged count, no crash).

============================================================================================
"""
import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
from shapely.geometry import shape, Point
from shapely.strtree import STRtree


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
TRACTS_FILE = os.path.join(REPO_ROOT, 'public', 'data.geojson')
OUTPUT_DIR = os.path.join(REPO_ROOT, 'public', 'data')

ATTRIBUTION = "City of Oakland Open Data"

# Alameda County FIPS for building 11-digit GEOID from the 6-digit tract id
STATE_FIPS = "06"
COUNTY_FIPS = "001"

# Socrata endpoint for OAK 311 (and Code Enforcement subset)
SOCRATA_311_URL = "https://data.oaklandca.gov/resource/quth-gb8e.json"
PAGE_SIZE = 50000  # Socrata allows up to 50k per request

# Where SoQL filters live for the two output files. SoQL syntax — double-quote literals.
HABITABILITY_WHERE = "reqcategory='OTHER' AND description='Code Enforcement'"
HOUSING_311_WHERE = (
    "reqcategory IN ('ILLDUMP','HE_CLEAN','ABANDONED AUTO','ENVIRON_ENF') "
    "OR (reqcategory='OTHER' AND description='Oakland Police - Abandoned Auto')"
)

# Status strings used to bucket open vs closed for rollups. Anything else is treated as "open".
CLOSED_STATUSES = {"CLOSED", "CLOSED - CASE", "CANCEL", "CANCELLED",
                   "EVALUATED - NO FURTHER ACTION", "DUPLICATE"}


def http_get_json(url, params, timeout=60):
    r = requests.get(url, params=params, timeout=timeout)
    r.raise_for_status()
    return r.json()


def fetch_socrata_page(where_clause, offset, page_size=PAGE_SIZE):
    """Fetch one Socrata page. Order by requestid for stable pagination."""
    params = {
        "$where": where_clause,
        "$limit": page_size,
        "$offset": offset,
        "$order": "requestid",
    }
    return http_get_json(SOCRATA_311_URL, params)


def fetch_all(where_clause, label):
    """Paginate Socrata until exhausted. Returns list of raw JSON rows."""
    rows = []
    offset = 0
    while True:
        page = fetch_socrata_page(where_clause, offset)
        if not page:
            break
        rows.extend(page)
        print(f"  [{label}] fetched {len(rows)} rows (offset={offset}, page={len(page)})")
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def parse_iso(s):
    """Parse Socrata calendar_date 'YYYY-MM-DDTHH:MM:SS.000' to datetime, or None."""
    if not s:
        return None
    try:
        # strip subsecond and tz, keep date+time portion
        return datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")
    except (ValueError, TypeError):
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d")
        except (ValueError, TypeError):
            return None


def row_to_feature(row):
    """Build a GeoJSON Feature from a 311 row. Returns None if geometry is null/invalid."""
    srx = row.get("srx")
    sry = row.get("sry")
    if srx is None or sry is None:
        return None
    try:
        lon = float(srx)
        lat = float(sry)
    except (TypeError, ValueError):
        return None
    # Sanity-bound to Oakland-ish bbox; reject other corrupt rows
    if not (-122.5 < lon < -122.0 and 37.6 < lat < 37.95):
        return None
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "case_id": row.get("requestid"),
            "category": row.get("reqcategory"),
            "complaint_type": row.get("description"),
            "status": row.get("status"),
            "date_opened": row.get("datetimeinit"),
            "date_closed": row.get("datetimeclosed"),
            "address": row.get("probaddress"),
            "zipcode": row.get("zipcode"),
            "councildistrict": row.get("councildistrict"),
            "source": row.get("source"),
            # tract_id and tract_geoid filled in by spatial-join step
            "tract_id": None,
            "tract_geoid": None,
        },
    }


def load_tracts(path):
    """Load tract polygons from existing tract GeoJSON. Returns parallel lists:
    (geoms, tract_ids_6digit). tract_geoid (11-digit) is derived as STATE+COUNTY+id."""
    with open(path) as f:
        data = json.load(f)
    geoms = []
    ids = []
    for feat in data["features"]:
        props = feat.get("properties", {})
        tid = props.get("id")
        if not tid:
            continue
        try:
            geom = shape(feat["geometry"])
        except Exception:
            continue
        if not geom.is_valid:
            geom = geom.buffer(0)  # repair
        geoms.append(geom)
        ids.append(str(tid).zfill(6))
    print(f"Loaded {len(geoms)} tract polygons from {os.path.relpath(path, REPO_ROOT)}")
    return geoms, ids


def build_geoid(tract_id_6):
    return f"{STATE_FIPS}{COUNTY_FIPS}{tract_id_6}"


def spatial_join(features, tract_geoms, tract_ids):
    """Mutates each feature's properties to add tract_id (6-digit) and tract_geoid (11-digit).
    Uses an STRtree spatial index over tract polygons. Returns count matched."""
    if not features:
        return 0
    tree = STRtree(tract_geoms)
    matched = 0
    for feat in features:
        lon, lat = feat["geometry"]["coordinates"]
        pt = Point(lon, lat)
        # STRtree.query returns indices of candidate geoms whose bbox intersects pt
        candidate_idxs = tree.query(pt)
        hit_id = None
        for idx in candidate_idxs:
            if tract_geoms[idx].contains(pt):
                hit_id = tract_ids[idx]
                break
        if hit_id is not None:
            feat["properties"]["tract_id"] = hit_id
            feat["properties"]["tract_geoid"] = build_geoid(hit_id)
            matched += 1
    return matched


def build_rollup(features, now=None):
    """Per-tract aggregate. Schema:
       {tract_geoid: {total, open, closed, last_30_days, last_year, tract_id}}
    Only counts features with a tract assignment.
    """
    if now is None:
        now = datetime.utcnow()
    cutoff_30 = now - timedelta(days=30)
    cutoff_365 = now - timedelta(days=365)
    rollup = defaultdict(lambda: {"total": 0, "open": 0, "closed": 0,
                                  "last_30_days": 0, "last_year": 0,
                                  "tract_id": None})
    for feat in features:
        props = feat["properties"]
        geoid = props.get("tract_geoid")
        if not geoid:
            continue
        bucket = rollup[geoid]
        bucket["tract_id"] = props.get("tract_id")
        bucket["total"] += 1
        status = (props.get("status") or "").upper().strip()
        if status in CLOSED_STATUSES:
            bucket["closed"] += 1
        else:
            bucket["open"] += 1
        opened = parse_iso(props.get("date_opened"))
        if opened:
            if opened >= cutoff_30:
                bucket["last_30_days"] += 1
            if opened >= cutoff_365:
                bucket["last_year"] += 1
    return dict(rollup)


def write_geojson(features, path, source_label):
    fc = {
        "type": "FeatureCollection",
        "_attribution": ATTRIBUTION,
        "_source": source_label,
        "_generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "features": features,
    }
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(fc, f)
    os.replace(tmp, path)


def write_rollup(rollup, path, source_label):
    payload = {
        "_attribution": ATTRIBUTION,
        "_source": source_label,
        "_generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "tracts": rollup,
    }
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(payload, f)
    os.replace(tmp, path)


def file_size_str(path):
    if not os.path.exists(path):
        return "missing"
    n = os.path.getsize(path)
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def run_dataset(label, where_clause, geojson_name, rollup_name,
                tract_geoms, tract_ids):
    """Fetch + transform + spatial-join + write for one dataset."""
    print(f"\n=== {label} ===")
    print(f"  where: {where_clause}")
    raw_rows = fetch_all(where_clause, label)
    total_rows = len(raw_rows)
    print(f"  fetched {total_rows} rows total")

    features = []
    null_geom = 0
    for row in raw_rows:
        feat = row_to_feature(row)
        if feat is None:
            null_geom += 1
        else:
            features.append(feat)
    geocoded = len(features)
    print(f"  geocoded {geocoded}/{total_rows} ({100.0*geocoded/total_rows:.1f}%); "
          f"skipped {null_geom} with null/out-of-bounds geometry")

    matched = spatial_join(features, tract_geoms, tract_ids)
    pct_match = 100.0 * matched / max(geocoded, 1)
    print(f"  matched to tract: {matched}/{geocoded} ({pct_match:.1f}%)")

    rollup = build_rollup(features)
    print(f"  rollup covers {len(rollup)} tracts")

    geojson_path = os.path.join(OUTPUT_DIR, geojson_name)
    rollup_path = os.path.join(OUTPUT_DIR, rollup_name)
    write_geojson(features, geojson_path, label)
    write_rollup(rollup, rollup_path, label)

    return {
        "label": label,
        "rows_fetched": total_rows,
        "geocoded": geocoded,
        "geocoded_pct": 100.0 * geocoded / max(total_rows, 1),
        "matched_to_tract": matched,
        "matched_pct": pct_match,
        "tracts_covered": len(rollup),
        "geojson_path": geojson_path,
        "rollup_path": rollup_path,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tracts", default=TRACTS_FILE,
                        help=f"Path to tract GeoJSON (default: {TRACTS_FILE})")
    parser.add_argument("--out-dir", default=OUTPUT_DIR,
                        help=f"Output directory (default: {OUTPUT_DIR})")
    args = parser.parse_args()

    if not os.path.exists(args.tracts):
        print(f"ERROR: tract file not found: {args.tracts}", file=sys.stderr)
        sys.exit(1)
    os.makedirs(args.out_dir, exist_ok=True)

    tract_geoms, tract_ids = load_tracts(args.tracts)

    summaries = []
    summaries.append(run_dataset(
        label="oakland_habitability (OAK 311 / Code Enforcement subset)",
        where_clause=HABITABILITY_WHERE,
        geojson_name="oakland_habitability.geojson",
        rollup_name="oakland_habitability_by_tract.json",
        tract_geoms=tract_geoms,
        tract_ids=tract_ids,
    ))
    summaries.append(run_dataset(
        label="oakland_311_housing (OAK 311 / housing-relevant categories)",
        where_clause=HOUSING_311_WHERE,
        geojson_name="oakland_311_housing.geojson",
        rollup_name="oakland_311_by_tract.json",
        tract_geoms=tract_geoms,
        tract_ids=tract_ids,
    ))

    print("\n=== SUMMARY ===")
    for s in summaries:
        print(f"\n{s['label']}")
        print(f"  rows fetched     : {s['rows_fetched']:,}")
        print(f"  geocoded         : {s['geocoded']:,} ({s['geocoded_pct']:.1f}%)")
        print(f"  matched to tract : {s['matched_to_tract']:,} ({s['matched_pct']:.1f}%)")
        print(f"  tracts covered   : {s['tracts_covered']}")
        print(f"  geojson          : {s['geojson_path']} ({file_size_str(s['geojson_path'])})")
        print(f"  rollup           : {s['rollup_path']} ({file_size_str(s['rollup_path'])})")


if __name__ == "__main__":
    main()
