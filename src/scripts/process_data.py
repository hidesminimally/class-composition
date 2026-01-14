import pandas as pd
import geopandas as gpd
import os

# 1. LOAD DATA
if not os.path.exists("tanc_data_clean.csv"):
    print("❌ Error: tanc_data_clean.csv not found.")
    exit()

df = pd.read_csv("tanc_data_clean.csv", dtype={'Match_ID': str}) 
gdf = gpd.read_file("tanc_map_data.geojson")

# 2. SMART ID CLEANER
def clean_id(x):
    s = str(x).strip()
    if s.endswith('.0'): s = s[:-2]
    if '.' in s:
        parts = s.split('.')
        return parts[0].zfill(4) + parts[1].ljust(2, '0')
    if len(s) == 4: return s + "00"
    return s.zfill(6)[-6:]

df['Match_ID'] = df['Match_ID'].apply(clean_id)

# --- NEW: CLEAN LOCAL NAMES ---
# This removes invisible spaces that break filters
if 'TANC Local' in df.columns:
    df['TANC Local'] = df['TANC Local'].str.strip()
    print(f"ℹ️ Found Locals: {df['TANC Local'].unique()}")

# 3. FIND MAP ID
possible_cols = ['GEOID', 'Match_ID', 'geoid', 'AFFGEOID', 'id']
map_id_col = next((c for c in possible_cols if c in gdf.columns), None)

if not map_id_col:
    print(f"❌ Error: No ID column found in map. Available: {list(gdf.columns)}")
    exit()

gdf['Match_ID'] = gdf[map_id_col].apply(lambda x: str(x)[-6:])

# 4. METRICS & RENAME
for race in ["Black", "White", "Asian", "Hispanic"]: 
    if race in df.columns and "Total" in df.columns:
        df[f"pct_{race.lower()}"] = (df[race]/df["Total"].replace(0,1)*100).round(1)

df.rename(columns={
    "Rent Burden": "rent_burden",
    "Unemployment Rate": "unemployment",
    "Total": "total_pop",
    "TANC Local": "tanc_local",
    "Match_ID": "id"
}, inplace=True)

# 5. MERGE & EXPORT
final_map = gdf.merge(df, left_on='Match_ID', right_on='id', how='inner')
output_path = "public/data.geojson"
final_map.to_file(output_path, driver='GeoJSON')
print(f"✅ Success! Map saved with {len(final_map)} tracts.")