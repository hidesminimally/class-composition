import argparse
import numpy as np
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

# Variables that may not be available in older vintages — degrade gracefully.
# Class-composition layer (B05*/C16002/B19058/B25044/B19001) was only needed for
# 2020 (current snapshot), so dropping it from 2010 is intentional.
GRACEFUL_DEGRADE_PREFIXES = ['B25026_', 'B16001_', 'C16001_', 'B05001_', 'B05002_',
                             'C16002_', 'B19058_', 'B25044_', 'B19001_',
                             'B25003_', 'B25034_']

# Census API "annotation" sentinels meaning "data not available / suppressed".
# See https://www.census.gov/data/developers/data-sets/acs-5year/data-notes.html
# These must be replaced with NaN before any arithmetic — otherwise they
# propagate through CPI math and produce nonsense like -$666M median rent.
CENSUS_NULL_SENTINELS = [-666666666, -888888888, -999999999, -222222222,
                         -333333333, -555555555, -111111111]


ID_COLS = {'state', 'county', 'tract', 'NAME', 'id', 'GEOID'}


def normalize_census_nulls(df):
    """Replace Census API null/suppressed-data sentinels with NaN. The API
    returns numbers as strings, so for non-numeric columns we replace string
    sentinels then attempt numeric coercion. Identifier columns (state,
    county, tract, NAME, id) are explicitly skipped to preserve leading zeros
    and string formatting."""
    str_sentinels = [str(s) for s in CENSUS_NULL_SENTINELS]
    for col in df.columns:
        if col in ID_COLS:
            continue
        kind = df[col].dtype.kind
        if kind in 'fi':
            df[col] = df[col].replace(CENSUS_NULL_SENTINELS, np.nan)
        else:
            cleaned = df[col].replace(str_sentinels, np.nan)
            coerced = pd.to_numeric(cleaned, errors='coerce')
            if coerced.notna().sum() == cleaned.notna().sum():
                df[col] = coerced
    return df


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
        # Graceful degrade: drop variables not available in this vintage and retry.
        # This handles C16001 missing in older vintages (introduced ~2016) and
        # the class-composition layer (B05*/C16002/B19058/B25044/B19001) which
        # is only needed for the 2020 snapshot.
        dropped = [k for k in fields if any(k.startswith(p) for p in GRACEFUL_DEGRADE_PREFIXES)]
        if dropped:
            print(f"WARNING: Census API rejected full field set for vintage {vintage}: {e}")
            print(f"         Dropping {len(dropped)} unavailable variables and retrying...")
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

    # Replace Census null sentinels (-666666666 etc.) BEFORE math
    df = normalize_census_nulls(df)

    print(f"   Fetched {len(df)} tracts. Calculating derived metrics...")
    df = compute_derived_metrics(df)

    df.to_csv(output_file, index=False)
    print(f"Saved fresh Census data to {output_file}")


def compute_derived_metrics(df):
    """Pure helper: given a renamed Census DataFrame, return df with derived
    metrics added. Pulled out for unit-testing without API calls."""
    df = df.copy()

    def _safe_pct(num, den):
        return (num / den * 100).replace([np.inf, -np.inf], np.nan).round(1).fillna(0)

    df['pct_white'] = _safe_pct(df['pop_white_non_hisp'], df['total_pop'])
    df['pct_black'] = _safe_pct(df['pop_black'], df['total_pop'])
    df['pct_asian'] = _safe_pct(df['pop_asian'], df['total_pop'])
    df['pct_hispanic'] = _safe_pct(df['pop_hispanic'], df['total_pop'])

    df['unemployment'] = _safe_pct(df['unemployed'], df['labor_force'])
    df['poverty_rate'] = _safe_pct(df['pop_poverty'], df['pop_poverty_total'])
    df['vacancy_rate'] = _safe_pct(df['housing_units_vacant'], df['housing_units_total'])
    df['occupancy_rate'] = (100.0 - df['vacancy_rate']).round(1)

    burdened_count = df['burden_30_35'] + df['burden_35_40'] + df['burden_40_50'] + df['burden_50_plus']
    df['rent_burden'] = _safe_pct(burdened_count, df['renter_households_total'])

    if 'lor_total' in df.columns:
        for bucket_col in ['lor_2019_or_later', 'lor_2015_2018', 'lor_2010_2014',
                           'lor_2000_2009', 'lor_1990_1999', 'lor_1989_or_earlier']:
            if bucket_col in df.columns:
                df[f'pct_{bucket_col}'] = _safe_pct(df[bucket_col], df['lor_total'])

    if 'lang_total' in df.columns:
        for lang_col in ['lang_english_only', 'lang_spanish', 'lang_french',
                         'lang_chinese', 'lang_vietnamese', 'lang_tagalog', 'lang_korean']:
            if lang_col in df.columns:
                df[f'pct_{lang_col}'] = _safe_pct(df[lang_col], df['lang_total'])

    # ---- Class composition derived metrics ----

    # Nativity / citizenship
    if 'nativity_total' in df.columns:
        df['pct_foreign_born'] = _safe_pct(df['pop_foreign_born'], df['nativity_total'])
    if 'citizenship_total' in df.columns:
        df['pct_naturalized'] = _safe_pct(df['pop_naturalized'], df['citizenship_total'])
        df['pct_noncitizen'] = _safe_pct(df['pop_noncitizen'], df['citizenship_total'])

    # Limited-English household share, by language family
    if 'hh_lang_total' in df.columns:
        for li_col, out_col in [
            ('hh_limited_eng_spanish', 'pct_limited_eng_spanish'),
            ('hh_limited_eng_indoeuropean', 'pct_limited_eng_indoeuropean'),
            ('hh_limited_eng_apilang', 'pct_limited_eng_apilang'),
            ('hh_limited_eng_other', 'pct_limited_eng_other'),
        ]:
            if li_col in df.columns:
                df[out_col] = _safe_pct(df[li_col], df['hh_lang_total'])
        # Aggregate across all language families = "any limited-English household"
        li_cols = [c for c in ['hh_limited_eng_spanish','hh_limited_eng_indoeuropean',
                               'hh_limited_eng_apilang','hh_limited_eng_other'] if c in df.columns]
        if li_cols:
            df['pct_limited_eng_any'] = _safe_pct(df[li_cols].sum(axis=1), df['hh_lang_total'])

    # SNAP / public assistance
    if 'pub_assist_total' in df.columns:
        df['pct_pub_assist_or_snap'] = _safe_pct(df['pub_assist_or_snap'], df['pub_assist_total'])

    # Renter household with no vehicle (transit-dependent renter signal)
    if 'renter_hh_total' in df.columns:
        df['pct_renter_no_vehicle'] = _safe_pct(df['renter_hh_no_vehicle'], df['renter_hh_total'])

    # Low-income share = households earning < $35k / all households
    if 'inc_dist_total' in df.columns:
        low_income_cols = ['inc_under_10k', 'inc_10_15k', 'inc_15_20k',
                           'inc_20_25k', 'inc_25_30k', 'inc_30_35k']
        present = [c for c in low_income_cols if c in df.columns]
        if present:
            df['pct_under_35k'] = _safe_pct(df[present].sum(axis=1), df['inc_dist_total'])

    # ---- Tenant bundle ----

    # Severe rent burden = renter households paying ≥50% of income on rent.
    # Already in raw burden_50_plus; surface as its own pct so the map can
    # distinguish severe from "any" burden (>30%, the existing rent_burden).
    if 'renter_households_total' in df.columns and 'burden_50_plus' in df.columns:
        df['pct_burden_50_plus'] = _safe_pct(df['burden_50_plus'], df['renter_households_total'])

    # Renter share of occupied housing
    if 'tenure_total' in df.columns and 'renter_occupied' in df.columns:
        df['pct_renter_occupied'] = _safe_pct(df['renter_occupied'], df['tenure_total'])

    # Pre-1980 housing share — practical proxy for Oakland RAP / Just Cause coverage.
    # Sums all year-built buckets up to and including 1970–1979.
    if 'year_built_total' in df.columns:
        pre_1980_cols = ['built_1970_1979', 'built_1960_1969', 'built_1950_1959',
                         'built_1940_1949', 'built_1939_or_earlier']
        present = [c for c in pre_1980_cols if c in df.columns]
        if present:
            df['pct_pre_1980_housing'] = _safe_pct(df[present].sum(axis=1), df['year_built_total'])

    return df


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--vintage', choices=list(VINTAGE_OUTPUT_MAP.keys()), default='2020',
                        help='Which 5-year ACS vintage to fetch. 2020=ACS 2018-2022, 2010=ACS 2008-2012')
    args = parser.parse_args()
    fetch_and_clean_data(vintage=args.vintage)
