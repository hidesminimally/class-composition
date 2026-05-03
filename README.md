# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Data Pipeline

The map data comes from a four-step ETL in `src/scripts/`:

### One-time setup

```bash
pip install census pandas geopandas pytest
```

Set your Census API key in `src/scripts/config.py` (free at https://api.census.gov/data/key_signup.html).

### Refresh the map

```bash
cd src/scripts

# 1. Fetch latest ACS (2018-2022 5-year)
python fetch_census.py --vintage 2020

# 2. (Optional, for change-over-time) Fetch 2008-2012 ACS
python fetch_census.py --vintage 2010

# 3. (One-time, for change-over-time) Fetch tract crosswalk
python fetch_crosswalk.py

# 4. (Optional) Drop your eviction CSV at data/evictions_input.csv (see data/evictions_input.csv.example)
python ingest_evictions.py

# 5. Merge everything into public/data.geojson
python process_data.py
```

### Eviction CSV schema

Drop a CSV at `data/evictions_input.csv` with columns:

| column | required | notes |
|---|---|---|
| `tract_id` | yes | 11-digit GEOID *or* 6-digit tract code |
| `eviction_filings` | yes | integer count of filings |
| `eviction_judgments` | no | integer |
| `year` | no | filter via `--year` flag if multi-year file |

Sources: TANC RAP scrape, Princeton Eviction Lab, Anti-Eviction Mapping Project, Social Explorer.

### Tests

```bash
cd ~/dev/class-composition
python -m pytest src/scripts/tests/ -v
```
