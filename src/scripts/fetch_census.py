import pandas as pd
from census import Census
import config

def fetch_and_clean_data():
    print(f"📡 Connecting to Census API (State: {config.STATE_FIPS}, County: {config.COUNTY_FIPS})...")
    
    c = Census(config.API_KEY)
    
    # 1. Query the API
    raw_data = c.acs5.state_county_tract(
        list(config.CENSUS_FIELDS.keys()), 
        config.STATE_FIPS, 
        config.COUNTY_FIPS, 
        Census.ALL
    )
    
    df = pd.DataFrame(raw_data)
    
    # 2. Rename Columns
    df = df.rename(columns=config.CENSUS_FIELDS)
    
    # 3. Create ID Match Column (State+County+Tract)
    # API returns tract as "400100". We generally need 6 digits "400100" or full GEOID.
    # Let's standardize on the 6-digit Tract ID for merging.
    df['id'] = df['tract'].astype(str).str.zfill(6)
    
    print(f"   Fetched {len(df)} tracts. Calculating derived metrics...")

    # 4. Calculate Percentages & Metrics
    
    # Demographics %
    df['pct_white'] = (df['pop_white_non_hisp'] / df['total_pop'] * 100).round(1)
    df['pct_black'] = (df['pop_black'] / df['total_pop'] * 100).round(1)
    df['pct_asian'] = (df['pop_asian'] / df['total_pop'] * 100).round(1)
    df['pct_hispanic'] = (df['pop_hispanic'] / df['total_pop'] * 100).round(1)
    
    # Unemployment Rate = Unemployed / Labor Force
    df['unemployment'] = (df['unemployed'] / df['labor_force'] * 100).round(1).fillna(0)
    
    # Poverty Rate
    df['poverty_rate'] = (df['pop_poverty'] / df['pop_poverty_total'] * 100).round(1).fillna(0)
    
    # Vacancy Rate
    df['vacancy_rate'] = (df['housing_units_vacant'] / df['housing_units_total'] * 100).round(1).fillna(0)
    
    # Rent Burden (>30% of Income)
    burdened_count = (
        df['burden_30_35'] + 
        df['burden_35_40'] + 
        df['burden_40_50'] + 
        df['burden_50_plus']
    )
    df['rent_burden'] = (burdened_count / df['renter_households_total'] * 100).round(1).fillna(0)

    # 5. Export
    output_file = "census_fresh_data.csv"
    df.to_csv(output_file, index=False)
    print(f"✅ Saved fresh Census data to {output_file}")

if __name__ == "__main__":
    fetch_and_clean_data()