"""Run from the root with python -m uvicorn backend.server:app."""
from pathlib import Path
import sys

# Keep the original `cd backend; uvicorn server:app` command working.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend.product import create_app

app = create_app()
