"""
Downloads the Census 2010-to-2020 tract relationship file for California.

Source: Census Bureau geographic relationship files
URL pattern: https://www2.census.gov/geo/docs/maps-data/data/rel2020/tract/tab20_tract20_tract10_st06.txt

Output: tract_2010_2020_crosswalk.csv with columns:
  - tract_2010 (6-digit, Alameda only)
  - tract_2020 (6-digit, Alameda only)
  - area_pct  (% of 2010 tract that maps to this 2020 tract, for population-weighting)
"""
import urllib.request
import pandas as pd
import config

URL = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/tract/tab20_tract20_tract10_st06.txt"
RAW_FILE = "tab20_tract20_tract10_st06.txt"
OUTPUT_FILE = "tract_2010_2020_crosswalk.csv"

def main():
    print(f"Downloading {URL}")
    urllib.request.urlretrieve(URL, RAW_FILE)
    print(f"   Saved {RAW_FILE}")

    # File is pipe-delimited
    df = pd.read_csv(RAW_FILE, sep='|', dtype=str)

    print(f"   Columns found: {list(df.columns)}")

    # The file uses GEOID_TRACT_20/10 format: 11-digit GEOID (state 2 + county 3 + tract 6)
    # e.g. "06001400100" -> state=06, county=001, tract=400100
    # Filter to Alameda County (FIPS 06001)
    alameda_prefix = config.STATE_FIPS + config.COUNTY_FIPS  # "06001"
    df = df[df['GEOID_TRACT_20'].str.startswith(alameda_prefix)]
    df = df[df['GEOID_TRACT_10'].str.startswith(alameda_prefix)]

    # Build a clean small frame
    # Extract 6-digit tract code = last 6 chars of GEOID
    out = pd.DataFrame({
        'tract_2010': df['GEOID_TRACT_10'].str[-6:].str.zfill(6),
        'tract_2020': df['GEOID_TRACT_20'].str[-6:].str.zfill(6),
        # AREALAND_PART = land area shared between 2010 and 2020 tract
        # AREALAND_TRACT_10 = total land area of the 2010 tract
        # area_pct = portion of 2010 tract that is in this 2020 tract
        'area_pct': (df['AREALAND_PART'].astype(float) / df['AREALAND_TRACT_10'].astype(float)).round(4),
    })

    out.to_csv(OUTPUT_FILE, index=False)
    print(f"Saved {len(out)} crosswalk rows to {OUTPUT_FILE}")
    print(f"   Unique 2010 tracts: {out['tract_2010'].nunique()}")
    print(f"   Unique 2020 tracts: {out['tract_2020'].nunique()}")
    print(f"   Tracts that split (1->many): {(out.groupby('tract_2010').size() > 1).sum()}")

if __name__ == "__main__":
    main()
