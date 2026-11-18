"""Run real browser tests with an isolated, disposable PostgreSQL database."""

import os
import shutil
import subprocess
import sys
import time
import urllib.request
from uuid import uuid4
import psycopg2
from psycopg2 import sql
from argon2 import PasswordHasher
from dotenv import dotenv_values
from sqlalchemy.engine import make_url
from build_frontend import BUILD, ROOT, prepare


def main():
    config = dotenv_values(ROOT / ".env")
    value = os.getenv("TEST_ADMIN_DATABASE_URL") or config.get("MIGRATION_DATABASE_URL")
    if not value:
        raise SystemExit(
            "Set TEST_ADMIN_DATABASE_URL to a disposable PostgreSQL instance."
        )
    admin_url = make_url(value)
    db_name = "jobspace_e2e_" + uuid4().hex
    admin = psycopg2.connect(
        admin_url.set(drivername="postgresql", database="postgres").render_as_string(
            hide_password=False
        )
    )
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))
    env = os.environ.copy()
    test_url = admin_url.set(
        database=db_name, drivername="postgresql+psycopg2"
    ).render_as_string(hide_password=False)
    password = "disposable-browser-test-password"
    env.update(
        DATABASE_URL=test_url,
        MIGRATION_DATABASE_URL=test_url,
        APP_ORIGIN="http://localhost:8001",
        COOKIE_SECURE="false",
        OWNER_EMAIL="owner@example.com",
        OWNER_PASSWORD_HASH=PasswordHasher().hash(password),
        E2E_BASE_URL="http://localhost:8001",
        E2E_OWNER_PASSWORD=password,
        E2E_ARTIFACT_DIR=str(ROOT / ".local"),
    )
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    proc = None
    (ROOT / ".local").mkdir(exist_ok=True)
    try:
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=ROOT,
            env=env,
            check=True,
            creationflags=flags,
        )
        with (ROOT / ".local" / "e2e-server.log").open("w") as log:
            proc = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "tests.browser_app:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8001",
                ],
                cwd=ROOT,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
                creationflags=flags,
            )
        for _ in range(80):
            if proc.poll() is not None:
                raise RuntimeError("Test server exited. Check .local/e2e-server.log.")
            try:
                urllib.request.urlopen(
                    "http://localhost:8001/health/ready", timeout=1
                ).close()
                break
            except Exception:
                time.sleep(0.25)
        else:
            raise RuntimeError("Test server did not become ready.")
        prepare()
        npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
        result = subprocess.run(
            [npm, "run", "test:e2e"],
            cwd=BUILD,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=flags,
        )
        (ROOT / ".local" / "e2e-results.txt").write_text(
            result.stdout + result.stderr, encoding="utf-8"
        )
        print(result.stdout.encode("ascii", errors="replace").decode())
        result.check_returncode()
    finally:
        if proc:
            proc.terminate()
            proc.wait(timeout=15)
        assert db_name.startswith("jobspace_e2e_") and len(db_name) == 45
        with admin.cursor() as cur:
            cur.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(db_name))
            )
        admin.close()


if __name__ == "__main__":
    main()
