import pandas as pd
import geopandas as gpd
import os
import config


def pct_change_with_cpi(old, new, cpi_factor=1.0):
    """Percent change after adjusting old value to new dollars via CPI factor."""
    if old is None or new is None or pd.isna(old) or pd.isna(new) or old == 0:
        return None
    adjusted_old = old * cpi_factor
    if adjusted_old == 0:
        return None
    return round((new - adjusted_old) / adjusted_old * 100, 1)


def crosswalk_weighted_avg(df_old: pd.DataFrame, crosswalk: pd.DataFrame, value_cols: list) -> pd.DataFrame:
    """
    Apply 2010-to-2020 tract crosswalk: weight each old-tract value by area_pct
    of the (old -> new) mapping. Returns one row per 2020 tract with weighted values.

    For tracts that didn't change, area_pct=1.0 -> values pass through.
    For 1->many splits, the old tract's values are distributed by area weight.
    For many->1 merges, the new tract aggregates weighted contributions.
    """
    # Join old data to crosswalk on 2010 tract id
    merged = crosswalk.merge(df_old, left_on='tract_2010', right_on='id', how='left')

    # Multiply each value column by area_pct
    for col in value_cols:
        if col in merged.columns:
            merged[f'{col}_weighted'] = merged[col] * merged['area_pct']

    # Sum (weighted) by 2020 tract id
    agg_dict = {f'{col}_weighted': 'sum' for col in value_cols if f'{col}_weighted' in merged.columns}
    out = merged.groupby('tract_2020').agg(agg_dict).reset_index()
    out = out.rename(columns={'tract_2020': 'id', **{f'{col}_weighted': col for col in value_cols}})
    return out


CENSUS_DATA_2020 = "census_fresh_data_2020.csv"
CENSUS_DATA_2010 = "census_fresh_data_2010.csv"
CROSSWALK_FILE = "tract_2010_2020_crosswalk.csv"
EVICTIONS_FILE = "evictions_normalized.csv"
MANUAL_LOCALS_FILE = "tanc_data_clean.csv"
MAP_FILE = "tanc_map_data.geojson"
OUTPUT_FILE = "../../public/data.geojson"

# Vars we want change-over-time deltas for (PDF #2, 14, 15, 16, 17)
DELTA_VARS = {
    'total_pop': {'cpi': 1.0, 'label': 'population'},
    'median_gross_rent': {'cpi': config.CPI_DEFLATOR_2010_TO_2020, 'label': 'rent'},
    'median_hh_income': {'cpi': config.CPI_DEFLATOR_2010_TO_2020, 'label': 'income'},
    'pct_white': {'cpi': 1.0, 'label': 'white'},
    'pct_black': {'cpi': 1.0, 'label': 'black'},
    'pct_asian': {'cpi': 1.0, 'label': 'asian'},
    'pct_hispanic': {'cpi': 1.0, 'label': 'hispanic'},
}

def main():
    print("Starting Data Merge...")

    if not os.path.exists(CENSUS_DATA_2020):
        print(f"ERROR: {CENSUS_DATA_2020} not found. Run: python fetch_census.py --vintage 2020")
        return

    df_2020 = pd.read_csv(CENSUS_DATA_2020, dtype={'id': str})

    # Optional: 2010 vintage for deltas
    df_2010 = None
    crosswalk = None
    if os.path.exists(CENSUS_DATA_2010) and os.path.exists(CROSSWALK_FILE):
        df_2010 = pd.read_csv(CENSUS_DATA_2010, dtype={'id': str})
        crosswalk = pd.read_csv(CROSSWALK_FILE, dtype={'tract_2010': str, 'tract_2020': str})
    else:
        print(f"WARNING: Missing {CENSUS_DATA_2010} or {CROSSWALK_FILE}. Change-over-time deltas will be skipped.")

    # 1. Apply crosswalk to 2010 data, get one row per 2020 tract id
    if df_2010 is not None and crosswalk is not None:
        delta_value_cols = [c for c in DELTA_VARS if c in df_2010.columns]
        df_2010_aligned = crosswalk_weighted_avg(df_2010, crosswalk, value_cols=delta_value_cols)
        # Suffix _2010 so they don't collide
        df_2010_aligned = df_2010_aligned.rename(columns={c: f'{c}_2010' for c in delta_value_cols})
        df_merged = df_2020.merge(df_2010_aligned, on='id', how='left')

        # Compute deltas
        for var, cfg in DELTA_VARS.items():
            old_col = f'{var}_2010'
            if var in df_merged.columns and old_col in df_merged.columns:
                df_merged[f'{var}_delta_pct'] = df_merged.apply(
                    lambda row: pct_change_with_cpi(row[old_col], row[var], cfg['cpi']),
                    axis=1
                )
    else:
        df_merged = df_2020

    # 2. Locals
    df_locals = pd.read_csv(MANUAL_LOCALS_FILE, dtype={'Match_ID': str})
    df_locals_subset = df_locals[['Match_ID', 'TANC Local']].copy()
    df_locals_subset = df_locals_subset.rename(columns={'Match_ID': 'id', 'TANC Local': 'tanc_local'})
    df_locals_subset['id'] = df_locals_subset['id'].apply(lambda x: str(x).split('.')[0].zfill(6))
    df_merged = df_merged.merge(df_locals_subset, on='id', how='left')
    df_merged['tanc_local'] = df_merged['tanc_local'].fillna('')
    print(f"   Matched {df_merged['tanc_local'].ne('').sum()} tracts to TANC Locals.")

    # 3. Evictions (optional)
    if os.path.exists(EVICTIONS_FILE):
        df_evict = pd.read_csv(EVICTIONS_FILE, dtype={'id': str})
        df_merged = df_merged.merge(df_evict[['id', 'eviction_rate', 'eviction_filings']], on='id', how='left')
        print(f"   Joined eviction data for {df_merged['eviction_rate'].notna().sum()} tracts.")
    else:
        df_merged['eviction_rate'] = None
        df_merged['eviction_filings'] = None
        print(f"WARNING: No {EVICTIONS_FILE}. Eviction columns will be null.")

    # 4. Geography
    gdf = gpd.read_file(MAP_FILE)
    geo_id_col = None
    for col in gdf.columns:
        if str(gdf[col].iloc[0]).zfill(6) in df_merged['id'].values:
            geo_id_col = col
            break
    if not geo_id_col:
        gdf['id_match'] = gdf['GEOID'].apply(lambda x: str(x)[-6:])
        geo_id_col = 'id_match'
    print(f"   Merging Map using column: {geo_id_col}")
    final_gdf = gdf.merge(df_merged, left_on=geo_id_col, right_on='id', how='inner')

    # 5. Keep all 17-var columns + deltas + eviction + geometry
    base_cols = [
        'id', 'tanc_local',
        # Variable 8: Population
        'total_pop',
        # 1, 9: Rent and income (current)
        'median_gross_rent', 'median_hh_income',
        # 4, 7: Unemployment + rent burden
        'unemployment', 'rent_burden',
        # 3: Poverty
        'poverty_rate',
        # 5: Occupancy / vacancy
        'vacancy_rate', 'occupancy_rate',
        # 10: Race / ethnicity
        'pct_white', 'pct_black', 'pct_hispanic', 'pct_asian',
        # 12: Household size
        'avg_household_size',
        # 13: Length of residency (renter buckets, percentages)
        'pct_lor_2019_or_later', 'pct_lor_2015_2018', 'pct_lor_2010_2014',
        'pct_lor_2000_2009', 'pct_lor_1990_1999', 'pct_lor_1989_or_earlier',
        # 11: Linguistic composition (top languages, percentages)
        'pct_lang_english_only', 'pct_lang_spanish', 'pct_lang_chinese',
        'pct_lang_vietnamese', 'pct_lang_tagalog', 'pct_lang_korean', 'pct_lang_french',
        # Misc useful
        'median_year_built',
        # 6: Evictions
        'eviction_rate', 'eviction_filings',
        # Class composition layer (added 2026-05-03)
        'pct_foreign_born', 'pct_naturalized', 'pct_noncitizen',
        'pct_limited_eng_spanish', 'pct_limited_eng_indoeuropean',
        'pct_limited_eng_apilang', 'pct_limited_eng_other', 'pct_limited_eng_any',
        'pct_pub_assist_or_snap', 'pct_renter_no_vehicle', 'pct_under_35k',
    ]
    delta_cols = [f'{v}_2010' for v in DELTA_VARS] + [f'{v}_delta_pct' for v in DELTA_VARS]
    keep_cols = base_cols + delta_cols + ['geometry']

    final_cols = [c for c in keep_cols if c in final_gdf.columns]
    final_gdf = final_gdf[final_cols]

    output_dir = os.path.dirname(OUTPUT_FILE)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)
    final_gdf.to_file(OUTPUT_FILE, driver='GeoJSON')
    print(f"Success! Map saved to {OUTPUT_FILE} with {len(final_gdf)} tracts.")
    print(f"   Columns ({len(final_cols)}): {final_cols}")

if __name__ == "__main__":
    main()