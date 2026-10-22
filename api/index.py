"""Vercel Python serverless entry point: exposes the Django WSGI app.

vercel.json rewrites /api/* here; Django's URLconf then routes /api/plan,
/api/geocode and /api/health.
"""
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from config.wsgi import application  # noqa: E402

app = application
