import dash
from dash import dcc, html, Input, Output, State, no_update
import plotly.express as px
import pandas as pd
import geopandas as gpd

# 1. LOAD DATA ONCE (Global)
df = pd.read_csv("tanc_data_clean.csv")
gdf = gpd.read_file("tanc_map_data.geojson")

# Ensure IDs match
def clean_id(x): return str(x).split('.')[0].zfill(6)[-6:]
df['Match_ID'] = df['Match_ID'].apply(clean_id)
map_id = 'GEOID' if 'GEOID' in gdf.columns else 'Match_ID'
gdf['Match_ID'] = gdf[map_id].apply(clean_id)

# Pre-calculations
gdf = gdf.to_crs(epsg=4326) # Ensure WGS84 for Plotly
full_map = gdf.merge(df, on='Match_ID', how='inner')

# 2. SETUP APP
app = dash.Dash(__name__)

# 3. LAYOUT (The HTML Structure)
app.layout = html.Div([
    html.H1("TANC Dashboard", style={'textAlign': 'center'}),
    
    html.Div([
        # SIDEBAR CONTROLS
        html.Div([
            html.Label("Base Color Metric:"),
            dcc.Dropdown(
                id='base-choice',
                options=["% Hispanic", "% Black", "% White", "Rent Burden"],
                value='% Hispanic',
                clearable=False
            ),
            html.Br(),
            html.Label("Filter by Local:"),
            dcc.Dropdown(
                id='local-filter',
                options=sorted(df['TANC Local'].unique().tolist()) if 'TANC Local' in df.columns else [],
                multi=True
            )
        ], style={'width': '25%', 'display': 'inline-block', 'verticalAlign': 'top', 'padding': '20px'}),

        # THE MAP (Uses dcc.Graph, which is GPU accelerated and smooth)
        html.Div([
            dcc.Graph(id='main-map', style={'height': '80vh'})
        ], style={'width': '70%', 'display': 'inline-block'})
    ])
])

# 4. CALLBACKS (The Logic - ONLY runs when inputs change)
@app.callback(
    Output('main-map', 'figure'),
    [Input('base-choice', 'value'),
     Input('local-filter', 'value')],
    [State('main-map', 'relayoutData')] # Captures current Zoom/Pan
)
def update_map(selected_metric, selected_locals, current_view):
    # 1. Filter Data
    dff = full_map.copy()
    if selected_locals:
        dff = dff[dff['TANC Local'].isin(selected_locals)]
    
    # 2. Draw Map (Using Plotly Choropleth Mapbox)
    # This is much faster than Folium for updates
    fig = px.choropleth_mapbox(
        dff,
        geojson=dff.geometry,
        locations=dff.index,
        color=selected_metric,
        color_continuous_scale="Viridis",
        mapbox_style="carto-positron",
        center={"lat": 37.8044, "lon": -122.2712}, # Default
        zoom=10,
        opacity=0.6,
        hover_data=["TANC Local", "Match_ID", selected_metric]
    )
    
    # 3. Preserve User Zoom/Pan
    # If the user has moved the map, 'relayoutData' tells us where they are.
    # We apply that back to the new figure so it doesn't reset.
    if current_view and 'mapbox.center' in current_view:
        fig.update_layout(mapbox=dict(
            center=current_view['mapbox.center'],
            zoom=current_view['mapbox.zoom']
        ))

    fig.update_layout(margin={"r":0,"t":0,"l":0,"b":0})
    return fig

if __name__ == '__main__':
    app.run_server(debug=True)