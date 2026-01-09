import streamlit as st
import pandas as pd
import geopandas as gpd
import plotly.express as px
from streamlit_folium import st_folium

# DEBUGGING: Print columns to the app so you can see them
st.write("Current Columns:", df.columns.tolist())
# PAGE CONFIG
st.set_page_config(page_title="TANC Class Comp", layout="wide")

# 1. LOAD DATA (Fast, because we aren't cleaning it live)
@st.cache_data
def load_data():
    df = pd.read_csv("tanc_data_clean.csv")
    gdf = gpd.read_file("tanc_map_data.geojson")
    return df, gdf

df, gdf = load_data()

# 2. SIDEBAR
st.sidebar.title("Filters")
selected_local = st.sidebar.selectbox("Select TANC Local", options=["All"] + list(df['TANC Local'].unique()))

# 3. MAIN AREA
st.title(f"Class Composition: {selected_local}")

# Filter logic
if selected_local != "All":
    local_data = df[df['TANC Local'] == selected_local]
    map_data = gdf[gdf['TANC Local'] == selected_local]
else:
    local_data = df
    map_data = gdf

# TOP METRICS ROW
c1, c2, c3 = st.columns(3)
# Use 'Total' instead of 'Total Renters'
# We also use .get() for the others to prevent crashes if data is missing
c1.metric("Total Population", f"{local_data['Total'].sum():,}")

# Only show these if the columns actually exist, otherwise show "N/A"
burden = local_data['Rent Burden'].mean() if 'Rent Burden' in local_data.columns else 0
c2.metric("Avg Rent Burden", f"{burden:.1f}%")

evictions = local_data['Evictions'].sum() if 'Evictions' in local_data.columns else 0
c3.metric("Eviction Count", f"{evictions:,}")

# MAP AND CHARTS SPLIT
col_map, col_charts = st.columns([2, 1])

with col_map:
    st.subheader("Territory Map")
    # This renders the map inside the app
    m = map_data.explore(column="Total", cmap="Blues", tiles="CartoDB positron")
    st_folium(m, use_container_width=True, height=500)

with col_charts:
    st.subheader("Demographics")
    # Use Plotly for interactive charts (better than matplotlib)
    fig = px.bar(local_data.melt(id_vars=['Census Tract'], value_vars=['Black', 'White', 'Asian', 'Hispanic']), 
                 x='variable', y='value', title="Race/Class Composition")
    st.plotly_chart(fig, use_container_width=True)

    st.subheader("Corporate vs Small Landlord")
    # Placeholder for corporate data logic
    st.write("Data coming soon from RAP...")
