import streamlit as st
import pandas as pd
import geopandas as gpd
from streamlit_folium import st_folium
import plotly.express as px

# 1. CONFIGURATION
st.set_page_config(page_title="TANC Class Comp", layout="wide")

# 2. INITIALIZE SESSION STATE (Stores the Zoom Level)
if 'map_center' not in st.session_state:
    st.session_state.map_center = [37.8044, -122.2712]
    st.session_state.map_zoom = 11
    st.session_state.highlight_id = None

# 3. LOAD DATA
@st.cache_data
def load_data():
    df = pd.read_csv("tanc_data_clean.csv")
    gdf = gpd.read_file("tanc_map_data.geojson")
    
    # ID Cleaning to ensure matches
    def clean_id(x): return str(x).split('.')[0].zfill(6)[-6:]
    df['Match_ID'] = df['Match_ID'].apply(clean_id)
    map_id_col = 'GEOID' if 'GEOID' in gdf.columns else 'Match_ID'
    if map_id_col in gdf.columns: gdf['Match_ID'] = gdf[map_id_col].apply(clean_id)
    
    # Pre-Calc Percentages for Table
    def calc(d, n, col): 
        if n in d.columns and "Total" in d.columns: 
            d[col] = (d[n]/d["Total"].replace(0,1)*100).round(1)
            
    for race in ["Black", "White", "Asian", "Hispanic"]: calc(df, race, f"% {race}")
    if "C16002_004E" in df.columns: df["% Spanish LE"] = (df["C16002_004E"]/df["C16002_001E"].replace(0,1)*100).round(1)
    
    full_map = gdf.merge(df, on='Match_ID', how='inner', suffixes=('', '_y'))
    return df, full_map

try:
    df, gdf = load_data()
except Exception as e:
    st.error(f"⚠️ Data Error: {e}"); st.stop()

# =========================================================
# 4. SIDEBAR (FILTERS ONLY)
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
    "% Spanish Limited English": ("% Spanish LE", "YlGn"),
}
opts = [k for k,v in metrics.items() if v[0] in df.columns]
target_choice = st.sidebar.radio("Select Layer:", opts)
target_col, target_cmap = metrics[target_choice]

# Filter Data
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

# A. METRICS
c1, c2, c3 = st.columns(3)
c1.metric("Total Population", f"{local_data['Total'].sum():,}" if 'Total' in local_data.columns else "N/A")
c2.metric("Avg Rent Burden", f"{local_data['Rent Burden'].mean():.1f}%" if 'Rent Burden' in local_data.columns else "N/A")
unemp = f"{local_data['Unemployment Rate'].mean():.1f}%" if 'Unemployment Rate' in local_data.columns else "N/A"
c3.metric("Unemployment", unemp)

# B. MAP & CHARTS
c_map, c_chart = st.columns([2, 1])

with c_map:
    st.subheader(f"Map: {target_choice}")
    if target_col in map_data.columns:
        valid_map = map_data[map_data[target_col] > 0]
        if not valid_map.empty:
            # Highlight Function
            def style_fn(feature):
                base = {"fillOpacity": 0.7, "weight": 0.3, "color": "#444444"}
                if st.session_state.highlight_id and feature['properties']['Match_ID'] == st.session_state.highlight_id:
                    return {"fillOpacity": 0.7, "weight": 4, "color": "cyan"} # Bright Cyan Selection
                return base

            m = valid_map.explore(
                column=target_col, cmap=target_cmap, scheme="quantiles", k=5,
                tiles="CartoDB positron", tooltip=["TANC Local", "Match_ID", target_col],
                popup=False, style_kwds={"style_function": style_fn},
                location=st.session_state.map_center, zoom_start=st.session_state.map_zoom
            )
            st_folium(m, use_container_width=True, height=500)
        else:
            st.warning("No data.")

with c_chart:
    st.subheader("Demographics")
    avail = [c for c in ["Black", "White", "Asian", "Hispanic"] if c in local_data.columns]
    if avail:
        c_data = local_data[avail].sum().reset_index()
        c_data.columns = ["Group", "Count"]
        colors = ["#d3d3d3"]*len(c_data)
        for i,g in enumerate(c_data["Group"]):
            if g in target_choice: colors[i] = {"Black":"#ff7f0e","White":"#1f77b4","Asian":"#2ca02c","Hispanic":"#d62728"}.get(g,"red")
        
        fig = px.bar(c_data, x="Group", y="Count", text_auto='.2s')
        fig.update_traces(marker_color=colors)
        st.plotly_chart(fig, use_container_width=True)

# =========================================================
# 6. THE TARGET LIST (MAIN AREA - WIDE)
# =========================================================
st.markdown("---")
st.header("🔥 Priority Targets (High Burden)")
st.write("👈 Click a row to zoom the map to that Census Tract.")

if "Rent Burden" in local_data.columns:
    # Filter for crisis zones
    crisis_data = local_data[
        (local_data["Rent Burden"] > 35) & 
        (local_data["Total"] > 500)
    ].sort_values(by="Rent Burden", ascending=False)

    if not crisis_data.empty:
        # Columns to display
        show_cols = ["TANC Local", "Match_ID", "Rent Burden", "% Black", "% Hispanic", "% Spanish LE", "Unemployment Rate"]
        final_cols = [c for c in show_cols if c in crisis_data.columns]

        # The Interactive Table
        event = st.dataframe(
            crisis_data[final_cols].style.background_gradient(subset=["Rent Burden"], cmap="Reds"),
            use_container_width=True,
            hide_index=True,
            on_select="rerun",  # Triggers script re-run
            selection_mode="single-row"
        )

        # HANDLE CLICK (Updates Zoom)
        if len(event.selection.rows) > 0:
            idx = event.selection.rows[0]
            selected_id = str(crisis_data.iloc[idx]["Match_ID"])
            
            # Only update/rerun if we clicked a NEW row
            if selected_id != st.session_state.highlight_id:
                target_shape = map_data[map_data["Match_ID"] == selected_id]
                if not target_shape.empty:
                    centroid = target_shape.geometry.centroid.iloc[0]
                    st.session_state.map_center = [centroid.y, centroid.x]
                    st.session_state.map_zoom = 14
                    st.session_state.highlight_id = selected_id
                    st.rerun() # <--- FORCE RE-RUN TO UPDATE MAP IMMEDIATELY

# =========================================================
# 7. INTERSECTIONALITY (BOTTOM)
# =========================================================
st.markdown("---")
st.header("📊 Deep Dive")
d1, d2 = st.columns(2)
with d1:
    race = st.selectbox("Compare:", ["% Hispanic", "% Black", "% Asian", "% White"])
    if race in local_data.columns and "Rent Burden" in local_data.columns:
        fig = px.scatter(local_data, x=race, y="Rent Burden", trendline="ols", color="TANC Local", title=f"{race} vs Rent Burden")
        st.plotly_chart(fig, use_container_width=True)
with d2:
    if "Unemployment Rate" in local_data.columns and "% Spanish LE" in local_data.columns:
        fig = px.scatter(local_data, x="% Spanish LE", y="Unemployment Rate", trendline="ols", color="TANC Local", title="Spanish vs Unemployment")
        st.plotly_chart(fig, use_container_width=True)