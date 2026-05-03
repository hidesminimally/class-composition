"""
Ingests a user-provided eviction CSV (from RAP, AEMC, Social Explorer, Princeton Eviction Lab,
or any source). Joins by tract ID and computes eviction_rate = filings / renter_households * 1000.

Expected schema (see data/evictions_input.csv.example):
  - tract_id      (string, 11-digit GEOID or 6-digit tract code)
  - eviction_filings (int)
  - eviction_judgments (int, optional)
  - year (int, optional — used for filtering if multiple years present)

If the input has additional columns, they are passed through.

Run after fetch_census.py:
  python ingest_evictions.py --input ../../data/evictions_input.csv [--year 2023]
"""
import argparse
import os
import pandas as pd

INPUT_DEFAULT = "../../data/evictions_input.csv"
OUTPUT_FILE = "evictions_normalized.csv"

def normalize_evictions_df(df: pd.DataFrame) -> pd.DataFrame:
    """Convert any tract_id format to 6-digit string id matching census output.

    Handles:
    - 6-digit tract code: "400100" -> "400100"
    - 11-digit standard GEOID (state 2 + county 3 + tract 6): "06001400100" -> "400100"
    - 12-digit or longer GEOID: take characters [5:11] as the tract portion
    """
    df = df.copy()
    df['tract_id'] = df['tract_id'].astype(str).str.replace(r'\.0$', '', regex=True).str.strip()

    def extract_tract(s):
        if len(s) >= 11:
            # GEOID format: state(2) + county(3) + tract(6), so tract starts at index 5
            return s[5:11].zfill(6)
        else:
            # Short form — pad to 6 digits
            return s.zfill(6)

    df['id'] = df['tract_id'].apply(extract_tract)
    return df

def compute_eviction_rate(evictions: pd.DataFrame, renter_households: pd.DataFrame) -> pd.DataFrame:
    """Adds eviction_rate column = filings per 1000 renter households."""
    merged = evictions.merge(renter_households[['id', 'renter_households_total']], on='id', how='left')
    rh = merged['renter_households_total'].fillna(0)
    # Use float division and handle div-by-zero cleanly; avoid pd.NA with round() incompatibilities
    safe_rh = rh.replace(0, float('nan'))
    merged['eviction_rate'] = (
        (merged['eviction_filings'].astype(float) / safe_rh) * 1000
    ).fillna(0).round(1)
    return merged

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=INPUT_DEFAULT, help='Path to user-provided eviction CSV')
    parser.add_argument('--year', type=int, default=None, help='If CSV has multi-year data, filter to this year')
    parser.add_argument('--census', default='census_fresh_data_2020.csv', help='Census CSV for renter household join')
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Eviction CSV not found at {args.input}. Skipping eviction ingest.")
        print(f"   To enable evictions, copy your data to {args.input} (see data/evictions_input.csv.example for schema).")
        return

    df = pd.read_csv(args.input, dtype={'tract_id': str})
    df = normalize_evictions_df(df)

    if args.year and 'year' in df.columns:
        df = df[df['year'] == args.year]

    rh = pd.read_csv(args.census, dtype={'id': str})
    out = compute_eviction_rate(df, rh)

    out[['id', 'eviction_filings', 'eviction_rate']].to_csv(OUTPUT_FILE, index=False)
    print(f"Saved {len(out)} eviction rows to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
