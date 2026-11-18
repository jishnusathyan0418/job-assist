"""Hosted startup: optional explicit bootstrap, then serve as an unprivileged OS user."""

import os
import subprocess
import sys

if os.getenv("RUN_MIGRATIONS", "false").lower() == "true":
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
os.execvp(
    sys.executable,
    [
        sys.executable,
        "-m",
        "uvicorn",
        "backend.server:app",
        "--host",
        "0.0.0.0",
        "--port",
        os.getenv("PORT", "8000"),
    ],
)
