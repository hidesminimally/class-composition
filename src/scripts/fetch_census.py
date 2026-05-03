import argparse
import pandas as pd
from census import Census
import config

VINTAGE_OUTPUT_MAP = {
    "2020": "census_fresh_data_2020.csv",  # ACS 2018-2022 5-year
    "2010": "census_fresh_data_2010.csv",  # ACS 2008-2012 5-year
}
VINTAGE_YEAR_MAP = {
    "2020": 2022,  # latest year in 2018-2022 5-year
    "2010": 2012,  # latest year in 2008-2012 5-year
}

# Variables that may not be available in older vintages — degrade gracefully
GRACEFUL_DEGRADE_PREFIXES = ['B25026_', 'B16001_']


def _get_fields_for_vintage(vintage):
    """Return census fields for the given vintage, dropping variables
    that are known to fail for older vintages if needed."""
    return dict(config.CENSUS_FIELDS)


def fetch_and_clean_data(vintage="2020"):
    year = VINTAGE_YEAR_MAP[vintage]
    output_file = VINTAGE_OUTPUT_MAP[vintage]
    print(f"Connecting to Census API — vintage {vintage} (ACS 5-year ending {year}). "
          f"State: {config.STATE_FIPS}, County: {config.COUNTY_FIPS}.")

    c = Census(config.API_KEY, year=year)
    fields = _get_fields_for_vintage(vintage)

    # First attempt: full field set
    try:
        raw_data = c.acs5.state_county_tract(
            list(fields.keys()),
            config.STATE_FIPS,
            config.COUNTY_FIPS,
            Census.ALL
        )
    except Exception as e:
        # Graceful degrade: drop B25026 and B16001 variables and retry
        dropped = [k for k in fields if any(k.startswith(p) for p in GRACEFUL_DEGRADE_PREFIXES)]
        if dropped:
            print(f"WARNING: Census API rejected full field set for vintage {vintage}: {e}")
            print(f"         Dropping {len(dropped)} variables (B25026/B16001) and retrying...")
            for k in dropped:
                del fields[k]
            try:
                raw_data = c.acs5.state_county_tract(
                    list(fields.keys()),
                    config.STATE_FIPS,
                    config.COUNTY_FIPS,
                    Census.ALL
                )
                print(f"         Retry succeeded with {len(fields)} fields.")
            except Exception as e2:
                print(f"ERROR: Second attempt also failed for vintage {vintage}: {e2}")
                raise
        else:
            print(f"ERROR: Census API call failed for vintage {vintage}: {e}")
            raise

    df = pd.DataFrame(raw_data)
    df = df.rename(columns=fields)
    df['id'] = df['tract'].astype(str).str.zfill(6)

    print(f"   Fetched {len(df)} tracts. Calculating derived metrics...")

    df['pct_white'] = (df['pop_white_non_hisp'] / df['total_pop'] * 100).round(1)
    df['pct_black'] = (df['pop_black'] / df['total_pop'] * 100).round(1)
    df['pct_asian'] = (df['pop_asian'] / df['total_pop'] * 100).round(1)
    df['pct_hispanic'] = (df['pop_hispanic'] / df['total_pop'] * 100).round(1)

    df['unemployment'] = (df['unemployed'] / df['labor_force'] * 100).round(1).fillna(0)
    df['poverty_rate'] = (df['pop_poverty'] / df['pop_poverty_total'] * 100).round(1).fillna(0)
    df['vacancy_rate'] = (df['housing_units_vacant'] / df['housing_units_total'] * 100).round(1).fillna(0)
    df['occupancy_rate'] = (100.0 - df['vacancy_rate']).round(1)

    burdened_count = df['burden_30_35'] + df['burden_35_40'] + df['burden_40_50'] + df['burden_50_plus']
    df['rent_burden'] = (burdened_count / df['renter_households_total'] * 100).round(1).fillna(0)

    # Length of residency percentages (renter buckets)
    if 'lor_total' in df.columns:
        for bucket_col in ['lor_2019_or_later', 'lor_2015_2018', 'lor_2010_2014',
                           'lor_2000_2009', 'lor_1990_1999', 'lor_1989_or_earlier']:
            if bucket_col in df.columns:
                df[f'pct_{bucket_col}'] = (df[bucket_col] / df['lor_total'] * 100).round(1).fillna(0)

    # Language percentages
    if 'lang_total' in df.columns:
        for lang_col in ['lang_english_only', 'lang_spanish', 'lang_french',
                         'lang_chinese', 'lang_vietnamese', 'lang_tagalog', 'lang_korean']:
            if lang_col in df.columns:
                df[f'pct_{lang_col}'] = (df[lang_col] / df['lang_total'] * 100).round(1).fillna(0)

    df.to_csv(output_file, index=False)
    print(f"Saved fresh Census data to {output_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--vintage', choices=list(VINTAGE_OUTPUT_MAP.keys()), default='2020',
                        help='Which 5-year ACS vintage to fetch. 2020=ACS 2018-2022, 2010=ACS 2008-2012')
    args = parser.parse_args()
    fetch_and_clean_data(vintage=args.vintage)
