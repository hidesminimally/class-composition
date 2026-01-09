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
    # 1. Load Data
    df = pd.read_csv("tanc_data_clean.csv")
    # 2. Load Map
    gdf = gpd.read_file("tanc_map_data.geojson")
    
    # 3. Merge
    df['Match_ID'] = df['Match_ID'].astype(str)
    # Ensure Map has Match_ID
    if 'Match_ID' not in gdf.columns and 'GEOID' in gdf.columns:
         gdf['Match_ID'] = gdf['GEOID'].astype(str).str[-6:]
    gdf['Match_ID'] = gdf['Match_ID'].astype(str)

    full_map = gdf.merge(df, on='Match_ID', how='inner', suffixes=('', '_y'))
    return df, full_map

try:
    df, gdf = load_data()
except Exception as e:
    st.error(f"⚠️ Error loading files. Did you upload 'tanc_data_clean.csv'? Error: {e}")
    st.stop()

# 3. SIDEBAR CONTROLS
st.sidebar.title("TANC Dashboard")

# A. Filter by Local
if 'TANC Local' in df.columns:
    local_options = ["All"] + sorted(list(df['TANC Local'].unique()))
    selected_local = st.sidebar.selectbox("Filter by Local", options=local_options)
else:
    selected_local = "All"

# B. Map Layer (Updated Logic)
st.sidebar.markdown("---")
st.sidebar.subheader("Map Layer")

# Map friendly names to (Column Name, Color Palette)
metrics_map = {
    "Total Population": ("Total", "Greys"),
    "% Black": ("% Black", "Oranges"),
    "% Hispanic": ("% Hispanic", "Reds"),
    "% Asian": ("% Asian", "Greens"),
    "% White": ("% White", "Blues"),
    "Rent Burden": ("Rent Burden", "RdPu"),
    "Unemployment Rate": ("Unemployment Rate", "YlOrRd"), # NEW
    "% Spanish Limited English": ("% Spanish LE", "YlGn"), # NEW
    "% Asian Limited English": ("% Asian LE", "PuBuGn")    # NEW
}

# Only show options if the data actually exists in your CSV
available_options = [k for k, v in metrics_map.items() if v[0] in df.columns or v[0] in ["% Black", "% Hispanic", "% Asian", "% White", "% Spanish LE", "% Asian LE"]]

target_choice = st.sidebar.radio("Select Demographic:", available_options)

# Get the target column and color for later use
target_col_name, target_cmap = metrics_map[target_choice]


# 4. FILTER DATA
if selected_local != "All":
    local_data = df[df['TANC Local'] == selected_local]
    map_data = gdf[gdf['TANC Local'] == selected_local]
else:
    local_data = df
    map_data = gdf


# 5. MAIN CONTENT
st.title(f"Composition: {selected_local}")

# Top Metrics
col1, col2, col3 = st.columns(3)
col1.metric("Total Population", f"{local_data['Total'].sum():,}" if 'Total' in local_data.columns else "N/A")
col2.metric("Rent Burden", f"{local_data['Rent Burden'].mean():.1f}%" if 'Rent Burden' in local_data.columns else "N/A")
col3.metric("Evictions", f"{local_data['Evictions'].sum():,}" if 'Evictions' in local_data.columns else "N/A")

# ---------------------------------------------------------
# MAP AND CHART SECTION
# ---------------------------------------------------------
c_map, c_chart = st.columns([2, 1])

# Initialize Zoom Variables (We'll update these if a table row is clicked later)
# Note: Streamlit runs top-to-bottom, so the zoom happens on the NEXT re-run after clicking.
if 'map_center' not in st.session_state:
    st.session_state.map_center = [37.8044, -122.2712]
    st.session_state.map_zoom = 11
    st.session_state.highlight_id = None

with c_map:
    st.subheader(f"Map: {target_choice}")
    
    # CALCULATE PERCENTAGES ON THE FLY
    # This ensures the map handles the math even if the CSV only has raw counts
    valid_map_data = map_data.copy()
    plot_col = target_col_name # Default
    
    # Helper to calculate %
    def calc_pct(df, num_col, denom_col, new_col_name):
        if num_col in df.columns and denom_col in df.columns:
            df[new_col_name] = (df[num_col] / df[denom_col].replace(0, 1) * 100).round(1)
            return new_col_name
        return None

    # Apply calculations based on selection
    if target_choice == "% Black":
        plot_col = calc_pct(valid_map_data, "Black", "Total", "Pct_Black")
    elif target_choice == "% White":
        plot_col = calc_pct(valid_map_data, "White", "Total", "Pct_White")
    elif target_choice == "% Asian":
        plot_col = calc_pct(valid_map_data, "Asian", "Total", "Pct_Asian")
    elif target_choice == "% Hispanic":
        plot_col = calc_pct(valid_map_data, "Hispanic", "Total", "Pct_Hisp")
    elif target_choice == "% Spanish Limited English":
        # Check if we have the raw counts or if it's already in the CSV
        if "% Spanish LE" not in valid_map_data.columns and "C16002_004E" in valid_map_data.columns:
             valid_map_data["% Spanish LE"] = (valid_map_data["C16002_004E"] / valid_map_data["C16002_001E"].replace(0,1) * 100).round(1)
        plot_col = "% Spanish LE"
    elif target_choice == "% Asian Limited English":
        if "% Asian LE" not in valid_map_data.columns and "C16002_007E" in valid_map_data.columns:
             valid_map_data["% Asian LE"] = (valid_map_data["C16002_007E"] / valid_map_data["C16002_001E"].replace(0,1) * 100).round(1)
        plot_col = "% Asian LE"
        
    # RENDER MAP
    if plot_col in valid_map_data.columns:
        # Filter 0s
        valid_map_data = valid_map_data[valid_map_data[plot_col] > 0]
        
        if not valid_map_data.empty:
            
            # Highlight Logic
            def style_function(feature):
                base = {"fillOpacity": 0.7, "weight": 0.3, "color": "#444444"}
                if st.session_state.highlight_id and feature['properties']['Match_ID'] == st.session_state.highlight_id:
                    return {"fillOpacity": 0.7, "weight": 4, "color": "cyan"}
                return base

            m = valid_map_data.explore(
                column=plot_col,
                cmap=target_cmap,
                scheme="quantiles", 
                k=5,
                tiles="CartoDB positron",
                tooltip=["TANC Local", "Total", plot_col],
                popup=False,
                legend_kwds={"caption": target_choice},
                style_kwds={"style_function": style_function},
                location=st.session_state.map_center,
                zoom_start=st.session_state.map_zoom
            )
            st_folium(m, use_container_width=True, height=500)
        else:
            st.warning("No data > 0 found for this selection.")
    else:
        st.warning(f"Column '{plot_col}' not found in data.")


with c_chart:
    st.subheader("Demographics")
    # Safety Check for Columns
    desired_cols = ["Black", "White", "Asian", "Hispanic"]
    available_cols = [c for c in desired_cols if c in local_data.columns]
    
    if available_cols:
        chart_data = local_data[available_cols].sum().reset_index()
        chart_data.columns = ["Group", "Count"]
        
        # Color Logic
        bar_colors = ["#d3d3d3"] * len(chart_data)
        for i, group in enumerate(chart_data["Group"]):
            if group in target_choice: # Matches "Black" in "% Black"
                if group == "Black": bar_colors[i] = "#ff7f0e"
                elif group == "White": bar_colors[i] = "#1f77b4"
                elif group == "Asian": bar_colors[i] = "#2ca02c"
                elif group == "Hispanic": bar_colors[i] = "#d62728"
        
        fig = px.bar(chart_data, x="Group", y="Count", title="Total Counts", text_auto='.2s')
        fig.update_traces(marker_color=bar_colors)
        fig.update_layout(xaxis_title="", yaxis_title="")
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Demographic columns missing.")

# ---------------------------------------------------------
# TARGET LIST & INTERSECTIONALITY
# ---------------------------------------------------------

st.markdown("---")
st.header("🔥 Organizing Targets")
st.write("👈 Click a row to zoom the map.")

# Filter High Burden
if "Rent Burden" in local_data.columns:
    crisis_data = local_data[
        (local_data["Rent Burden"] > 40) & 
        (local_data["Total"] > 500)
    ].copy().sort_values(by="Rent Burden", ascending=False)
    
    if not crisis_data.empty:
        # Select Cols
        display_cols = ["TANC Local", "Match_ID", "Rent Burden", "Median Rent", "Total", "Black", "Hispanic"]
        final_cols = [c for c in display_cols if c in crisis_data.columns]
        
        # Interactive Table
        event = st.dataframe(
            crisis_data[final_cols].style.background_gradient(subset=["Rent Burden"], cmap="Reds"),
            use_container_width=True,
            hide_index=True,
            on_select="rerun",
            selection_mode="single-row"
        )
        
        # Zoom Handler
        if len(event.selection.rows) > 0:
            idx = event.selection.rows[0]
            selected_id = crisis_data.iloc[idx]["Match_ID"]
            target_shape = map_data[map_data["Match_ID"] == str(selected_id)]
            
            if not target_shape.empty:
                centroid = target_shape.geometry.centroid.iloc[0]
                st.session_state.map_center = [centroid.y, centroid.x]
                st.session_state.map_zoom = 14
                st.session_state.highlight_id = str(selected_id)
                st.rerun() # Force immediate reload to update map
    else:
        st.info("No high-burden tracts found.")


# NEW SECTION: INTERSECTIONALITY
st.markdown("---")
st.header("📊 Who is actually burdened?")
st.write("Correlation analysis: If the line goes UP, that group faces disproportionately higher rents.")

c1, c2 = st.columns(2)

with c1:
    st.subheader("Race vs Rent Burden")
    compare_race = st.selectbox("Compare Rent Burden with:", ["% Black", "% Hispanic", "% Asian", "% White"])
    
    # Calculate % on fly if needed
    race_base = compare_race.replace("% ", "")
    if race_base in local_data.columns and "Total" in local_data.columns:
        local_data[compare_race] = (local_data[race_base] / local_data["Total"].replace(0,1) * 100)
    
    if "Rent Burden" in local_data.columns and compare_race in local_data.columns:
        fig_corr = px.scatter(
            local_data, 
            x=compare_race, 
            y="Rent Burden", 
            hover_name="TANC Local",
            trendline="ols", # Regression line
            title=f"{compare_race} vs Rent Burden",
            color="TANC Local",
            color_discrete_sequence=px.colors.qualitative.Bold
        )
        st.plotly_chart(fig_corr, use_container_width=True)

with c2:
    st.subheader("Language vs Jobs")
    # Check if we have the new variables
    if "Unemployment Rate" in local_data.columns and "% Spanish LE" in local_data.columns:
        fig_job = px.scatter(
            local_data,
            x="% Spanish LE",
            y="Unemployment Rate",
            hover_name="TANC Local",
            trendline="ols",
            title="Spanish Language vs Unemployment",
            color="TANC Local",
            color_discrete_sequence=px.colors.qualitative.Bold
        )
        st.plotly_chart(fig_job, use_container_width=True)
    else:
        st.info("Unemployment/Language data not found. (Did you upload the new CSV?)")