"""
Ingest Oakland building/right-of-way inspection records for the granular tenant map.

Outputs (to public/data/):
  - oakland_inspections.geojson           - inspection-handled cases as Point features
  - oakland_inspections_by_tract.json     - per-tract rollup of inspection points

Each feature is point-level with properties for: case_id, complaint_type, status (open/closed),
date_opened, date_closed (if any), address (popup), tract_id (6-digit) and tract_geoid (11-digit).

Run from repo root or this dir; uses paths relative to the script's own location:
  source .venv/bin/activate
  python src/scripts/fetch_oakland_inspections.py

============================================================================================
DATA AVAILABILITY NOTE — building inspections on data.oaklandca.gov
--------------------------------------------------------------------------------------------
A full Socrata catalog probe (queries: "building inspection", "permit", "violation",
"code enforcement", "RBR", "rental property", "construction", "blight", "vacant") found
NO record-level Oakland building-inspection / permit-violation dataset on the open-data
portal. The `5dsi-8gtf` (PRR 9944 Residential Rental Property List) record is a registry,
not a violations feed. The `xkux-ga3a` "Housing Habitability Complaints" surface is a
3-row aggregate (white/non-white % by year), not record-level.

The closest record-level surface for inspections within OAK 311 (quth-gb8e) is the
Right-of-Way Inspections division:
    reqcategory IN ('ROW_INSPECTORS', 'ROW')
~16,337 records. This is DISTINCT from the existing oakland_habitability.geojson
(reqcategory='OTHER' AND description='Code Enforcement', ~30,357 records) — no overlap.

CAVEAT — semantic gap: ROW_INSPECTORS covers right-of-way / construction inspections
(sidewalk obstruction, contractor issues, utility infrastructure), NOT private rental
housing-unit inspection. For tenant organizing the signal is weaker than habitability.
Top descriptions in this subset:
    - "Inspections - Utility-Related Infrastructure"
    - "Construction Issue - Parking/Sidewalk Blocked"
    - "Inspections - Construction Obstructing ROW"
    - "Contractor Blocking Street/Sidewalk/Parking"
    - "Utility - Lid - Missing or Broken"
This is the only record-level "inspection" subset Oakland publishes; ship as-is and let
the UI layer decide how prominently to surface it.

============================================================================================
Coordinates
--------------------------------------------------------------------------------------------
Same as fetch_oakland_data.py: srx/sry are real Oakland coords; reqaddress.* lat/lon is
corrupted (~30, ~-141) across all rows. Skip rows with null/out-of-bounds geometry.
============================================================================================
"""
import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import requests
from shapely.geometry import shape, Point
from shapely.strtree import STRtree


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
TRACTS_FILE = os.path.join(REPO_ROOT, 'public', 'data.geojson')
OUTPUT_DIR = os.path.join(REPO_ROOT, 'public', 'data')

ATTRIBUTION = "City of Oakland Open Data"

STATE_FIPS = "06"
COUNTY_FIPS = "001"

SOCRATA_311_URL = "https://data.oaklandca.gov/resource/quth-gb8e.json"
PAGE_SIZE = 50000

# Inspection-handled subset of OAK 311. Includes the Right-of-Way Inspections division
# (ROW_INSPECTORS) plus the small "ROW" reqcategory whose descriptions are also
# "Inspections - ..." rows. Excludes Code Enforcement (already shipped as habitability).
INSPECTIONS_WHERE = "reqcategory IN ('ROW_INSPECTORS','ROW')"

CLOSED_STATUSES = {"CLOSED", "CLOSED - CASE", "CANCEL", "CANCELLED",
                   "EVALUATED - NO FURTHER ACTION", "DUPLICATE"}


def http_get_json(url, params, timeout=60):
    r = requests.get(url, params=params, timeout=timeout)
    r.raise_for_status()
    return r.json()


def fetch_socrata_page(where_clause, offset, page_size=PAGE_SIZE):
    params = {
        "$where": where_clause,
        "$limit": page_size,
        "$offset": offset,
        "$order": "requestid",
    }
    return http_get_json(SOCRATA_311_URL, params)


def fetch_all(where_clause, label):
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
    if not s:
        return None
    try:
        return datetime.strptime(s[:19], "%Y-%m-%dT%H:%M:%S")
    except (ValueError, TypeError):
        try:
            return datetime.strptime(s[:10], "%Y-%m-%d")
        except (ValueError, TypeError):
            return None


def row_to_feature(row):
    srx = row.get("srx")
    sry = row.get("sry")
    if srx is None or sry is None:
        return None
    try:
        lon = float(srx)
        lat = float(sry)
    except (TypeError, ValueError):
        return None
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
            "tract_id": None,
            "tract_geoid": None,
        },
    }


def load_tracts(path):
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
            geom = geom.buffer(0)
        geoms.append(geom)
        ids.append(str(tid).zfill(6))
    print(f"Loaded {len(geoms)} tract polygons from {os.path.relpath(path, REPO_ROOT)}")
    return geoms, ids


def build_geoid(tract_id_6):
    return f"{STATE_FIPS}{COUNTY_FIPS}{tract_id_6}"


def spatial_join(features, tract_geoms, tract_ids):
    if not features:
        return 0
    tree = STRtree(tract_geoms)
    matched = 0
    for feat in features:
        lon, lat = feat["geometry"]["coordinates"]
        pt = Point(lon, lat)
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
    pct_geo = 100.0 * geocoded / max(total_rows, 1)
    print(f"  geocoded {geocoded}/{total_rows} ({pct_geo:.1f}%); "
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
        "geocoded_pct": pct_geo,
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

    summary = run_dataset(
        label="oakland_inspections (OAK 311 / Right-of-Way Inspections subset)",
        where_clause=INSPECTIONS_WHERE,
        geojson_name="oakland_inspections.geojson",
        rollup_name="oakland_inspections_by_tract.json",
        tract_geoms=tract_geoms,
        tract_ids=tract_ids,
    )

    print("\n=== SUMMARY ===")
    print(f"\n{summary['label']}")
    print(f"  rows fetched     : {summary['rows_fetched']:,}")
    print(f"  geocoded         : {summary['geocoded']:,} ({summary['geocoded_pct']:.1f}%)")
    print(f"  matched to tract : {summary['matched_to_tract']:,} ({summary['matched_pct']:.1f}%)")
    print(f"  tracts covered   : {summary['tracts_covered']}")
    print(f"  geojson          : {summary['geojson_path']} ({file_size_str(summary['geojson_path'])})")
    print(f"  rollup           : {summary['rollup_path']} ({file_size_str(summary['rollup_path'])})")


if __name__ == "__main__":
    main()
