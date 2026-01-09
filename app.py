import streamlit as st
import pandas as pd
import geopandas as gpd
from streamlit_folium import st_folium
import folium
from folium.plugins import StripePattern
import plotly.express as px
import warnings

# 1. CONFIGURATION
st.set_page_config(page_title="TANC Strategic Planner", layout="wide", page_icon="✊")
warnings.filterwarnings("ignore")

# 2. SESSION STATE (MUST BE AT THE TOP)
# We initialize all variables here to prevent crashes
if 'selected_id' not in st.session_state:
    st.session_state.selected_id = None
if 'map_center' not in st.session_state:
    st.session_state.map_center = [37.8044, -122.2712]
if 'map_zoom' not in st.session_state:
    st.session_state.map_zoom = 11
if 'is_zoomed' not in st.session_state:
    st.session_state.is_zoomed = False

# Custom CSS
st.markdown("""
<style>
    .dossier-box { background-color: #f0f2f6; padding: 15px; border-radius: 8px; border-left: 5px solid #ff4b4b; }
    .stat-val { font-size: 1.5rem; font-weight: bold; color: #333; }
    .stat-lbl { font-size: 0.8rem; text-transform: uppercase; color: #666; }
    .alert-box { padding: 10px; border-radius: 5px; margin-bottom: 10px; font-weight: bold; }
    .alert-red { background-color: #ffebee; color: #c62828; border: 1px solid #ef9a9a; }
</style>
""", unsafe_allow_html=True)

# 3. LOAD DATA
@st.cache_data
def load_data():
    try:
        df = pd.read_csv("tanc_data_clean.csv")
        gdf = gpd.read_file("tanc_map_data.geojson")
        
        def clean_id(x): return str(x).split('.')[0].zfill(6)[-6:]
        df['Match_ID'] = df['Match_ID'].apply(clean_id)
        
        map_id_col = 'GEOID' if 'GEOID' in gdf.columns else 'Match_ID'
        if map_id_col in gdf.columns: gdf['Match_ID'] = gdf[map_id_col].apply(clean_id)
        
        # Pre-calc Percentages
        if "Total" in df.columns:
            for race in ["Black", "White", "Asian", "Hispanic"]: 
                if race in df.columns:
                    df[f"% {race}"] = (df[race]/df["Total"].replace(0,1)*100).round(1)
        
        full_map = gdf.merge(df, on='Match_ID', how='inner', suffixes=('', '_y'))
        return df, full_map
    except Exception as e:
        return None, None

df, gdf = load_data()
if df is None: 
    st.error("Data missing. Please upload 'tanc_data_clean.csv' and 'tanc_map_data.geojson'.")
    st.stop()

# =========================================================
# 4. SIDEBAR: LAYERS & FILTERS
# =========================================================
st.sidebar.title("✊ TANC Planner")

# A. Base Layer (The Fill Color)
st.sidebar.subheader("1. Base Map (Color)")
base_metrics = {
    "% Hispanic": ("% Hispanic", "Reds"),
    "% Black": ("% Black", "Oranges"),
    "% Asian": ("% Asian", "Greens"),
    "% White": ("% White", "Blues"),
    "Total Population": ("Total", "Greys"),
    "Rent Burden": ("Rent Burden", "RdPu"), 
}
base_opts = [k for k,v in base_metrics.items() if v[0] in df.columns]
base_choice = st.sidebar.selectbox("Choose Background:", base_opts)
base_col, base_cmap = base_metrics[base_choice]

# B. Overlay Layer (The Pattern)
st.sidebar.subheader("2. Overlay (Stripes)")
st.sidebar.caption("Stripes appear where condition is met.")
overlay_type = st.sidebar.selectbox("Overlay Condition:", ["None", "Rent Burden", "Unemployment Rate"])
overlay_threshold = 0
if overlay_type != "None":
    overlay_threshold = st.sidebar.slider(f"Threshold: {overlay_type} > X%", 0, 100, 30)

# C. Geography Filter
st.sidebar.markdown("---")
st.sidebar.subheader("3. Filter Turf")
all_locals = sorted(list(df['TANC Local'].unique())) if 'TANC Local' in df.columns else []
selected_locals = st.sidebar.multiselect("Locals:", all_locals)

# APPLY FILTERS
# 1. Split map into "Target" (Visible) and "Context" (Grey)
target_gdf = gdf.copy()
if selected_locals:
    target_gdf = target_gdf[target_gdf['TANC Local'].isin(selected_locals)]

context_gdf = gdf[~gdf['Match_ID'].isin(target_gdf['Match_ID'])]

# =========================================================
# 5. HEADER METRICS
# =========================================================
c1, c2, c3, c4 = st.columns(4)
c1.metric("Target Tracts", len(target_gdf))
c2.metric("Total Population", f"{target_gdf['Total'].sum():,}")
c3.metric("Avg Rent Burden", f"{target_gdf['Rent Burden'].mean():.1f}%" if 'Rent Burden' in target_gdf.columns else "N/A")

# CSV Download
csv = target_gdf.drop(columns='geometry').to_csv(index=False).encode('utf-8')
c4.download_button("⬇️ Download Turf CSV", csv, "tanc_turf.csv", "text/csv")

st.divider()

# =========================================================
# 6. MAP LOGIC (BIVARIATE)
# =========================================================

col_map, col_dossier = st.columns([2, 1])

with col_map:
    st.subheader(f"🗺️ Map: {base_choice} + {overlay_type}")
    
    # 1. INIT MAP
    if not st.session_state.is_zoomed:
         loc = [37.8044, -122.2712]
         zoom = 11
         if len(selected_locals) > 0: zoom = 12
    else:
         loc = st.session_state.map_center
         zoom = st.session_state.map_zoom

    if base_col in target_gdf.columns:
        m = target_gdf.explore(
            column=base_col,
            cmap=base_cmap,
            scheme="quantiles",
            k=5,
            tiles="CartoDB positron",
            tooltip=["TANC Local", "Match_ID", base_col, "Rent Burden"],
            popup=False,
            style_kwds={"fillOpacity": 0.7, "weight": 0.5, "color": "#666"},
            location=loc,
            zoom_start=zoom
        )
    else:
        m = folium.Map(location=loc, zoom_start=zoom, tiles="CartoDB positron")

    # 2. ADD CONTEXT (GHOST) LAYER
    # Shows the areas we filtered out in light grey
    if not context_gdf.empty:
        folium.GeoJson(
            context_gdf,
            style_function=lambda x: {'fillColor': '#f0f0f0', 'color': '#dddddd', 'weight': 0.5, 'fillOpacity': 0.2},
            tooltip="Not in target",
            interactive=False
        ).add_to(m)

    # 3. ADD OVERLAY (STRIPES)
    # Check for the Overlay Condition (e.g. Rent Burden > 30)
    check_col = "Rent Burden" if overlay_type == "Rent Burden" else "Unemployment Rate"
    
    if overlay_type != "None" and check_col in target_gdf.columns:
        crisis_gdf = target_gdf[target_gdf[check_col] > overlay_threshold]
        
        if not crisis_gdf.empty:
            stripe = StripePattern(angle=45, color='#222222', weight=2, opacity=1, space_color='transparent')
            stripe.add_to(m)
            
            folium.GeoJson(
                crisis_gdf,
                name="Crisis Overlay",
                style_function=lambda x: {
                    'fillPattern': stripe, 
                    'fillOpacity': 1, 
                    'color': 'black', 
                    'weight': 1.5,
                    'opacity': 1
                },
                tooltip=f"⚠️ High {overlay_type} (> {overlay_threshold}%)",
                interactive=True 
            ).add_to(m)

    # RENDER
    st_data = st_folium(m, height=600, use_container_width=True, returned_objects=["last_object_clicked"])

    # HANDLE CLICKS
    if st_data.get("last_object_clicked"):
        props = st_data["last_object_clicked"].get("properties", {})
        if "Match_ID" in props:
            # Update ID but DO NOT Force Zoom (keeps map stable while browsing)
            st.session_state.selected_id = props["Match_ID"] 
            # If you want auto-zoom on click, uncomment these:
            # st.session_state.map_center = [st_data['last_object_clicked']['geometry']['type']]... (requires centroid math)
            # st.session_state.is_zoomed = True

# =========================================================
# 7. NEIGHBORHOOD DOSSIER (RIGHT PANEL)
# =========================================================
with col_dossier:
    st.subheader("📋 Tract Dossier")
    
    if st.session_state.selected_id:
        row = df[df['Match_ID'] == st.session_state.selected_id]
        if not row.empty:
            row = row.iloc[0]
            
            # HEADER
            st.markdown(f"### Tract: {row['Match_ID']}")
            st.caption(f"Local: {row.get('TANC Local', 'Unknown')}")
            st.markdown("---")

            # CRISIS CHECK
            r_burden = row.get("Rent Burden", 0)
            unemp = row.get("Unemployment Rate", 0)
            
            col_a, col_b = st.columns(2)
            col_a.metric("Rent Burden", f"{r_burden}%")
            col_b.metric("Unemployment", f"{unemp}%")

            if overlay_type != "None":
                val = row.get(check_col, 0)
                if val > overlay_threshold:
                    st.markdown(f'<div class="alert-box alert-red">⚠️ ABOVE THRESHOLD ({val}%)</div>', unsafe_allow_html=True)
            
            # LANGUAGE ALERT
            if row.get("% Spanish LE", 0) > 15:
                 st.info("🇪🇸 **High Spanish Isolation:** Bring bilingual flyers.")
            elif row.get("% Asian LE", 0) > 15:
                 st.info("🌏 **High Asian Lang Isolation:** Bring translation sheets.")
            else:
                 st.success("✅ **Standard Packet:** English primarily.")

            # DEMOGRAPHICS CHART
            st.markdown("#### Demographics")
            race_cols = ["% Black", "% White", "% Hispanic", "% Asian"]
            present_cols = [c for c in race_cols if c in row]
            if present_cols:
                vals = row[present_cols].values
                names = [c.replace("% ", "") for c in present_cols]
                fig = px.pie(values=vals, names=names, hole=0.5)
                fig.update_layout(height=250, margin=dict(t=0,b=0,l=0,r=0), showlegend=True)
                # Updated for new Streamlit version
                st.plotly_chart(fig, width="stretch") 

    else:
        st.info("👈 Click a neighborhood to generate a dossier.")
        st.markdown("""
        **Legend:**
        *   **Colors:** Base demographic density.
        *   **Stripes (///):** High crisis levels.
        *   **Grey:** Areas filtered out.
        """)