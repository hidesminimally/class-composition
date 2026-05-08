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

def parse_crosswalk(df, alameda_prefix):
    """Pure helper: given the raw relationship-file DataFrame and a county
    GEOID prefix (e.g. '06001'), return the cleaned crosswalk DataFrame
    (tract_2010, tract_2020, area_pct). Pulled out for unit-testing without
    network calls."""
    df = df[df['GEOID_TRACT_20'].str.startswith(alameda_prefix)]
    df = df[df['GEOID_TRACT_10'].str.startswith(alameda_prefix)]

    return pd.DataFrame({
        'tract_2010': df['GEOID_TRACT_10'].str[-6:].str.zfill(6),
        'tract_2020': df['GEOID_TRACT_20'].str[-6:].str.zfill(6),
        'area_pct': (df['AREALAND_PART'].astype(float) / df['AREALAND_TRACT_10'].astype(float)).round(4),
    })


def main():
    print(f"Downloading {URL}")
    urllib.request.urlretrieve(URL, RAW_FILE)
    print(f"   Saved {RAW_FILE}")

    df = pd.read_csv(RAW_FILE, sep='|', dtype=str)

    print(f"   Columns found: {list(df.columns)}")

    alameda_prefix = config.STATE_FIPS + config.COUNTY_FIPS  # "06001"
    out = parse_crosswalk(df, alameda_prefix)

    out.to_csv(OUTPUT_FILE, index=False)
    print(f"Saved {len(out)} crosswalk rows to {OUTPUT_FILE}")
    print(f"   Unique 2010 tracts: {out['tract_2010'].nunique()}")
    print(f"   Unique 2020 tracts: {out['tract_2020'].nunique()}")
    print(f"   Tracts that split (1->many): {(out.groupby('tract_2010').size() > 1).sum()}")

if __name__ == "__main__":
    main()
