import streamlit as st
import pandas as pd
import geopandas as gpd
from streamlit_folium import st_folium
import folium
import plotly.express as px
import warnings

# 1. CONFIGURATION
st.set_page_config(page_title="TANC Class Comp", layout="wide")
warnings.filterwarnings("ignore")

# 2. SESSION STATE
if 'map_center' not in st.session_state:
    st.session_state.map_center = [37.8044, -122.2712] # Default Oakland
if 'map_zoom' not in st.session_state:
    st.session_state.map_zoom = 11
if 'highlight_id' not in st.session_state:
    st.session_state.highlight_id = None
if 'is_zoomed' not in st.session_state:
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

if 'TANC Local' in df.columns:
    all_locals = sorted(list(df['TANC Local'].unique()))
    selected_locals = st.sidebar.multiselect("Filter by Local(s):", all_locals, default=[])
else:
    selected_locals = []

st.sidebar.markdown("---")
st.sidebar.subheader("1. Base Map (Color)")

# Base Metrics
base_metrics = {
    "% Hispanic": ("% Hispanic", "Reds"),
    "% Black": ("% Black", "Oranges"),
    "% Asian": ("% Asian", "Greens"),
    "% White": ("% White", "Blues"),
    "Total Population": ("Total", "Greys"),
    "Rent Burden": ("Rent Burden", "RdPu"),
}
base_opts = [k for k,v in base_metrics.items() if v[0] in df.columns]
base_choice = st.sidebar.selectbox("Select Background:", base_opts)
base_col, base_cmap = base_metrics[base_choice]

st.sidebar.subheader("2. Overlay (Borders)")
st.sidebar.caption("Highlights tracts that meet the condition.")

# Overlay Metrics
overlay_choice = st.sidebar.selectbox("Select Condition:", ["None", "Rent Burden", "Unemployment Rate"])
overlay_threshold = 0
if overlay_choice != "None":
    overlay_threshold = st.sidebar.slider(f"Highlight when {overlay_choice} is > X%", 0, 100, 30)

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
# 6. BIVARIATE MAP (FULL WIDTH)
# =========================================================
st.markdown(f"### 🗺️ Map: {base_choice} + {overlay_choice}")

if base_col in map_data.columns:
    valid_map = map_data[map_data[base_col] > 0]
    if not valid_map.empty:
        
        # 1. ZOOM LOGIC
        if not st.session_state.is_zoomed:
             loc = [37.8044, -122.2712]
             zoom = 11
             if len(selected_locals) > 0: zoom = 12
        else:
             loc = st.session_state.map_center
             zoom = st.session_state.map_zoom

        # 2. HIGHLIGHT FUNCTION (Cyan Selection)
        def style_fn(feature):
            base = {"fillOpacity": 0.7, "weight": 0.3, "color": "#444444"}
            if st.session_state.highlight_id and feature['properties']['Match_ID'] == st.session_state.highlight_id:
                return {"fillOpacity": 0.7, "weight": 4, "color": "#00FFFF"} 
            return base

        # 3. BASE LAYER (Color)
        m = valid_map.explore(
            column=base_col, cmap=base_cmap, scheme="quantiles", k=5,
            tiles="CartoDB positron", tooltip=["TANC Local", "Match_ID", base_col],
            popup=False, style_kwds={"style_function": style_fn},
            location=loc, zoom_start=zoom
        )

        # 4. OVERLAY LAYER (Dashed Borders)
        # This replaces the buggy StripePattern with a robust "Dashed Line" overlay
        if overlay_choice != "None" and overlay_choice in map_data.columns:
            overlay_data = valid_map[valid_map[overlay_choice] > overlay_threshold]
            
            if not overlay_data.empty:
                folium.GeoJson(
                    overlay_data,
                    name=f"High {overlay_choice}",
                    style_function=lambda x: {
                        'color': '#2c3e50',      # Dark Grey Border
                        'weight': 2.5,           # Thicker than normal
                        'dashArray': '5, 5',     # <--- THIS MAKES IT DASHED/HASHED
                        'fillOpacity': 0,        # Transparent fill (See race underneath)
                        'interactive': False
                    },
                    tooltip=f"⚠️ High {overlay_choice} (> {overlay_threshold}%)"
                ).add_to(m)

        st_folium(m, width="stretch", height=600)
    else:
        st.warning("No data.")

# =========================================================
# 7. DEMOGRAPHICS (HORIZONTAL BAR)
# =========================================================
st.markdown("### 👥 Demographics Breakdown")

avail = [c for c in ["Black", "White", "Asian", "Hispanic"] if c in local_data.columns]
if avail:
    c_data = local_data[avail].sum().reset_index()
    c_data.columns = ["Group", "Count"]
    
    colors = ["#d3d3d3"]*len(c_data)
    for i,g in enumerate(c_data["Group"]):
        if g in base_choice: colors[i] = {"Black":"#ff7f0e","White":"#1f77b4","Asian":"#2ca02c","Hispanic":"#d62728"}.get(g,"red")
    
    fig = px.bar(c_data, x="Count", y="Group", orientation='h', text_auto='.2s')
    fig.update_traces(marker_color=colors)
    fig.update_layout(height=300, margin=dict(l=0, r=0, t=0, b=0))
    st.plotly_chart(fig, width="stretch")

# =========================================================
# 8. DEEP DIVE
# =========================================================
st.markdown("---")
st.header("📊 Correlation Analysis")
with st.expander("ℹ️ How to read this (Click to Open)", expanded=True):
    st.markdown("**Steep Line UP ↗️** = That group faces significantly higher rent burdens.")

d1, d2 = st.columns(2)

def handle_click(event):
    if event.selection and len(event.selection.points) > 0:
        point = event.selection.points[0]
        c_data = point.get('custom_data') if isinstance(point, dict) else getattr(point, 'custom_data', None)
        
        if c_data:
            clicked_id = str(c_data[0]).split('.')[0].zfill(6)[-6:]
            if clicked_id != st.session_state.highlight_id:
                target_shape = map_data[map_data["Match_ID"] == clicked_id]
                if not target_shape.empty:
                    centroid = target_shape.geometry.centroid.iloc[0]
                    st.session_state.map_center = [centroid.y, centroid.x]
                    st.session_state.map_zoom = 14
                    st.session_state.highlight_id = clicked_id
                    st.session_state.is_zoomed = True
                    st.rerun()

with d1:
    race = st.selectbox("Race vs Rent Burden:", ["% Hispanic", "% Black", "% Asian", "% White"])
    if race in local_data.columns and "Rent Burden" in local_data.columns:
        clean_plot = local_data.dropna(subset=[race, "Rent Burden"])
        fig = px.scatter(
            clean_plot, x=race, y="Rent Burden", 
            trendline="ols" if len(clean_plot) > 2 else None, 
            color="TANC Local", hover_name="Match_ID",
            title=f"{race} vs Rent", custom_data=["Match_ID"]
        )
        event = st.plotly_chart(fig, width="stretch", on_select="rerun", selection_mode="points")
        handle_click(event)

with d2:
    lang_choice = st.selectbox("Language vs Unemployment:", ["% Spanish LE", "% Asian LE"])
    if "Unemployment Rate" in local_data.columns and lang_choice in local_data.columns:
        clean_plot = local_data.dropna(subset=[lang_choice, "Unemployment Rate"])
        fig = px.scatter(
            clean_plot, x=lang_choice, y="Unemployment Rate", 
            trendline="ols" if len(clean_plot) > 2 else None,
            color="TANC Local", hover_name="Match_ID",
            title=f"Language vs Jobs", custom_data=["Match_ID"]
        )
        event = st.plotly_chart(fig, width="stretch", on_select="rerun", selection_mode="points")
        handle_click(event)

# =========================================================
# 9. TARGET TABLE
# =========================================================
st.markdown("---")
st.header("🔥 High-Priority Targets")
st.caption("Neighborhoods with >35% Rent Burden and >500 people.")

if "Rent Burden" in local_data.columns:
    crisis_data = local_data[
        (local_data["Rent Burden"] > 35) & 
        (local_data["Total"] > 500)
    ].sort_values(by="Rent Burden", ascending=False)

    if not crisis_data.empty:
        show_cols = ["TANC Local", "Match_ID", "Rent Burden", "% Black", "% Hispanic", "% Asian LE", "Unemployment Rate"]
        final_cols = [c for c in show_cols if c in crisis_data.columns]

        event = st.dataframe(
            crisis_data[final_cols].style.background_gradient(subset=["Rent Burden"], cmap="Reds"),
            width="stretch",
            hide_index=True,
            on_select="rerun",
            selection_mode="single-row"
        )
        
        if len(event.selection.rows) > 0:
            idx = event.selection.rows[0]
            selected_id = str(crisis_data.iloc[idx]["Match_ID"])
            if selected_id != st.session_state.highlight_id:
                target_shape = map_data[map_data["Match_ID"] == selected_id]
                if not target_shape.empty:
                    centroid = target_shape.geometry.centroid.iloc[0]
                    st.session_state.map_center = [centroid.y, centroid.x]
                    st.session_state.map_zoom = 15
                    st.session_state.highlight_id = selected_id
                    st.session_state.is_zoomed = True
                    st.rerun()