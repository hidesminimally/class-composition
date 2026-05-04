"""Tests for pure helpers extracted from fetch_census.py and fetch_crosswalk.py.

These run without any network or API calls — they exercise the math directly
on small in-memory DataFrames.
"""
import math
import pandas as pd
import pytest

from fetch_census import compute_derived_metrics
from fetch_crosswalk import parse_crosswalk


# ---------- compute_derived_metrics ----------

def _base_row(**overrides):
    """A row with every column compute_derived_metrics needs, easy to override."""
    row = {
        'tract': '400100',
        'total_pop': 1000,
        'pop_white_non_hisp': 400,
        'pop_black': 250,
        'pop_asian': 150,
        'pop_hispanic': 200,
        'unemployed': 50,
        'labor_force': 500,
        'pop_poverty': 80,
        'pop_poverty_total': 800,
        'housing_units_vacant': 20,
        'housing_units_total': 400,
        'burden_30_35': 30,
        'burden_35_40': 25,
        'burden_40_50': 20,
        'burden_50_plus': 25,  # total burdened = 100
        'renter_households_total': 200,  # → 50% rent burden
    }
    row.update(overrides)
    return row


def test_race_percentages_round_to_one_decimal():
    df = pd.DataFrame([_base_row()])
    out = compute_derived_metrics(df)
    assert out['pct_white'].iloc[0] == 40.0
    assert out['pct_black'].iloc[0] == 25.0
    assert out['pct_asian'].iloc[0] == 15.0
    assert out['pct_hispanic'].iloc[0] == 20.0


def test_unemployment_rate_calculation():
    df = pd.DataFrame([_base_row(unemployed=50, labor_force=500)])
    out = compute_derived_metrics(df)
    assert out['unemployment'].iloc[0] == 10.0


def test_unemployment_zero_labor_force_does_not_crash():
    # Division by zero would produce NaN; .fillna(0) handles it
    df = pd.DataFrame([_base_row(unemployed=0, labor_force=0)])
    out = compute_derived_metrics(df)
    assert out['unemployment'].iloc[0] == 0.0


def test_poverty_rate_calculation():
    df = pd.DataFrame([_base_row(pop_poverty=120, pop_poverty_total=600)])
    out = compute_derived_metrics(df)
    assert out['poverty_rate'].iloc[0] == 20.0


def test_vacancy_and_occupancy_rate_sum_to_100():
    df = pd.DataFrame([_base_row(housing_units_vacant=40, housing_units_total=400)])
    out = compute_derived_metrics(df)
    assert out['vacancy_rate'].iloc[0] == 10.0
    assert out['occupancy_rate'].iloc[0] == 90.0


def test_rent_burden_uses_all_four_buckets():
    df = pd.DataFrame([_base_row(
        burden_30_35=10, burden_35_40=10, burden_40_50=10, burden_50_plus=10,
        renter_households_total=100  # 40 burdened / 100 = 40%
    )])
    out = compute_derived_metrics(df)
    assert out['rent_burden'].iloc[0] == 40.0


def test_rent_burden_zero_renters_does_not_crash():
    df = pd.DataFrame([_base_row(renter_households_total=0)])
    out = compute_derived_metrics(df)
    assert out['rent_burden'].iloc[0] == 0.0


def test_residency_buckets_only_added_when_lor_total_present():
    df = pd.DataFrame([_base_row()])
    out = compute_derived_metrics(df)
    assert 'pct_lor_2019_or_later' not in out.columns


def test_residency_bucket_percentages_calculated_when_present():
    row = _base_row()
    row['lor_total'] = 200
    row['lor_2019_or_later'] = 50
    row['lor_2015_2018'] = 30
    row['lor_2010_2014'] = 40
    row['lor_2000_2009'] = 30
    row['lor_1990_1999'] = 30
    row['lor_1989_or_earlier'] = 20
    df = pd.DataFrame([row])
    out = compute_derived_metrics(df)
    assert out['pct_lor_2019_or_later'].iloc[0] == 25.0
    assert out['pct_lor_2015_2018'].iloc[0] == 15.0
    assert out['pct_lor_1989_or_earlier'].iloc[0] == 10.0
    # All buckets sum (with rounding) ≈ 100%
    bucket_cols = ['pct_lor_2019_or_later', 'pct_lor_2015_2018', 'pct_lor_2010_2014',
                   'pct_lor_2000_2009', 'pct_lor_1990_1999', 'pct_lor_1989_or_earlier']
    assert math.isclose(sum(out[c].iloc[0] for c in bucket_cols), 100.0, abs_tol=0.5)


def test_language_percentages_calculated_when_present():
    row = _base_row()
    row['lang_total'] = 500
    row['lang_english_only'] = 350
    row['lang_spanish'] = 100
    row['lang_chinese'] = 30
    row['lang_vietnamese'] = 20
    df = pd.DataFrame([row])
    out = compute_derived_metrics(df)
    assert out['pct_lang_english_only'].iloc[0] == 70.0
    assert out['pct_lang_spanish'].iloc[0] == 20.0
    assert out['pct_lang_chinese'].iloc[0] == 6.0
    assert out['pct_lang_vietnamese'].iloc[0] == 4.0


def test_does_not_mutate_input_df():
    df = pd.DataFrame([_base_row()])
    cols_before = set(df.columns)
    compute_derived_metrics(df)
    assert set(df.columns) == cols_before


def test_handles_multiple_rows():
    rows = [_base_row(tract='1', total_pop=1000, pop_black=300),
            _base_row(tract='2', total_pop=500,  pop_black=125)]
    df = pd.DataFrame(rows)
    out = compute_derived_metrics(df)
    assert len(out) == 2
    assert out['pct_black'].iloc[0] == 30.0
    assert out['pct_black'].iloc[1] == 25.0


# ---------- parse_crosswalk ----------

def _crosswalk_row(geoid_10, geoid_20, area_part, area_total):
    return {
        'GEOID_TRACT_10': geoid_10,
        'GEOID_TRACT_20': geoid_20,
        'AREALAND_PART': str(area_part),
        'AREALAND_TRACT_10': str(area_total),
    }


def test_filters_to_alameda_county_only():
    df = pd.DataFrame([
        _crosswalk_row('06001400100', '06001400100', 100, 100),  # Alameda
        _crosswalk_row('06075020100', '06075020100', 100, 100),  # SF — drop
        _crosswalk_row('06001400200', '06075020100', 100, 100),  # mixed — drop
    ])
    out = parse_crosswalk(df, '06001')
    assert len(out) == 1
    assert out['tract_2010'].iloc[0] == '400100'


def test_extracts_last_6_digits_as_tract_id():
    df = pd.DataFrame([_crosswalk_row('06001400100', '06001400200', 100, 100)])
    out = parse_crosswalk(df, '06001')
    assert out['tract_2010'].iloc[0] == '400100'
    assert out['tract_2020'].iloc[0] == '400200'


def test_zero_pads_tract_codes_to_6_digits():
    # Hypothetical short tract numbers — last 6 chars padded
    df = pd.DataFrame([_crosswalk_row('06001000100', '06001000200', 100, 100)])
    out = parse_crosswalk(df, '06001')
    assert len(out['tract_2010'].iloc[0]) == 6
    assert len(out['tract_2020'].iloc[0]) == 6


def test_area_pct_is_part_over_total():
    df = pd.DataFrame([_crosswalk_row('06001400100', '06001400100', 250, 1000)])
    out = parse_crosswalk(df, '06001')
    assert out['area_pct'].iloc[0] == 0.25


def test_area_pct_rounded_to_4_decimals():
    df = pd.DataFrame([_crosswalk_row('06001400100', '06001400100', 1, 3)])
    out = parse_crosswalk(df, '06001')
    # 1/3 = 0.333... rounded to 4 decimals
    assert out['area_pct'].iloc[0] == 0.3333


def test_full_overlap_yields_area_pct_one():
    df = pd.DataFrame([_crosswalk_row('06001400100', '06001400100', 1000, 1000)])
    out = parse_crosswalk(df, '06001')
    assert out['area_pct'].iloc[0] == 1.0


def test_split_2010_tract_into_multiple_2020_tracts():
    # Same 2010 tract maps to two 2020 tracts (split)
    df = pd.DataFrame([
        _crosswalk_row('06001400100', '06001400101', 600, 1000),
        _crosswalk_row('06001400100', '06001400102', 400, 1000),
    ])
    out = parse_crosswalk(df, '06001')
    assert len(out) == 2
    assert math.isclose(out['area_pct'].sum(), 1.0)


def test_returns_empty_frame_when_no_alameda_rows():
    df = pd.DataFrame([_crosswalk_row('06075020100', '06075020100', 100, 100)])
    out = parse_crosswalk(df, '06001')
    assert len(out) == 0
    # Schema preserved even when empty
    assert list(out.columns) == ['tract_2010', 'tract_2020', 'area_pct']
