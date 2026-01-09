import streamlit as st
import pandas as pd
import geopandas as gpd
from streamlit_folium import st_folium
import plotly.express as px

# 1. CONFIGURATION
st.set_page_config(page_title="TANC Class Comp", layout="wide")

# 2. LOAD DATA
@st.cache_data
def load_data():
    df = pd.read_csv("tanc_data_clean.csv")
    gdf = gpd.read_file("tanc_map_data.geojson")
    
    # --- ID CLEANING (The "Fixer") ---
    # Forces IDs to be simple strings like "409700" (removes .0 decimals)
    def clean_id(x):
        return str(x).split('.')[0].zfill(6)[-6:]

    df['Match_ID'] = df['Match_ID'].apply(clean_id)
    
    # Check for GEOID or similar column in Map
    map_id_col = 'GEOID' if 'GEOID' in gdf.columns else 'Match_ID'
    if map_id_col in gdf.columns:
        gdf['Match_ID'] = gdf[map_id_col].apply(clean_id)
    
    # Merge
    full_map = gdf.merge(df, on='Match_ID', how='inner', suffixes=('', '_y'))
    return df, full_map

try:
    df, gdf = load_data()
except Exception as e:
    st.error(f"⚠️ Error loading files: {e}")
    st.stop()

# =========================================================
# 3. SIDEBAR: CONTROLS & TARGET LIST
# =========================================================
st.sidebar.title("TANC Dashboard")

# --- A. VIEW CONTROLS ---
if 'TANC Local' in df.columns:
    local_options = ["All"] + sorted(list(df['TANC Local'].unique()))
    selected_local = st.sidebar.selectbox("Filter by Local", options=local_options)
else:
    selected_local = "All"

st.sidebar.markdown("---")
st.sidebar.subheader("Map Layer")

metrics_map = {
    "Total Population": ("Total", "Greys"),
    "% Black": ("% Black", "Oranges"),
    "% Hispanic": ("% Hispanic", "Reds"),
    "% Asian": ("% Asian", "Greens"),
    "% White": ("% White", "Blues"),
    "Rent Burden": ("Rent Burden", "RdPu"),
    "Unemployment Rate": ("Unemployment Rate", "YlOrRd"),
    "% Spanish Limited English": ("% Spanish LE", "YlGn"),
}
# Only show valid options
available_opts = [k for k, v in metrics_map.items() if v[0] in df.columns or v[0] in ["% Black", "% Hispanic", "% Asian", "% White"]]
target_choice = st.sidebar.radio("Select Layer:", available_opts)
target_col_name, target_cmap = metrics_map[target_choice]

# --- B. TARGET LIST (Moved here so it works!) ---
st.sidebar.markdown("---")
st.sidebar.header("🔥 Priority Targets")
st.sidebar.write("Click a row to zoom map.")

# Filter Data for current view
if selected_local != "All":
    local_data = df[df['TANC Local'] == selected_local]
    map_data = gdf[gdf['TANC Local'] == selected_local]
else:
    local_data = df
    map_data = gdf

# Logic for Target List
zoom_center = [37.8044, -122.2712] # Default Oakland
zoom_level = 11
highlight_id = None

if "Rent Burden" in local_data.columns:
    crisis_data = local_data[
        (local_data["Rent Burden"] > 40) & 
        (local_data["Total"] > 500)
    ].copy().sort_values(by="Rent Burden", ascending=False)
    
    if not crisis_data.empty:
        # Show mini table in sidebar
        display_cols = ["Match_ID", "Rent Burden", "Median Rent"]
        final_cols = [c for c in display_cols if c in crisis_data.columns]
        
        event = st.sidebar.dataframe(
            crisis_data[final_cols].style.background_gradient(subset=["Rent Burden"], cmap="Reds"),
            use_container_width=True,
            hide_index=True,
            on_select="rerun",
            selection_mode="single-row",
            height=300
        )
        
        # ZOOM LOGIC (Now runs BEFORE the map draws)
        if len(event.selection.rows) > 0:
            idx = event.selection.rows[0]
            selected_id = crisis_data.iloc[idx]["Match_ID"]
            
            # Find shape
            target_shape = map_data[map_data["Match_ID"] == str(selected_id)]
            
            if not target_shape.empty:
                centroid = target_shape.geometry.centroid.iloc[0]
                zoom_center = [centroid.y, centroid.x]
                zoom_level = 14
                highlight_id = str(selected_id)
            else:
                st.sidebar.warning(f"ID {selected_id} found in data but not map.")

# =========================================================
# 4. MAIN CONTENT
# =========================================================
st.title(f"Composition: {selected_local}")

# Metrics
c1, c2, c3 = st.columns(3)
c1.metric("Total Population", f"{local_data['Total'].sum():,}" if 'Total' in local_data.columns else "N/A")
c2.metric("Rent Burden", f"{local_data['Rent Burden'].mean():.1f}%" if 'Rent Burden' in local_data.columns else "N/A")
c3.metric("Evictions", f"{local_data['Evictions'].sum():,}" if 'Evictions' in local_data.columns else "N/A")

# Map & Chart
c_map, c_chart = st.columns([2, 1])

with c_map:
    st.subheader(f"Map: {target_choice}")
    
    # Data Prep
    valid_map_data = map_data.copy()
    plot_col = target_col_name
    
    # Auto-Calc Percentages
    def calc_pct(df, n, d, name):
        if n in df.columns and d in df.columns:
            df[name] = (df[n] / df[d].replace(0, 1) * 100).round(1)
            return name
        return None

    if target_choice == "% Black": plot_col = calc_pct(valid_map_data, "Black", "Total", "Pct_Black")
    elif target_choice == "% White": plot_col = calc_pct(valid_map_data, "White", "Total", "Pct_White")
    elif target_choice == "% Asian": plot_col = calc_pct(valid_map_data, "Asian", "Total", "Pct_Asian")
    elif target_choice == "% Hispanic": plot_col = calc_pct(valid_map_data, "Hispanic", "Total", "Pct_Hisp")
    
    # Render
    if plot_col in valid_map_data.columns:
        valid_map_data = valid_map_data[valid_map_data[plot_col] > 0]
        if not valid_map_data.empty:
            
            # Highlight Logic
            def style_fn(feature):
                base = {"fillOpacity": 0.7, "weight": 0.3, "color": "#444444"}
                if highlight_id and feature['properties']['Match_ID'] == highlight_id:
                    return {"fillOpacity": 0.7, "weight": 4, "color": "cyan"} # Bright Cyan Border
                return base

            m = valid_map_data.explore(
                column=plot_col,
                cmap=target_cmap,
                scheme="quantiles", 
                k=5,
                tiles="CartoDB positron",
                tooltip=["TANC Local", "Total", plot_col],
                popup=False,
                style_kwds={"style_function": style_fn},
                location=zoom_center,  # <--- ZOOM HAPPENS HERE
                zoom_start=zoom_level
            )
            st_folium(m, use_container_width=True, height=500)
        else:
            st.warning("No data visible.")
    else:
        st.warning(f"Column {plot_col} missing.")

with c_chart:
    st.subheader("Demographics")
    desired = ["Black", "White", "Asian", "Hispanic"]
    avail = [c for c in desired if c in local_data.columns]
    if avail:
        chart_data = local_data[avail].sum().reset_index()
        chart_data.columns = ["Group", "Count"]
        
        colors = ["#d3d3d3"] * len(chart_data)
        for i, g in enumerate(chart_data["Group"]):
            if g in target_choice: 
                colors[i] = {"Black":"#ff7f0e", "White":"#1f77b4", "Asian":"#2ca02c", "Hispanic":"#d62728"}.get(g, "red")
        
        fig = px.bar(chart_data, x="Group", y="Count", text_auto='.2s')
        fig.update_traces(marker_color=colors)
        st.plotly_chart(fig, use_container_width=True)

# Intersectionality Section (Bottom)
st.markdown("---")
st.header("📊 Deep Dive: Race vs. Rent")
c_deep1, c_deep2 = st.columns(2)
with c_deep1:
    race_comp = st.selectbox("Compare:", ["% Hispanic", "% Black", "% Asian", "% White"])
    race_col = race_comp.replace("% ", "")
    if race_col in local_data.columns and "Rent Burden" in local_data.columns:
        # Re-calc % just in case
        local_data[race_comp] = (local_data[race_col]/local_data["Total"].replace(0,1)*100)
        fig = px.scatter(local_data, x=race_comp, y="Rent Burden", trendline="ols", color="TANC Local", title=f"{race_comp} vs Rent Burden")
        st.plotly_chart(fig, use_container_width=True)