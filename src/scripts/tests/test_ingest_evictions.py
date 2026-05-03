import pandas as pd
import pytest
from io import StringIO
from src.scripts.ingest_evictions import normalize_evictions_df, compute_eviction_rate

def test_normalize_full_geoid():
    csv = StringIO("tract_id,eviction_filings\n060014001001,10\n060014002001,5\n")
    df = pd.read_csv(csv, dtype={'tract_id': str})
    out = normalize_evictions_df(df)
    assert list(out['id']) == ['400100', '400200']

def test_normalize_short_id():
    csv = StringIO("tract_id,eviction_filings\n400100,10\n400200,5\n")
    df = pd.read_csv(csv, dtype={'tract_id': str})
    out = normalize_evictions_df(df)
    assert list(out['id']) == ['400100', '400200']

def test_compute_rate_per_1000_rh():
    df = pd.DataFrame({'id': ['400100'], 'eviction_filings': [10]})
    rh = pd.DataFrame({'id': ['400100'], 'renter_households_total': [500]})
    out = compute_eviction_rate(df, rh)
    assert out['eviction_rate'].iloc[0] == pytest.approx(20.0)  # 10/500 * 1000

def test_compute_rate_zero_renters_safe():
    df = pd.DataFrame({'id': ['400100'], 'eviction_filings': [10]})
    rh = pd.DataFrame({'id': ['400100'], 'renter_households_total': [0]})
    out = compute_eviction_rate(df, rh)
    assert out['eviction_rate'].iloc[0] == 0
