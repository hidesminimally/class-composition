import streamlit as st
import pandas as pd
import geopandas as gpd
import plotly.express as px
from streamlit_folium import st_folium

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
c1.metric("Total Renters", f"{local_data['Total Renters'].sum():,}")
c2.metric("Avg Rent Burden", f"{local_data['Rent Burden'].mean():.1f}%")
c3.metric("Eviction Count (RAP)", f"{local_data['Evictions'].sum():,}")

# MAP AND CHARTS SPLIT
col_map, col_charts = st.columns([2, 1])

with col_map:
    st.subheader("Territory Map")
    # This renders the map inside the app
    m = map_data.explore(column="Rent Burden", cmap="Reds", tiles="CartoDB positron")
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
