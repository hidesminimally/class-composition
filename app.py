import streamlit as st
import pandas as pd
import geopandas as gpd
from streamlit_folium import st_folium
import plotly.express as px

# 1. CONFIGURATION (Must be the very first command)
st.set_page_config(page_title="TANC Class Comp", layout="wide")

# 2. LOAD DATA
@st.cache_data
def load_data():
    # These files must be in the same folder as app.py
    df = pd.read_csv("tanc_data_clean.csv")
    gdf = gpd.read_file("tanc_map_data.geojson")
    return df, gdf

try:
    df, gdf = load_data()
except Exception as e:
    st.error(f"⚠️ Error loading files. Did you upload 'tanc_data_clean.csv' and 'tanc_map_data.geojson'? Error: {e}")
    st.stop()

# 3. DEBUGGING (Now safe to run because df exists)
# This will show you the exact column names on the screen so we stop guessing.
st.write("✅ Available Columns:", df.columns.tolist())

# 4. SIDEBAR CONTROLS
st.sidebar.title("TANC Dashboard")

# Check if 'TANC Local' exists before using it
if 'TANC Local' in df.columns:
    local_options = ["All"] + sorted(list(df['TANC Local'].unique()))
    selected_local = st.sidebar.selectbox("Filter by Local", options=local_options)
else:
    selected_local = "All"
    st.sidebar.warning("Column 'TANC Local' not found. Showing all data.")

# 5. FILTER DATA
if selected_local != "All":
    local_data = df[df['TANC Local'] == selected_local]
    map_data = gdf[gdf['TANC Local'] == selected_local]
else:
    local_data = df
    map_data = gdf

# 6. MAIN CONTENT
st.title(f"Composition: {selected_local}")

# TOP METRICS (Safe Mode)
col1, col2, col3 = st.columns(3)

# We check if columns exist before displaying them to prevent crashes
if 'Total' in local_data.columns:
    col1.metric("Total Population", f"{local_data['Total'].sum():,}")
else:
    col1.metric("Total Population", "N/A")

if 'Rent Burden' in local_data.columns:
    col2.metric("Rent Burden", f"{local_data['Rent Burden'].mean():.1f}%")

if 'Evictions' in local_data.columns:
    col3.metric("Evictions", f"{local_data['Evictions'].sum():,}")

# MAP & CHARTS
c_map, c_chart = st.columns([2, 1])

with c_map:
    st.subheader("Map View")
    # We default to 'Total' since we know it exists. 
    # If you want to map something else, change "Total" to a name from the list printed at the top of the app.
    map_col = "Total" 
    
    if map_col in map_data.columns:
        m = map_data.explore(column=map_col, cmap="Blues", tiles="CartoDB positron")
        st_folium(m, use_container_width=True, height=500)
    else:
        st.warning(f"Cannot map column '{map_col}' because it doesn't exist.")

with c_chart:
    st.subheader("Demographics")
    # Quick bar chart of race/class if columns exist
    race_cols = ['Black', 'White', 'Asian', 'Hispanic']
    existing_race_cols = [c for c in race_cols if c in local_data.columns]
    
    if existing_race_cols:
        long_data = local_data.melt(value_vars=existing_race_cols, var_name="Group", value_name="Count")
        fig = px.bar(long_data, x="Group", y="Count", title="Population by Group")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Demographic columns (Black, White, Asian) not found.")