import streamlit as st
import pandas as pd
import geopandas as gpd
from streamlit_folium import st_folium
import plotly.express as px

# 1. CONFIGURATION
st.set_page_config(page_title="TANC Class Comp", layout="wide")

# 2. SESSION STATE
if 'map_center' not in st.session_state:
    st.session_state.map_center = [37.8044, -122.2712]
    st.session_state.map_zoom = 11
    st.session_state.highlight_id = None

# 3. LOAD DATA
@st.cache_data
def load_data():
    df = pd.read_csv("tanc_data_clean.csv")
    gdf = gpd.read_file("tanc_map_data.geojson")
    
    # Clean IDs
    def clean_id(x): return str(x).split('.')[0].zfill(6)[-6:]
    df['Match_ID'] = df['Match_ID'].apply(clean_id)
    map_id_col = 'GEOID' if 'GEOID' in gdf.columns else 'Match_ID'
    if map_id_col in gdf.columns: gdf['Match_ID'] = gdf[map_id_col].apply(clean_id)
    
    # Pre-Calc Variables
    for race in ["Black", "White", "Asian", "Hispanic"]: 
        if race in df.columns and "Total" in df.columns:
            df[f"% {race}"] = (df[race]/df["Total"].replace(0,1)*100).round(1)
            
    if "C16002_004E" in df.columns: 
        df["% Spanish LE"] = (df["C16002_004E"]/df["C16002_001E"].replace(0,1)*100).round(1)
    if "C16002_007E" in df.columns: 
        df["% Asian LE"] = (df["C16002_007E"]/df["C16002_001E"].replace(0,1)*100).round(1)
    
    full_map = gdf.merge(df, on='Match_ID', how='inner', suffixes=('', '_y'))
    return df, full_map

try:
    df, gdf = load_data()
except Exception as e:
    st.error(f"⚠️ Data Error: {e}"); st.stop()

# =========================================================
# 4. SIDEBAR
# =========================================================
st.sidebar.title("TANC Dashboard")

if 'TANC Local' in df.columns:
    local_opts = ["All"] + sorted(list(df['TANC Local'].unique()))
    selected_local = st.sidebar.selectbox("Filter by Local", local_opts)
else:
    selected_local = "All"

st.sidebar.markdown("---")
st.sidebar.subheader("Map Layer")
metrics = {
    "Total Population": ("Total", "Greys"),
    "% Black": ("% Black", "Oranges"),
    "% Hispanic": ("% Hispanic", "Reds"),
    "% Asian": ("% Asian", "Greens"),
    "% White": ("% White", "Blues"),
    "Rent Burden": ("Rent Burden", "RdPu"),
    "Unemployment Rate": ("Unemployment Rate", "YlOrRd"),
    "% Spanish LE (Isolation)": ("% Spanish LE", "YlGn"),
    "% Asian LE (Isolation)": ("% Asian LE", "PuBuGn"),
}
opts = [k for k,v in metrics.items() if v[0] in df.columns]
target_choice = st.sidebar.radio("Select Layer:", opts)
target_col, target_cmap = metrics[target_choice]

if selected_local != "All":
    local_data = df[df['TANC Local'] == selected_local]
    map_data = gdf[gdf['TANC Local'] == selected_local]
else:
    local_data = df
    map_data = gdf

# =========================================================
# 5. MAIN DASHBOARD
# =========================================================
st.title(f"Composition: {selected_local}")

# METRICS
c1, c2, c3 = st.columns(3)
c1.metric("Total Population", f"{local_data['Total'].sum():,}" if 'Total' in local_data.columns else "N/A")
c2.metric("Avg Rent Burden", f"{local_data['Rent Burden'].mean():.1f}%" if 'Rent Burden' in local_data.columns else "N/A")
c3.metric("Avg Unemployment", f"{local_data['Unemployment Rate'].mean():.1f}%" if 'Unemployment Rate' in local_data.columns else "N/A")

# MAP & CHARTS
c_map, c_chart = st.columns([2, 1])

with c_map:
    st.subheader(f"Map: {target_choice}")
    if target_col in map_data.columns:
        valid_map = map_data[map_data[target_col] > 0]
        if not valid_map.empty:
            
            def style_fn(feature):
                base = {"fillOpacity": 0.7, "weight": 0.3, "color": "#444444"}
                if st.session_state.highlight_id and feature['properties']['Match_ID'] == st.session_state.highlight_id:
                    return {"fillOpacity": 0.7, "weight": 5, "color": "#00FFFF"} 
                return base

            m = valid_map.explore(
                column=target_col, cmap=ta
                