import streamlit as st
import pandas as pd
import geopandas as gpd
from streamlit_folium import st_folium
import plotly.express as px

# 1. CONFIGURATION (Must be the very first command)
st.set_page_config(page_title="TANC Class Comp", layout="wide")

# 2. LOAD DATA (Updated to Merge CSV + Map)
@st.cache_data
def load_data():
    # 1. Load the Data (Numbers)
    df = pd.read_csv("tanc_data_clean.csv")
    
    # 2. Load the Map (Shapes)
    gdf = gpd.read_file("tanc_map_data.geojson")
    
    # 3. MERGE THEM TOGETHER
    # We match them using the 'Match_ID' column
    
    # Ensure IDs are strings in both files so they match perfectly
    df['Match_ID'] = df['Match_ID'].astype(str)
    
    # (Safety Check: ensure Map has Match_ID)
    if 'Match_ID' not in gdf.columns and 'GEOID' in gdf.columns:
         gdf['Match_ID'] = gdf['GEOID'].astype(str).str[-6:]
    gdf['Match_ID'] = gdf['Match_ID'].astype(str)

    # Perform the merge: Keep the Shapes (left), add the Data (right)
    # suffixes=('', '_y') drops duplicate columns if they exist
    full_map = gdf.merge(df, on='Match_ID', how='inner', suffixes=('', '_y'))
    
    return df, full_map

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
        

    
    # FIX: Filter out tracts with 0 population to prevent the "Black Shape" bug
    valid_map_data = map_data.copy()
    if plot_col in valid_map_data.columns:
        # Only show tracts that actually have data
        valid_map_data = valid_map_data[valid_map_data[plot_col] > 0]
    
    if not valid_map_data.empty:
        m = valid_map_data.explore(
            column=plot_col,
            cmap=color_scale,
            scheme="quantiles", 
            k=5,
            tiles="CartoDB positron",
            tooltip=["TANC Local", "Total", plot_col],
            popup=False,
            legend_kwds={"caption": target_metric},
            # Change "black" to something lighter for the lines
            style_kwds={"fillOpacity": 0.7, "weight": 0.3, "color": "#444444"} 
        )
        st_folium(m, use_container_width=True, height=500)
    else:
        st.warning(f"Not enough data to display {target_metric} for this area.")
        # Render empty map so layout doesn't jump
        m = map_data.explore(color="#f0f0f0", tiles="CartoDB positron")
        st_folium(m, use_container_width=True, height=500)


with c_chart:
    st.subheader("Demographics")
    
    # 1. Filter data to the current view
    # (We aggregate the numbers so the chart shows the Total for the selected Local)
    chart_data = local_data[["Black", "White", "Asian", "Hispanic"]].sum().reset_index()
    chart_data.columns = ["Group", "Count"]
    
    # 2. Highlight the bar that matches the Map
    # If map is "% Black", we want the "Black" bar to be red/orange
    bar_colors = ["#d3d3d3"] * len(chart_data) # Default all to grey
    
    if "Black" in target_metric: 
        bar_colors[0] = "#ff7f0e" # Orange for Black
    elif "White" in target_metric: 
        bar_colors[1] = "#1f77b4" # Blue for White
    elif "Asian" in target_metric: 
        bar_colors[2] = "#2ca02c" # Green for Asian
        
    # 3. Render
    fig = px.bar(
        chart_data, 
        x="Group", 
        y="Count", 
        title="Total Counts (Selected Area)",
        text_auto='.2s'
    )
    # Apply the highlight colors
    fig.update_traces(marker_color=bar_colors)
    fig.update_layout(xaxis_title="", yaxis_title="")
    
    st.plotly_chart(fig, use_container_width=True)




st.markdown("---")
st.header("🔥 Top Organizing Targets (The 'Bleeding' Edge)")
st.write("These are the specific tracts where tenants are paying >50% of their income on rent.")

# 1. FILTER: Find the Crisis Zones
# We look for High Rent Burden (> 40%) and significant population
crisis_data = local_data[
    (local_data["Rent Burden"] > 40) & 
    (local_data["Total"] > 500)
].copy()

# 2. SORT: Worst first
crisis_data = crisis_data.sort_values(by="Rent Burden", ascending=False)

# 3. DISPLAY: A clean, actionable list
if not crisis_data.empty:
    # Format the columns to be readable
    display_cols = ["TANC Local", "Match_ID", "Rent Burden", "Median Rent", "Total", "Black", "Hispanic"]
    
    # Filter columns that actually exist to prevent crashing
    final_cols = [c for c in display_cols if c in crisis_data.columns]
    
    # Show the table
    st.dataframe(
        crisis_data[final_cols].style.background_gradient(subset=["Rent Burden"], cmap="Reds"),
        use_container_width=True,
        hide_index=True
    )
    
    # 4. DOWNLOAD BUTTON (So you can print it and walk)
    csv = crisis_data[final_cols].to_csv(index=False).encode('utf-8')
    st.download_button(
        "📥 Download Target List for Canvassing",
        csv,
        "tanc_targets.csv",
        "text/csv",
        key='download-csv'
    )
else:
    st.success("No tracts found with extreme rent burden (>40%) in this view.")