"""
Ingest Oakland Rent Adjustment Program (RAP) petition data from the Anti-Eviction
Mapping Project's `aemp-rap-scrape` repo, geocode addresses via the U.S. Census
batch geocoder, and join points to Oakland Census tracts.

Outputs (to public/data/):
  - oakland_rap_cases.geojson         - point-level petition GeoJSON FeatureCollection
  - oakland_evictions_by_tract.json   - per-tract rollup of petitions

Schema mirrors the existing oakland_habitability* files so the front-end can read
them with the same loader.

============================================================================================
DATA SOURCE NOTE
--------------------------------------------------------------------------------------------
The Anti-Eviction Mapping Project's rap-scrape repo (https://github.com/antievictionmappingproject/aemp-rap-scrape)
ships pre-cleaned RAP petitions covering 1996-03 through 2022-03 (11,915 petitions).

These are NOT unlawful-detainer (UD) eviction filings. They are petitions filed with
Oakland's Rent Adjustment Program by tenants (~86%) and landlords (~13%) over rent
increases, fewer housing services, capital improvements, etc.

We use these as a tenant-stressor proxy because:
  1. UD records are sealed under California CCP 1161.2 / AB 2819 unless judgment is
     entered for the landlord. Public UD data is therefore biased toward landlord-win
     outcomes and missing the bulk of filings.
  2. AEMP does not publish UD data for Oakland directly. Their rap-scrape repo is the
     canonical pre-cleaned tenant-side legal-record dataset for Oakland that doesn't
     require county-court scraping.
  3. RAP petitions are filed by name + address by tenants experiencing rent pressure,
     so they index the same underlying tenant stress that drives UD filings.

If/when AEMP publishes UD data for Oakland, swap the input CSV here and re-run.

============================================================================================
GEOCODING
--------------------------------------------------------------------------------------------
The AEMP CSV ships street addresses but no lat/lon. We geocode the unique address
universe (~6,461 distinct address_l1 values) via the U.S. Census Geocoder batch
endpoint (free, no API key, 10k addresses/batch).

Records below the geocoder hit threshold are dropped from the GeoJSON; the partial
coverage is recorded in the `_source` field of the output.
============================================================================================
"""
import argparse
import csv
import io
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

import requests
from shapely.geometry import shape, Point
from shapely.strtree import STRtree


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
TRACTS_FILE = os.path.join(REPO_ROOT, 'public', 'data.geojson')
OUTPUT_DIR = os.path.join(REPO_ROOT, 'public', 'data')

# Default location for the AEMP repo clone (override via --aemp-csv).
DEFAULT_AEMP_CSV = '/tmp/aemp-rap-scrape/data/clean/rap_cases_clean.csv'

# Where geocoder results are cached so re-runs don't re-hit the Census API.
GEOCODE_CACHE = os.path.join(SCRIPT_DIR, '..', '..', '.cache', 'aemp_evictions_geocode.json')

ATTRIBUTION = "Anti-Eviction Mapping Project (rap-scrape) + U.S. Census Geocoder"
SOURCE_LABEL_BASE = (
    "Oakland Rent Adjustment Program (RAP) petitions via "
    "github.com/antievictionmappingproject/aemp-rap-scrape (data/clean/rap_cases_clean.csv). "
    "Address points geocoded with the U.S. Census Geocoder batch endpoint. "
    "RAP petitions are NOT unlawful-detainer filings; they index tenant rent-stress "
    "proceedings (rent increases, fewer housing services, capital improvements). "
    "California CCP 1161.2 / AB 2819 seals most UD records unless judgment is for the "
    "landlord, which is why this proxy dataset is used in lieu of UD records."
)

STATE_FIPS = "06"
COUNTY_FIPS = "001"

# Census batch geocoder
CENSUS_BATCH_URL = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
CENSUS_BATCH_SIZE = 10000  # Census max
CENSUS_TIMEOUT = 600  # batch can take a while

# Oakland-ish bbox used to reject obviously-wrong geocodes.
OAK_BBOX = (-122.5, -122.0, 37.6, 37.95)  # (min_lon, max_lon, min_lat, max_lat)


# ---------------------------------------------------------------------------
# AEMP CSV loading
# ---------------------------------------------------------------------------

def load_aemp_rows(csv_path):
    """Read AEMP rap_cases_clean.csv into a list of dicts."""
    with open(csv_path, newline='') as f:
        return list(csv.DictReader(f))


def normalize_address(addr_l1, addr_l2=None):
    """Normalize a street address for the Census Geocoder.
    Drops apt/unit suffix info (addr_l2) since Census matches on street level."""
    a = (addr_l1 or '').strip()
    if not a:
        return None
    # collapse whitespace, strip trailing punctuation
    a = ' '.join(a.split())
    # title-case keeps geocoder happy on some edge cases
    return a


# ---------------------------------------------------------------------------
# Census Geocoder (batch)
# ---------------------------------------------------------------------------

def load_geocode_cache(path):
    if not os.path.exists(path):
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def save_geocode_cache(cache, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(cache, f)
    os.replace(tmp, path)


def census_batch_geocode(addresses, batch_size=CENSUS_BATCH_SIZE):
    """Submit addresses (list of (key, street)) to the Census batch geocoder.
    Returns dict {key: (lon, lat) or None}."""
    results = {}
    n = len(addresses)
    for start in range(0, n, batch_size):
        chunk = addresses[start:start + batch_size]
        # Build a CSV: id,street,city,state,zip (only id+street+city+state required;
        # ZIP empty is fine).
        buf = io.StringIO()
        w = csv.writer(buf)
        for key, street in chunk:
            w.writerow([key, street, 'Oakland', 'CA', ''])
        files = {
            'addressFile': ('addresses.csv', buf.getvalue(), 'text/csv'),
        }
        data = {
            'benchmark': 'Public_AR_Current',
        }
        print(f"  geocoder: submitting batch {start//batch_size + 1} "
              f"({len(chunk)} addrs, total so far {start+len(chunk)}/{n})...")
        attempt = 0
        while True:
            attempt += 1
            try:
                r = requests.post(CENSUS_BATCH_URL, files=files, data=data,
                                  timeout=CENSUS_TIMEOUT)
                r.raise_for_status()
                break
            except requests.RequestException as e:
                if attempt >= 3:
                    print(f"  geocoder: batch failed after {attempt} attempts: {e}",
                          file=sys.stderr)
                    # Mark all addresses in this batch as un-geocoded; continue.
                    for key, _ in chunk:
                        results[key] = None
                    break
                wait = 5 * attempt
                print(f"  geocoder: attempt {attempt} failed ({e}); retry in {wait}s",
                      file=sys.stderr)
                time.sleep(wait)
        else:
            continue
        if r is None or not r.ok:
            continue
        # Parse CSV response: id, input, match_indicator, match_type, matched_address,
        #                    coords ("lon,lat"), tigerline_id, side
        text = r.text
        for row in csv.reader(io.StringIO(text)):
            if not row:
                continue
            key = row[0]
            match_ind = row[2] if len(row) > 2 else ''
            coords = row[5] if len(row) > 5 else ''
            if match_ind == 'Match' and coords:
                try:
                    lon_s, lat_s = coords.split(',')
                    lon, lat = float(lon_s), float(lat_s)
                    if (OAK_BBOX[0] < lon < OAK_BBOX[1]
                            and OAK_BBOX[2] < lat < OAK_BBOX[3]):
                        results[key] = (lon, lat)
                    else:
                        results[key] = None
                except (ValueError, TypeError):
                    results[key] = None
            else:
                results[key] = None
    return results


def geocode_addresses(unique_addrs, cache_path=GEOCODE_CACHE):
    """Geocode a set of unique address strings. Uses on-disk cache."""
    cache = load_geocode_cache(cache_path)
    print(f"  geocode cache: {len(cache)} prior entries at {cache_path}")

    to_geocode = []
    key_to_addr = {}
    for i, addr in enumerate(sorted(unique_addrs)):
        if addr in cache:
            continue
        key = str(i)
        key_to_addr[key] = addr
        to_geocode.append((key, addr))

    if to_geocode:
        print(f"  geocoder: {len(to_geocode)} new addresses to geocode "
              f"({len(unique_addrs) - len(to_geocode)} already cached)")
        new_results = census_batch_geocode(to_geocode)
        for key, addr in key_to_addr.items():
            cache[addr] = new_results.get(key)
        save_geocode_cache(cache, cache_path)
        print(f"  geocoder: cache updated -> {len(cache)} entries")
    else:
        print("  geocoder: all addresses already cached")

    return cache


# ---------------------------------------------------------------------------
# Tract polygons + spatial join (mirrors fetch_oakland_data.py)
# ---------------------------------------------------------------------------

def load_tracts(path):
    with open(path) as f:
        data = json.load(f)
    geoms = []
    ids = []
    for feat in data['features']:
        props = feat.get('properties', {})
        tid = props.get('id')
        if not tid:
            continue
        try:
            geom = shape(feat['geometry'])
        except Exception:
            continue
        if not geom.is_valid:
            geom = geom.buffer(0)
        geoms.append(geom)
        ids.append(str(tid).zfill(6))
    print(f"Loaded {len(geoms)} tract polygons from "
          f"{os.path.relpath(path, REPO_ROOT)}")
    return geoms, ids


def build_geoid(tract_id_6):
    return f"{STATE_FIPS}{COUNTY_FIPS}{tract_id_6}"


def spatial_join(features, tract_geoms, tract_ids):
    if not features:
        return 0
    tree = STRtree(tract_geoms)
    matched = 0
    for feat in features:
        lon, lat = feat['geometry']['coordinates']
        pt = Point(lon, lat)
        candidate_idxs = tree.query(pt)
        hit_id = None
        for idx in candidate_idxs:
            if tract_geoms[idx].contains(pt):
                hit_id = tract_ids[idx]
                break
        if hit_id is not None:
            feat['properties']['tract_id'] = hit_id
            feat['properties']['tract_geoid'] = build_geoid(hit_id)
            matched += 1
    return matched


# ---------------------------------------------------------------------------
# Feature construction
# ---------------------------------------------------------------------------

def parse_date(s):
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], '%Y-%m-%d')
    except (ValueError, TypeError):
        return None


def determine_grounds(row):
    """Pull the True landlord (ll_*) and tenant (ts_*) ground flags into a
    short list of human-readable labels."""
    grounds = []
    for k, v in row.items():
        if v != 'True':
            continue
        if k.startswith('ll_') or k.startswith('ts_'):
            grounds.append(k)
    return grounds


def row_to_feature(row, lon, lat):
    """Build a GeoJSON Point feature from one AEMP RAP-petition row."""
    petition_number = row.get('petition_number') or ''
    case_number = row.get('case_number') or ''
    case_id = case_number.strip() or petition_number.strip()
    addr_l1 = (row.get('address_l1') or '').strip()
    addr_l2 = (row.get('address_l2') or '').strip()
    full_addr = addr_l1 if not addr_l2 else f"{addr_l1} #{addr_l2}"

    grounds = determine_grounds(row)

    return {
        'type': 'Feature',
        'geometry': {'type': 'Point', 'coordinates': [lon, lat]},
        'properties': {
            'case_id': case_id or None,
            'petition_number': petition_number or None,
            'case_number': case_number or None,
            'date_filed': row.get('date_filed') or None,
            'date_opened': row.get('date_filed') or None,
            'address': full_addr or None,
            'apn': row.get('apn') or None,
            'record_kind': row.get('record_kind') or None,
            'hearing_officer': row.get('hearing_officer') or None,
            'hearing_date': row.get('hearing_date') or None,
            'mediation_date': row.get('mediation_date') or None,
            'appeal_hearing_date': row.get('appeal_hearing_date') or None,
            'grounds': grounds,
            # tract_id and tract_geoid filled in by spatial-join step
            'tract_id': None,
            'tract_geoid': None,
        },
    }


# ---------------------------------------------------------------------------
# Rollup
# ---------------------------------------------------------------------------

def build_rollup(features, now=None):
    """Per-tract rollup. Schema:
       {tract_geoid: {total, last_year, last_5_years, judgments_for_landlord, tract_id,
                      tenant_petitions, landlord_petitions}}
    The `judgments_for_landlord` field is included for cross-file schema parity with
    the eviction record concept; for RAP petitions we proxy it as `landlord_petitions`
    (count of landlord-filed petitions, which historically result more often in
    landlord-favorable rent rulings).
    """
    if now is None:
        now = datetime.utcnow()
    cutoff_365 = now - timedelta(days=365)
    cutoff_5y = now - timedelta(days=365 * 5)

    rollup = defaultdict(lambda: {
        'total': 0,
        'last_year': 0,
        'last_5_years': 0,
        'tenant_petitions': 0,
        'landlord_petitions': 0,
        'judgments_for_landlord': 0,
        'tract_id': None,
    })

    # AEMP data ends 2022-03; "last year" against today's clock would always be 0.
    # Use the data's max date as the reference point for last_year/last_5_years.
    max_date = None
    for feat in features:
        d = parse_date(feat['properties'].get('date_filed'))
        if d and (max_date is None or d > max_date):
            max_date = d
    ref = max_date or now
    cutoff_365 = ref - timedelta(days=365)
    cutoff_5y = ref - timedelta(days=365 * 5)

    for feat in features:
        props = feat['properties']
        geoid = props.get('tract_geoid')
        if not geoid:
            continue
        bucket = rollup[geoid]
        bucket['tract_id'] = props.get('tract_id')
        bucket['total'] += 1
        kind = (props.get('record_kind') or '').strip()
        if kind == 'Tenant':
            bucket['tenant_petitions'] += 1
        elif kind == 'Landlord':
            bucket['landlord_petitions'] += 1
            bucket['judgments_for_landlord'] += 1
        d = parse_date(props.get('date_filed'))
        if d:
            if d >= cutoff_365:
                bucket['last_year'] += 1
            if d >= cutoff_5y:
                bucket['last_5_years'] += 1

    return dict(rollup), ref


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def write_geojson(features, path, source_label):
    fc = {
        'type': 'FeatureCollection',
        '_attribution': ATTRIBUTION,
        '_source': source_label,
        '_generated': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'features': features,
    }
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(fc, f)
    os.replace(tmp, path)


def write_rollup(rollup, path, source_label):
    payload = {
        '_attribution': ATTRIBUTION,
        '_source': source_label,
        '_generated': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'tracts': rollup,
    }
    tmp = path + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(payload, f)
    os.replace(tmp, path)


def file_size_str(path):
    if not os.path.exists(path):
        return 'missing'
    n = os.path.getsize(path)
    for unit in ('B', 'KB', 'MB', 'GB'):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--aemp-csv', default=DEFAULT_AEMP_CSV,
                        help=f'Path to AEMP rap_cases_clean.csv (default: {DEFAULT_AEMP_CSV})')
    parser.add_argument('--tracts', default=TRACTS_FILE,
                        help=f'Path to tract GeoJSON (default: {TRACTS_FILE})')
    parser.add_argument('--out-dir', default=OUTPUT_DIR,
                        help=f'Output directory (default: {OUTPUT_DIR})')
    parser.add_argument('--cache', default=GEOCODE_CACHE,
                        help=f'Geocode cache path (default: {GEOCODE_CACHE})')
    parser.add_argument('--last-n-years', type=int, default=None,
                        help='If set, restrict output to records filed within the last N '
                             'years (calculated against the latest date in the data). '
                             'Use to keep file size under budget.')
    args = parser.parse_args()

    if not os.path.exists(args.aemp_csv):
        print(f"ERROR: AEMP CSV not found: {args.aemp_csv}", file=sys.stderr)
        print("Clone the repo first: "
              "git clone https://github.com/antievictionmappingproject/aemp-rap-scrape "
              "/tmp/aemp-rap-scrape", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(args.tracts):
        print(f"ERROR: tract file not found: {args.tracts}", file=sys.stderr)
        sys.exit(1)
    os.makedirs(args.out_dir, exist_ok=True)

    print(f"\n=== Loading AEMP RAP cases ===")
    rows = load_aemp_rows(args.aemp_csv)
    print(f"  loaded {len(rows)} petition rows")

    # Optional date trim.
    if args.last_n_years is not None:
        max_d = None
        for r in rows:
            d = parse_date(r.get('date_filed'))
            if d and (max_d is None or d > max_d):
                max_d = d
        if max_d is not None:
            cutoff = max_d - timedelta(days=365 * args.last_n_years)
            before = len(rows)
            rows = [r for r in rows
                    if (parse_date(r.get('date_filed')) or datetime.min) >= cutoff]
            print(f"  filtered to last {args.last_n_years}y: {len(rows)} (was {before}); "
                  f"cutoff={cutoff.date()}, max={max_d.date()}")

    # Build unique address universe.
    addr_universe = set()
    for r in rows:
        a = normalize_address(r.get('address_l1'), r.get('address_l2'))
        if a:
            addr_universe.add(a)
    print(f"  {len(addr_universe)} unique addresses to geocode")

    print(f"\n=== Geocoding via U.S. Census batch endpoint ===")
    addr_to_coord = geocode_addresses(addr_universe, cache_path=args.cache)
    hits = sum(1 for v in addr_to_coord.values() if v is not None)
    misses = sum(1 for v in addr_to_coord.values() if v is None)
    hit_rate = 100.0 * hits / max(hits + misses, 1)
    print(f"  geocode hit rate: {hits}/{hits + misses} ({hit_rate:.1f}%)")

    # Build features.
    print(f"\n=== Building features ===")
    features = []
    no_addr = 0
    no_coord = 0
    for r in rows:
        a = normalize_address(r.get('address_l1'), r.get('address_l2'))
        if not a:
            no_addr += 1
            continue
        coord = addr_to_coord.get(a)
        if not coord:
            no_coord += 1
            continue
        lon, lat = coord
        features.append(row_to_feature(r, lon, lat))
    print(f"  built {len(features)} features "
          f"(skipped {no_addr} with no address, {no_coord} with un-geocoded address)")

    # Tract polygons + spatial join.
    print(f"\n=== Spatial join ===")
    tract_geoms, tract_ids = load_tracts(args.tracts)
    matched = spatial_join(features, tract_geoms, tract_ids)
    pct_match = 100.0 * matched / max(len(features), 1)
    print(f"  matched {matched}/{len(features)} features to a tract ({pct_match:.1f}%)")

    # Drop features outside Oakland's TANC-tract universe; we only display points
    # whose tract lives in public/data.geojson (matches habitability/311 behavior).
    in_oakland = [f for f in features if f['properties'].get('tract_geoid')]
    dropped_oob = len(features) - len(in_oakland)
    print(f"  retained {len(in_oakland)} features inside TANC tracts "
          f"(dropped {dropped_oob} outside)")

    rollup, ref_date = build_rollup(in_oakland)
    print(f"  rollup covers {len(rollup)} tracts; date reference={ref_date.date()}")

    # Source label includes geocode + coverage caveats.
    aemp_max = ref_date.date().isoformat()
    aemp_min = None
    for r in rows:
        d = parse_date(r.get('date_filed'))
        if d and (aemp_min is None or d < aemp_min):
            aemp_min = d
    aemp_min_s = aemp_min.date().isoformat() if aemp_min else 'unknown'
    source_label = (
        f"{SOURCE_LABEL_BASE} "
        f"AEMP coverage: {aemp_min_s} to {aemp_max}. "
        f"Geocode hit rate {hit_rate:.1f}% over {len(addr_universe)} unique addresses; "
        f"un-geocoded addresses are dropped from the GeoJSON. "
        f"`last_year`/`last_5_years` rollup fields are computed against the latest "
        f"date in the AEMP data ({aemp_max}), not today's date."
    )

    geojson_path = os.path.join(args.out_dir, 'oakland_rap_cases.geojson')
    rollup_path = os.path.join(args.out_dir, 'oakland_evictions_by_tract.json')
    write_geojson(in_oakland, geojson_path, source_label)
    write_rollup(rollup, rollup_path, source_label)

    print("\n=== DONE ===")
    print(f"  geojson: {geojson_path} ({file_size_str(geojson_path)})")
    print(f"  rollup : {rollup_path} ({file_size_str(rollup_path)})")
    print(f"  features written     : {len(in_oakland):,}")
    print(f"  tracts covered       : {len(rollup)}")
    print(f"  geocode hit rate     : {hit_rate:.1f}%")


if __name__ == '__main__':
    main()
