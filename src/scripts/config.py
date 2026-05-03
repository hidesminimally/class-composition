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
    'B25010_001E': 'avg_household_size',

    # Length of Residency (Year Householder Moved In)
    'B25026_001E': 'lor_total',          # Universe (occupied housing units)
    'B25026_009E': 'lor_2019_or_later',  # Renters: 2019 or later (label may shift; map by index)
    'B25026_010E': 'lor_2015_2018',
    'B25026_011E': 'lor_2010_2014',
    'B25026_012E': 'lor_2000_2009',
    'B25026_013E': 'lor_1990_1999',
    'B25026_014E': 'lor_1989_or_earlier',

    # Linguistic Composition (Language Spoken at Home, pop 5+)
    'B16001_001E': 'lang_total',
    'B16001_002E': 'lang_english_only',
    'B16001_003E': 'lang_spanish',
    'B16001_006E': 'lang_french',
    'B16001_075E': 'lang_chinese',
    'B16001_087E': 'lang_vietnamese',
    'B16001_069E': 'lang_tagalog',
    'B16001_063E': 'lang_korean',
    
    # Rent Burden (Gross Rent as % of Income)
    'B25070_001E': 'renter_households_total',
    'B25070_007E': 'burden_30_35',
    'B25070_008E': 'burden_35_40',
    'B25070_009E': 'burden_40_50',
    'B25070_010E': 'burden_50_plus',
}

# CPI-U deflator: 2010 → 2020 (BLS CPI-U all-urban, 2010 annual avg → 2020 annual avg)
# 218.056 (2010) → 258.811 (2020)  =>  factor 1.187
CPI_DEFLATOR_2010_TO_2020 = 1.187