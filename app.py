import streamlit as st
import pandas as pd
import geopandas as gpd
import gspread
import google.auth
from streamlit_folium import st_folium
import re

# ==========================================
# 1. APP CONFIG & STYLING
# ==========================================
st.set_page_config(page_title="TANC Class Composition", layout="wide")

st.title("🏘️ TANC Class Composition Dashboard")
st.markdown("""
    **Objective:** Visualize class composition and demographic data for TANC Locals.
    *Data Source: American Community Survey (Census), TANC Internal Sheets, and Rent Adjustment Program (RAP).*
""")

# ==========================================
# 2. CACHED DATA LOADING FUNCTIONS
# ==========================================

@st.cache_resource
def get_google_sheet_client():
    """Authenticates with Google using local Application Default Credentials."""
    # Ensure you run `gcloud auth application-default login` in terminal first
    creds, _ = google.auth.default()
    gc = gspread.authorize(creds)
    return gc

@st.cache_data(ttl=600)
def load_sheet_data(sheet_name_or_key):
    """Loads a Google Sheet into a Pandas DataFrame."""
    gc = get_google_sheet_client()
    try:
        try:
            sh = gc.open_by_key(sheet_name_or_key)
        except:
            sh = gc.open(sheet_name_or_key)
            
        worksheet = sh.get_worksheet(0)
        data = worksheet.get_all_records()
        df = pd.DataFrame(data)
        return df
    except Exception as e:
        st.error(f"❌ Error loading sheet '{sheet_name_or_key}': {e}")
        return pd.DataFrame()

@st.cache_data
def load_shapefile():
    """Downloads and caches the 2023 California Census Tracts."""
    url = "https://www2.census.gov/geo/tiger/TIGER2023/TRACT/tl_2023_06_tract.zip"
    try:
        gdf = gpd.read_file(url)
        # Filter for Alameda County (001)
        gdf = gdf[gdf['COUNTYFP'] == '001'].copy()
        # Create Match_ID (last 6 digits of GEOID)
        gdf['Match_ID'] = gdf['GEOID'].str[-6:]
        return gdf
    except Exception as e:
        st.error(f"❌ Error downloading shapefiles: {e}")
        return gpd.GeoDataFrame()

@st.cache_data
def load_rap_data():
    """Loads the Rent Registry CSV from the local folder."""
    csv_file = "rent_registry.csv"  # MAKE SURE THIS FILE EXISTS LOCALLY
    try:
        df = pd.read_csv(csv_file)
        
        # 1. Clean column headers (remove whitespace)
        df.columns = [c.strip() for c in df.columns]
        
        # 2. Calculate Portfolio Size (Units per Owner)
        # Check for likely column names for Owner
        owner_col = next((col for col in ['Owner Name', 'Owner', 'Landlord'] if col in df.columns), None)
        
        if owner_col:
            # Count how many times each owner appears
            portfolio_counts = df[owner_col].value_counts()
            df['Portfolio Size'] = df[owner_col].map(portfolio_counts)
            df['Standardized_Owner'] = df[owner_col] # Keep a reference
        else:
            st.warning("⚠️ Could not find an 'Owner Name' column in rent_registry.csv")
            df['Portfolio Size'] = 1
            df['Standardized_Owner'] = "Unknown"

        return df
    except FileNotFoundError:
        # Pass silently here, we handle the empty check in the UI
        return pd.DataFrame()
    except Exception as e:
        st.error(f"❌ Error loading {csv_file}: {e}")
        return pd.DataFrame()

def clean_tract_id(value):
    """Standardizes Census Tract IDs to 6-digit strings."""
    if pd.isna(value) or value == '': return None
    s = str(value)
    nums = re.findall(r"(\d+\.?\d*)", s)
    if not nums: return None
    raw_num = float(nums[0])
    
    if raw_num < 10000:
        clean_num = int(raw_num * 100)
    else:
        clean_num = int(raw_num)
    return str(clean_num).zfill(6)

# ==========================================
# 3. MAIN DATA PIPELINE
# ==========================================

with st.spinner("Loading Data..."):
    # A. Load Sheets
    df_locals = load_sheet_data("Alameda County - Census Tracts x TANC locals")
    df_demo = load_sheet_data("Oakland Demographic Data Messy (Updated 11-24)")
    
    # B. Load Shapes
    gdf_shapes = load_shapefile()
    
    # C. Load Rent Registry
    df_rap = load_rap_data()

# Validation: Check if critical map data exists
if df_locals.empty or df_demo.empty or gdf_shapes.empty:
    st.warning("⚠️ Waiting for data connection. Ensure you are authenticated via 'gcloud auth application-default login'")
    st.stop()

# D. Processing & Merging for Map
df_locals['Match_ID'] = df_locals['Census Tract'].apply(clean_tract_id).astype(str)
if 'Label (Grouping)' in df_demo.columns:
    df_demo['Match_ID'] = df_demo['Label (Grouping)'].apply(clean_tract_id).astype(str)

# Clean Numeric Columns
cols_to_fix = ['Total', 'White', 'Black', 'Asian', 'Hispanic']
for col in cols_to_fix:
    if col in df_demo.columns:
        df_demo[col] = pd.to_numeric(
            df_demo[col].astype(str).str.replace(',', '', regex=True),
            errors='coerce'
        ).fillna(0)

# Merge
merged_gdf = gdf_shapes.merge(df_locals[['Match_ID', 'TANC Local']], on='Match_ID', how='inner')
full_data = merged_gdf.merge(df_demo, on='Match_ID', how='left')

# Dissolve by Local
local_stats = full_data.dissolve(by='TANC Local', aggfunc='sum').reset_index()

# Calculate %
for col in ['Black', 'White', 'Asian', 'Hispanic']:
    if col in local_stats.columns:
        local_stats[f'% {col}'] = (local_stats[col] / local_stats['Total'].replace(0, 1) * 100).round(1)

# ==========================================
# 4. INTERFACE
# ==========================================

tab_map, tab_inspector, tab_search = st.tabs(["🗺️ Map Explorer", "🔍 Local Inspector", "🕵️ Know Your Landlord"])

# --- TAB 1: MAP EXPLORER ---
with tab_map:
    col1, col2 = st.columns([1, 3])
    
    with col1:
        metric = st.selectbox(
            "Select Demographic Layer:",
            ['% Black', '% White', '% Asian', '% Hispanic']
        )
        st.info("Hover over the map to see population totals for each TANC Local.")

    with col2:
        cmaps = {'% Black': 'Reds', '% White': 'Blues', '% Asian': 'Greens', '% Hispanic': 'Oranges'}
        
        m = local_stats.explore(
            column=metric,
            cmap=cmaps.get(metric, 'Purples'),
            tooltip=['TANC Local', 'Total', metric],
            tiles='CartoDB positron',
            style_kwds={'fillOpacity': 0.7, 'weight': 1},
            legend_kwds={'caption': f'{metric} by Local'}
        )
        st_folium(m, use_container_width=True, height=500)

# --- TAB 2: LOCAL INSPECTOR ---
with tab_inspector:
    col_sel, col_stats = st.columns([1, 2])
    
    with col_sel:
        selected_local = st.selectbox("Select a TANC Local:", sorted(local_stats['TANC Local'].unique()))
        row = local_stats[local_stats['TANC Local'] == selected_local].iloc[0]
        st.divider()
        st.metric("Total Population", f"{int(row['Total']):,}")

    with col_stats:
        st.subheader(f"Demographics for {selected_local}")
        chart_data = pd.DataFrame({
            'Demographic': ['Black', 'White', 'Asian', 'Hispanic'],
            'Population': [row['Black'], row['White'], row['Asian'], row.get('Hispanic', 0)],
            'Color': ['#d32f2f', '#1976d2', '#388e3c', '#f57c00']
        })
        st.bar_chart(chart_data, x="Demographic", y="Population", color="Color", use_container_width=True)

# --- TAB 3: KNOW YOUR LANDLORD ---
with tab_search:
    st.header("Search the Rent Registry")
    st.markdown("Search for an address to find the owner, or search for an owner to see their portfolio size.")

    if df_rap.empty:
        st.warning("⚠️ 'rent_registry.csv' not found or empty. Please add this file to your project folder to enable search.")
    else:
        col_search, col_summary = st.columns([2, 1])
        
        with col_search:
            search_query = st.text_input("Search (Address or Owner Name):", placeholder="e.g. 'Telegraph Ave' or 'Greystar'")
        
        if search_query:
            # Search logic: Checks Address OR Owner Name
            # Note: We use the 'Standardized_Owner' column we created during load
            mask = (
                df_rap.astype(str).apply(lambda x: x.str.contains(search_query, case=False, na=False)).any(axis=1)
            )
            results = df_rap[mask]
            
            st.markdown(f"**Found {len(results)} units matching '{search_query}'**")
            
            # Display readable columns if they exist
            display_cols = [c for c in ['Street Address', 'Address', 'Owner Name', 'Standardized_Owner', 'Portfolio Size', 'Zip Code'] if c in df_rap.columns]
            
            st.dataframe(
                results[display_cols].head(100), # Limit display to 100 rows for speed
                use_container_width=True,
                hide_index=True
            )
            
            # Strategic Analysis Box
            if not results.empty:
                # Grab the owner of the first result as the "primary" subject
                top_owner = results.iloc[0]['Standardized_Owner']
                total_units = results.iloc[0]['Portfolio Size']
                
                with col_summary:
                    st.info(f"🎯 **Target Insight**")
                    st.markdown(f"Top result owner: **{top_owner}**")
                    st.metric("Known Portfolio Size", f"{total_units} Units")
                    
                    if total_units > 20:
                        st.error("🔥 Major Corporate Landlord")
                    elif total_units > 4:
                        st.warning("⚠️ Medium / Professional Landlord")
                    else:
                        st.success("🏠 Small / 'Mom & Pop' Landlord")