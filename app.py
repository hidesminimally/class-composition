import streamlit as st
import pandas as pd
import geopandas as gpd
from streamlit_folium import st_folium
import folium
import plotly.express as px
import warnings

# 1. CONFIGURATION
st.set_page_config(page_title="TANC Strategic Planner", layout="wide", page_icon="✊")
warnings.filterwarnings("ignore")

# Custom CSS for the Dossier
st.markdown("""
<style>
    .dossier-box { background-color: #f0f2f6; padding: 15px; border-radius: 8px; border-left: 5px solid #ff4b4b; }
    .stat-val { font-size: 1.5rem; font-weight: bold; color: #333; }
    .stat-lbl { font-size: 0.8rem; text-transform: uppercase; color: #666; }
    .alert-box { padding: 10px; border-radius: 5px; margin-bottom: 10px; font-weight: bold; }
    .alert-red { background-color: #ffebee; color: #c62828; border: 1px solid #ef9a9a; }
    .alert-yellow { background-color: #fffde7; color: #fbc02d; border: 1px solid #fff59d; }
</style>
""", unsafe_allow_html=True)

# 2. SESSION STATE
if 'selected_id' not in st.session_state:
    st.session_state.selected_id = None
if 'map_center' not in st.session_state:
    st.session_state.map_center = [37.8044, -122.2712]

# 3. LOAD DATA
@st.cache_data
def load_data():
    try:
        df = pd.read_csv("tanc_data_clean.csv")
        gdf = gpd.read_file("tanc_map_data.geojson")
        
        # ID Cleaning
        def clean_id(x): return str(x).split('.')[0].zfill(6)[-6:]
        df['Match_ID'] = df['Match_ID'].apply(clean_id)
        
        map_id_col = 'GEOID' if 'GEOID' in gdf.columns else 'Match_ID'
        if map_id_col in gdf.columns: gdf['Match_ID'] = gdf[map_id_col].apply(clean_id)
        
        # Calculate Percentages if missing
        if "Total" in df.columns:
            for race in ["Black", "White", "Asian", "Hispanic"]: 
                if race in df.columns and f"% {race}" not in df.columns:
                    df[f"% {race}"] = (df[race]/df["Total"].replace(0,1)*100).round(1)

        full_map = gdf.merge(df, on='Match_ID', how='inner', suffixes=('', '_y'))
        return df, full_map
    except Exception as e:
        return None, None

df, gdf = load_data()

if df is None:
    st.error("⚠️ Data files not found. Ensure 'tanc_data_clean.csv' and 'tanc_map_data.geojson' are in the folder.")
    st.stop()

# =========================================================
# 4. SIDEBAR: THE STRATEGY BUILDER
# =========================================================
st.sidebar.title("✊ TANC Planner")
st.sidebar.markdown("**1. Filter Turf**")

# A. Geography
all_locals = sorted(list(df['TANC Local'].unique())) if 'TANC Local' in df.columns else []
selected_locals = st.sidebar.multiselect("Local:", all_locals)

# B. Hard Filters
st.sidebar.markdown("---")
min_rent = st.sidebar.slider("Min. Rent Burden %", 0, 100, 30)
min_unemp = st.sidebar.slider("Min. Unemployment %", 0, 100, 0)
lang_focus = st.sidebar.selectbox("Language Focus", ["All", "Spanish Areas (>15%)", "Asian Lang Areas (>15%)"])

# Apply Filters
targets = df.copy()
if selected_locals:
    targets = targets[targets['TANC Local'].isin(selected_locals)]

targets = targets[
    (targets.get("Rent Burden", 0) >= min_rent) & 
    (targets.get("Unemployment Rate", 0) >= min_unemp)
]

if lang_focus == "Spanish Areas (>15%)":
    targets = targets[targets.get("% Spanish LE", 0) >= 15]
elif lang_focus == "Asian Lang Areas (>15%)":
    targets = targets[targets.get("% Asian LE", 0) >= 15]

target_gdf = gdf[gdf['Match_ID'].isin(targets['Match_ID'])]
context_gdf = gdf[~gdf['Match_ID'].isin(targets['Match_ID'])] # The "Ghost" layer

# =========================================================
# 5. MAIN INTERFACE
# =========================================================

# METRICS ROW
c1, c2, c3, c4 = st.columns(4)
c1.metric("Target Tracts", len(targets))
c2.metric("Total Population", f"{targets['Total'].sum():,}")
c3.metric("Avg Rent Burden", f"{targets['Rent Burden'].mean():.1f}%")
csv = targets.to_csv(index=False).encode('utf-8')
c4.download_button("⬇️ Download List (CSV)", csv, "tanc_turf_cut.csv", "text/csv")

st.divider()

col_map, col_dossier = st.columns([2, 1])

# --- LEFT: THE MAP ---
with col_map:
    st.subheader("🗺️ Target Map")
    
    m = folium.Map(location=st.session_state.map_center, zoom_start=11, tiles="CartoDB positron")
    
    # 1. GHOST LAYER (Context - Greyed out)
    if not context_gdf.empty:
        folium.GeoJson(
            context_gdf,
            style_function=lambda x: {'fillColor': '#e0e0e0', 'color': '#cccccc', 'weight': 0.5, 'fillOpacity': 0.3},
            tooltip="Not in target criteria"
        ).add_to(m)

    # 2. TARGET LAYER (Hotspots)
    if not target_gdf.empty:
        # We use a choropleth for the targets
        folium.Choropleth(
            geo_data=target_gdf,
            data=targets,
            columns=['Match_ID', 'Rent Burden'],
            key_on='feature.properties.Match_ID',
            fill_color='YlOrRd',
            fill_opacity=0.8,
            line_opacity=0.5,
            legend_name="Rent Burden %"
        ).add_to(m)

        # 3. INTERACTION LAYER (Invisible but clickable)
        folium.GeoJson(
            target_gdf,
            style_function=lambda x: {'fillColor': '#00000000', 'color': '#00000000'},
            tooltip=folium.GeoJsonTooltip(fields=['TANC Local', 'Match_ID', 'Rent Burden']),
            popup=folium.GeoJsonPopup(fields=['Match_ID']) # Ensures click registration
        ).add_to(m)

    # Render
    map_data = st_folium(m, height=600, use_container_width=True, returned_objects=["last_object_clicked"])

    # Handle Clicks
    if map_data.get("last_object_clicked"):
        props = map_data["last_object_clicked"].get("properties", {})
        if "Match_ID" in props:
            st.session_state.selected_id = props["Match_ID"]

# --- RIGHT: THE DOSSIER ---
with col_dossier:
    st.subheader("📋 Neighborhood Dossier")
    
    if st.session_state.selected_id:
        # Fetch Data
        row = df[df['Match_ID'] == st.session_state.selected_id]
        
        if not row.empty:
            row = row.iloc[0]
            
            # HEADER
            st.markdown(f"**Tract ID:** {row['Match_ID']}")
            st.markdown(f"**Local:** {row.get('TANC Local', 'Unknown')}")
            
            # LOGIC ALERTS
            spanish_pct = row.get('% Spanish LE', 0)
            rent_val = row.get('Rent Burden', 0)
            
            if spanish_pct > 15:
                st.markdown(f'<div class="alert-box alert-red">⚠️ SPANISH MATERIALS REQUIRED ({spanish_pct}%)</div>', unsafe_allow_html=True)
            elif row.get('% Asian LE', 0) > 15:
                st.markdown(f'<div class="alert-box alert-yellow">⚠️ ASIAN LANG MATERIALS REQUIRED</div>', unsafe_allow_html=True)
            else:
                st.markdown('<div class="alert-box" style="background:#e8f5e9; color:#2e7d32;">✅ Standard English Packet</div>', unsafe_allow_html=True)

            # STATS GRID
            st.markdown(f"""
            <div class="dossier-box">
                <div style="display:flex; justify-content:space-between; text-align:center;">
                    <div><div class="stat-val">{rent_val}%</div><div class="stat-lbl">Rent Burden</div></div>
                    <div><div class="stat-val">{row.get('Unemployment Rate', 0)}%</div><div class="stat-lbl">Unemployment</div></div>
                </div>
            </div>
            """, unsafe_allow_html=True)
            
            # TALKING POINTS
            st.markdown("#### 🗣️ Talking Points")
            
            st.info(f"Hi, I'm with TANC. We are organizing because families in this neighborhood are paying **{rent_val}% of their income to rent** on average.")
            
            if rent_val > 40:
                st.write("👉 **Pivot:** Focus on price gouging and the need for rent caps.")
            elif row.get('Unemployment Rate', 0) > 8:
                st.write("👉 **Pivot:** Focus on eviction protections and economic justice.")
            
            # DEMOGRAPHICS
            st.markdown("#### 👥 Demographics")
            race_cols = [c for c in ["% Black", "% White", "% Hispanic", "% Asian"] if c in row]
            if race_cols:
                vals = row[race_cols].values
                names = [c.replace("% ", "") for c in race_cols]
                fig = px.pie(values=vals, names=names, hole=0.4)
                fig.update_layout(height=200, margin=dict(t=0,b=0,l=0,r=0), showlegend=False)
                st.plotly_chart(fig, use_container_width=True)
                
        else:
            st.warning("Selected tract not found in data.")
    else:
        st.info("👈 **Action Required:** Click any colored neighborhood on the map to generate a briefing.")
        
        st.markdown("""
        **How to use this tool:**
        1. Use sidebar to **filter** for priority turf.
        2. **Download CSV** above for the dialer.
        3. Click tracts to view **logistics & scripts**.
        """)