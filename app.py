import streamlit as st
import pandas as pd
import geopandas as gpd
from streamlit_folium import st_folium
import plotly.express as px
import warnings

# 1. CONFIGURATION
st.set_page_config(page_title="TANC Class Comp", layout="wide")
warnings.filterwarnings("ignore")

# 2. SESSION STATE
# We use a specific flag 'is_zoomed' to know if we should force a zoom or stay wide
if 'map_center' not in st.session_state:
    st.session_state.map_center = [37.8044, -122.2712] # Default Oakland Center
    st.session_state.map_zoom = 12
    st.session_state.highlight_id = None
    st.session_state.is_zoomed = False 

# 3. LOAD DATA
@st.cache_data
def load_data():
    df = pd.read_csv("tanc_data_clean.csv")
    gdf = gpd.read_file("tanc_map_data.geojson")
    
    def clean_id(x): return str(x).split('.')[0].zfill(6)[-6:]
    df['Match_ID'] = df['Match_ID'].apply(clean_id)
    map_id_col = 'GEOID' if 'GEOID' in gdf.columns else 'Match_ID'
    if map_id_col in gdf.columns: gdf['Match_ID'] = gdf[map_id_col].apply(clean_id)
    
    # Pre-Calc Variables
    for race in ["Black", "White", "Asian", "Hispanic"]: 
        if race in df.columns and "Total" in df.columns:
            df[f"% {race}"] = (df[race]/df["Total"].replace(0,1)*100).round(1)
            
    if "C16002_004E" in df.columns: df["% Spanish LE"] = (df["C16002_004E"]/df["C16002_001E"].replace(0,1)*100).round(1)
    if "C16002_007E" in df.columns: df["% Asian LE"] = (df["C16002_007E"]/df["C16002_001E"].replace(0,1)*100).round(1)
    
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

# Filter
if 'TANC Local' in df.columns:
    all_locals = sorted(list(df['TANC Local'].unique()))
    selected_locals = st.sidebar.multiselect("Filter by Local(s):", all_locals, default=[])
else:
    selected_locals = []

st.sidebar.markdown("---")
st.sidebar.subheader("Map Data")

# REORDERED FOR LOGIC
metrics = {
    # 1. CLASS / ECONOMIC (The most important)
    "Rent Burden": ("Rent Burden", "RdPu"),
    "Unemployment Rate": ("Unemployment Rate", "YlOrRd"),
    
    # 2. RACE / DEMOGRAPHICS
    "% Black": ("% Black", "Oranges"),
    "% Hispanic": ("% Hispanic", "Reds"),
    "% Asian": ("% Asian", "Greens"),
    "% White": ("% White", "Blues"),
    
    # 3. LANGUAGE ISOLATION
    "% Spanish LE (Isolation)": ("% Spanish LE", "YlGn"),
    "% Asian LE (Isolation)": ("% Asian LE", "PuBuGn"),
    
    # 4. BASELINE
    "Total Population": ("Total", "Greys"),
}
opts = [k for k,v in metrics.items() if v[0] in df.columns]
target_choice = st.sidebar.radio("Show on Map:", opts)
target_col, target_cmap = metrics[target_choice]

# Data Filtering
if len(selected_locals) > 0:
    local_data = df[df['TANC Local'].isin(selected_locals)]
    map_data = gdf[gdf['TANC Local'].isin(selected_locals)]
    display_title = ", ".join(selected_locals)
else:
    local_data = df
    map_data = gdf
    display_title = "East Bay Overview"

# =========================================================
# 5. HEADER METRICS
# =========================================================
st.title(f"{display_title}")

c1, c2, c3, c4 = st.columns(4)
c1.metric("Population", f"{local_data['Total'].sum():,}" if 'Total' in local_data.columns else "N/A")
c2.metric("Avg Rent Burden", f"{local_data['Rent Burden'].mean():.1f}%" if 'Rent Burden' in local_data.columns else "N/A")
c3.metric("Avg Unemployment", f"{local_data['Unemployment Rate'].mean():.1f}%" if 'Unemployment Rate' in local_data.columns else "N/A")
c4.metric("Tracts", len(local_data))

# =========================================================
# 6. THE BIG MAP (FULL ROW)
# =========================================================
st.markdown("### 🗺️ Territory Map")

if target_col in map_data.columns:
    valid_map = map_data[map_data[target_col] > 0]
    if not valid_map.empty:
        
        def style_fn(feature):
            base = {"fillOpacity": 0.7, "weight": 0.3, "color": "#444444"}
            if st.session_state.highlight_id and feature['properties']['Match_ID'] == st.session_state.highlight_id:
                return {"fillOpacity": 0.7, "weight": 4, "color": "#00FFFF"} 
            return base

        # Determine Zoom
        # If user hasn't clicked anything, just show the bounds of the data
        if not st.session_state.is_zoomed:
             # Default wide view
             loc = [37.8044, -122.2712]
             zoom = 11
             if len(selected_locals) > 0:
                 # If filtered, slightly tighter zoom logic could go here
                 zoom = 12
        else:
             # User clicked something, so use the precise zoom
             loc = st.session_state.map_center
             zoom = st.session_state.map_zoom

        m = valid_map.explore(
            column=target_col, cmap=target_cmap, scheme="quantiles", k=5,
            tiles="CartoDB positron", tooltip=["TANC Local", "Match_ID", target_col],
            popup=False, style_kwds={"style_function": style_fn},
            location=loc, zoom_start=zoom
        )
        st_folium(m, use_container_width=True, height=600) # Made it taller
    else:
        st.warning("No data.")

# =========================================================
# 7. DEMOGRAPHICS (OWN ROW, HORIZONTAL)
# =========================================================
st.markdown("### 👥 Demographics Breakdown")

avail = [c for c in ["Black", "White", "Asian", "Hispanic"] if c in local_data.columns]
if avail:
    c_data = local_data[avail].sum().reset_index()
    c_data.columns = ["Group", "Count"]
    
    # Color logic
    colors = ["#d3d3d3"]*len(c_data)
    for i,g in enumerate(c_data["Group"]):
        if g in target_choice: colors[i] = {"Black":"#ff7f0e","White":"#1f77b4","Asian":"#2ca02c","Hispanic":"#d62728"}.get(g,"red")
    
    # Horizontal Bar Chart is better for this layout
    fig = px.bar(c_data, x="Count", y="Group", orientation='h', text_auto='.2s', title="Total Population by Group")
    fig.update_traces(marker_color=colors)
    fig.update_layout(height=300, margin=dict(l=0, r=0, t=30, b=0))
    st.plotly_chart(fig, use_container_width=True)

# =========================================================
# 8. DEEP DIVE (EXPLAINED)
# =========================================================
st.markdown("---")
st.header("📊 Correlation Analysis")

# Explainer Box
with st.expander("ℹ️ How to read these charts (Click to Open)", expanded=True):
    st.markdown("""
    **Why this matters:** We want to know if specific groups are being targeted by high rents.
    *   **Each dot** is one Census Tract (neighborhood).
    *   **The Line:** If the line goes **UP ↗️**, it means neighborhoods with MORE of that group have HIGHER rent burdens.
    *   **Strategy:** If the line is steep, that group is statistically facing worse conditions.
    """)

d1, d2 = st.columns(2)

def handle_click(event):
    if event.selection and len(event.selection.points) > 0: