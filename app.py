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

# A. Filter by Local
if 'TANC Local' in df.columns:
    local_options = ["All"] + sorted(list(df['TANC Local'].unique()))
    selected_local = st.sidebar.selectbox("Filter by Local", options=local_options)
else:
    selected_local = "All"

# B. Select Map Layer (The Social Explorer Style Feature)
st.sidebar.markdown("---")
st.sidebar.subheader("Map Layer")

# Define what metrics we want to make available
available_metrics = ["Total Population"]
if "Black" in df.columns and "Total" in df.columns: available_metrics.append("% Black Population")
if "White" in df.columns and "Total" in df.columns: available_metrics.append("% White Population")
if "Asian" in df.columns and "Total" in df.columns: available_metrics.append("% Asian Population")
if "Hispanic" in df.columns and "Total" in df.columns: available_metrics.append("% Hispanic Population")
if "Rent Burden" in df.columns: available_metrics.append("Rent Burden")

target_metric = st.sidebar.radio("Select Demographic:", available_metrics)

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
    st.subheader(f"Map: {target_metric}")
    
    # 1. PREPARE THE DATA (Calculate Percentages on the fly)
    # This prevents the "0.0" error and makes the map meaningful
    plot_col = "Total" # Default
    color_scale = "YlOrRd" # Default
    
    if target_metric == "% Black Population":
        # Create a temporary column for percentage
        # We use .copy() to avoid SettingWithCopy warnings
        map_data = map_data.copy()
        map_data["Pct_Black"] = (map_data["Black"] / map_data["Total"].replace(0, 1) * 100).round(1)
        plot_col = "Pct_Black"
        color_scale = "Oranges" # Social Explorer often uses Oranges for this
        
    elif target_metric == "% White Population":
        map_data = map_data.copy()
        map_data["Pct_White"] = (map_data["White"] / map_data["Total"].replace(0, 1) * 100).round(1)
        plot_col = "Pct_White"
        color_scale = "Blues"
        
    elif target_metric == "% Asian Population":
        map_data = map_data.copy()
        map_data["Pct_Asian"] = (map_data["Asian"] / map_data["Total"].replace(0, 1) * 100).round(1)
        plot_col = "Pct_Asian"
        color_scale = "Greens"

    elif target_metric == "% Hispanic Population":
        map_data = map_data.copy()
        map_data["Pct_Hisp"] = (map_data["Hispanic"] / map_data["Total"].replace(0, 1) * 100).round(1)
        plot_col = "Pct_Hisp"
        color_scale = "Reds"
        
    elif target_metric == "Rent Burden":
        plot_col = "Rent Burden"
        color_scale = "RdPu" # Red-Purple is often used for "Pain/Cost"

    # 2. RENDER THE MAP
    # Only map if we have data to avoid the crash
    if plot_col in map_data.columns and map_data[plot_col].sum() > 0:
        m = map_data.explore(
            column=plot_col,
            cmap=color_scale,
            scheme="quantiles",  # Forces distinct colors
            k=5,                 # 5 distinct buckets
            tiles="CartoDB positron",
            tooltip=["TANC Local", "Total", plot_col], # Only show relevant info
            popup=False,
            legend_kwds={"caption": target_metric},
            style_kwds={"fillOpacity": 0.7, "weight": 0.5}
        )
        st_folium(m, use_container_width=True, height=500)
    else:
        st.warning(f"Not enough data to display {target_metric} for this area.")
        # Render empty map so layout doesn't jump
        m = map_data.explore(color="#f0f0f0", tiles="CartoDB positron")
        st_folium(m, use_container_width=True, height=500)

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