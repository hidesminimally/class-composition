"""
Pytest conftest.py at repo root.

Adds src/scripts/ to sys.path so that:
- `from src.scripts.ingest_evictions import ...` resolves the module, AND
- `import config` inside those modules finds config.py in src/scripts/.
"""
import sys
from pathlib import Path

# Make `src.scripts` importable as a package from repo root
sys.path.insert(0, str(Path(__file__).parent))

# Make `import config` work when src/scripts modules are imported
sys.path.insert(0, str(Path(__file__).parent / "src" / "scripts"))
