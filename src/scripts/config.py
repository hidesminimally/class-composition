# config.py

# Your Census API Key
API_KEY = "86d28ac62e6526228b62f359112b8687642a72da"

# Target Geography
STATE_FIPS = "06"  # California
COUNTY_FIPS = "001" # Alameda County

# Census Variables Map (ACS 5-Year)
CENSUS_FIELDS = {
    'B01003_001E': 'total_pop',
    
    # Race / Ethnicity
    'B03002_003E': 'pop_white_non_hisp',
    'B03002_004E': 'pop_black',
    'B03002_006E': 'pop_asian',
    'B03002_012E': 'pop_hispanic',
    
    # Economics
    'B19013_001E': 'median_hh_income',
    'B17001_002E': 'pop_poverty', # Count below poverty level
    'B17001_001E': 'pop_poverty_total', # Universe for poverty
    
    # Employment (Civilian Labor Force)
    'B23025_003E': 'labor_force',
    'B23025_005E': 'unemployed',
    
    # Housing & Rent
    'B25064_001E': 'median_gross_rent',
    'B25001_001E': 'housing_units_total',
    'B25002_003E': 'housing_units_vacant',
    'B25035_001E': 'median_year_built',
    
    # Rent Burden (Gross Rent as % of Income)
    'B25070_001E': 'renter_households_total',
    'B25070_007E': 'burden_30_35',
    'B25070_008E': 'burden_35_40',
    'B25070_009E': 'burden_40_50',
    'B25070_010E': 'burden_50_plus',
}