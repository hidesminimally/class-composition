import pandas as pd
import pytest
from src.scripts.process_data import (
    pct_change_with_cpi,
    crosswalk_weighted_avg,
)

def test_pct_change_basic():
    # 2010 rent = $1000, 2020 rent = $2000, CPI factor 1.187
    # CPI-adjusted 2010 rent = $1187. Real change = (2000-1187)/1187 = 68.5%
    result = pct_change_with_cpi(old=1000, new=2000, cpi_factor=1.187)
    assert result == pytest.approx(68.5, abs=0.1)

def test_pct_change_no_inflation_for_pop():
    # Population doesn't get CPI-adjusted; cpi_factor=1.0
    result = pct_change_with_cpi(old=5000, new=6000, cpi_factor=1.0)
    assert result == pytest.approx(20.0)

def test_pct_change_handles_zero_old():
    # Avoid div by zero; return None or 0
    result = pct_change_with_cpi(old=0, new=100, cpi_factor=1.0)
    assert result is None or result == 0

def test_crosswalk_one_to_one():
    # Tract 400100 (2010) -> Tract 400100 (2020), area_pct=1.0
    df_2010 = pd.DataFrame({'id': ['400100'], 'total_pop': [1000], 'median_gross_rent': [1500]})
    crosswalk = pd.DataFrame({'tract_2010': ['400100'], 'tract_2020': ['400100'], 'area_pct': [1.0]})
    result = crosswalk_weighted_avg(df_2010, crosswalk, value_cols=['total_pop', 'median_gross_rent'])
    assert result.loc[result['id'] == '400100', 'total_pop'].iloc[0] == 1000
    assert result.loc[result['id'] == '400100', 'median_gross_rent'].iloc[0] == 1500

def test_crosswalk_one_to_two_split():
    # Tract 400100 (2010, pop 1000) split into 400101 (60%) + 400102 (40%) (2020)
    df_2010 = pd.DataFrame({'id': ['400100'], 'total_pop': [1000]})
    crosswalk = pd.DataFrame({
        'tract_2010': ['400100', '400100'],
        'tract_2020': ['400101', '400102'],
        'area_pct': [0.6, 0.4]
    })
    result = crosswalk_weighted_avg(df_2010, crosswalk, value_cols=['total_pop'])
    assert result.loc[result['id'] == '400101', 'total_pop'].iloc[0] == pytest.approx(600)
    assert result.loc[result['id'] == '400102', 'total_pop'].iloc[0] == pytest.approx(400)
