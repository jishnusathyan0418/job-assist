"""Windows local demo: an isolated PostgreSQL cluster, never your learning database."""

import argparse
import os
from pathlib import Path
import secrets
import socket
import subprocess
import time

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / ".local"
PGDATA = Path(os.environ.get("LOCALAPPDATA", str(LOCAL))) / "Jobspace" / "pgdata"
PYTHON = ROOT / ".venv" / "Scripts" / "python.exe"
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def run(args, **kwargs):
    subprocess.run(
        [str(a) for a in args], cwd=ROOT, check=True, creationflags=FLAGS, **kwargs
    )


def pg_bin():
    candidates = sorted(
        Path("C:/Program Files/PostgreSQL").glob("*/bin/pg_ctl.exe"), reverse=True
    )
    if not candidates:
        raise SystemExit(
            "Install PostgreSQL for Windows, or use the manual setup in README.md."
        )
    return candidates[0].parent


def start_database():
    binary = pg_bin()
    status = subprocess.run(
        [str(binary / "pg_ctl.exe"), "-D", str(PGDATA), "status"],
        capture_output=True,
        creationflags=FLAGS,
    )
    if status.returncode:
        with socket.socket() as sock:
            if sock.connect_ex(("127.0.0.1", 55432)) == 0:
                raise SystemExit(
                    "Port 55432 is in use by another process. No changes made."
                )
        run(
            [
                binary / "pg_ctl.exe",
                "-D",
                PGDATA,
                "-l",
                LOCAL / "postgres.log",
                "-o",
                "-p 55432 -h 127.0.0.1",
                "-w",
                "start",
            ]
        )


def setup():
    import psycopg2
    from psycopg2 import sql
    from dotenv import dotenv_values

    LOCAL.mkdir(exist_ok=True)
    PGDATA.parent.mkdir(parents=True, exist_ok=True)
    env_path = ROOT / ".env"
    if not PGDATA.exists():
        if env_path.exists():
            raise SystemExit(
                "Root .env already exists. Follow manual setup; this helper will not replace configuration."
            )
        admin_password = secrets.token_urlsafe(32)
        password_path = LOCAL / "pg-admin-password"
        password_path.write_text(admin_password, encoding="utf-8")
        with (LOCAL / "initdb.log").open("w") as log:
            run(
                [
                    pg_bin() / "initdb.exe",
                    "-D",
                    PGDATA,
                    "-U",
                    "demo_admin",
                    "--auth=scram-sha-256",
                    "--pwfile",
                    password_path,
                    "--encoding=UTF8",
                    "--locale=C",
                ],
                stdout=log,
                stderr=subprocess.STDOUT,
            )
        start_database()
        app_password = secrets.token_urlsafe(32)
        admin = psycopg2.connect(
            host="127.0.0.1",
            port=55432,
            user="demo_admin",
            password=admin_password,
            dbname="postgres",
        )
        admin.autocommit = True
        with admin.cursor() as cur:
            cur.execute(
                sql.SQL("CREATE ROLE job_demo LOGIN PASSWORD {}").format(
                    sql.Literal(app_password)
                )
            )
            cur.execute("CREATE DATABASE job_demo")
        admin.close()
        env_path.write_text(
            "\n".join(
                [
                    f"DATABASE_URL=postgresql+psycopg2://job_demo:{app_password}@127.0.0.1:55432/job_demo",
                    f"MIGRATION_DATABASE_URL=postgresql+psycopg2://demo_admin:{admin_password}@127.0.0.1:55432/job_demo",
                    "APP_ORIGIN=http://localhost:8000",
                    "COOKIE_SECURE=false",
                    "SESSION_HOURS=8",
                    "",
                ]
            ),
            encoding="utf-8",
        )
    else:
        start_database()
    run([PYTHON, "-m", "alembic", "upgrade", "head"])
    config = dotenv_values(env_path)
    conn = psycopg2.connect(
        config["MIGRATION_DATABASE_URL"].replace(
            "postgresql+psycopg2://", "postgresql://"
        )
    )
    with conn, conn.cursor() as cur:
        cur.execute("GRANT CONNECT ON DATABASE job_demo TO job_demo")
        cur.execute("GRANT USAGE ON SCHEMA public TO job_demo")
        cur.execute(
            "GRANT SELECT, INSERT, UPDATE, DELETE ON users, jobs, applications, application_status_history, owner_sessions, login_attempts, resumes, user_jobs, user_sessions, auth_attempts, job_board_cache TO job_demo"
        )
    conn.close()
    print("Local database ready. Open the app and select Create account.")


def start():
    import urllib.request
    from urllib.parse import urlsplit
    from dotenv import dotenv_values

    origin = dotenv_values(ROOT / ".env").get("APP_ORIGIN", "http://localhost:8000")
    port = urlsplit(origin).port or 8000
    start_database()
    with socket.socket() as sock:
        if sock.connect_ex(("127.0.0.1", port)) == 0:
            print(
                f"Port {port} is already serving. Open {origin}/app if it is this demo."
            )
            return
    log = (LOCAL / "server.log").open("a")
    proc = subprocess.Popen(
        [
            str(PYTHON),
            "-m",
            "uvicorn",
            "backend.server:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=ROOT,
        stdout=log,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        creationflags=FLAGS,
    )
    (LOCAL / "server.pid").write_text(str(proc.pid))
    log.close()
    for _ in range(40):
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/health/ready", timeout=1
            ) as response:
                if response.status == 200:
                    print(f"Demo running: {origin}/app")
                    return
        except Exception:
            time.sleep(0.25)
    raise SystemExit("Server did not become ready. Check .local/server.log.")


def stop():
    # Only target the recorded PID if it is still this exact Python/server command.
    pid_path = LOCAL / "server.pid"
    if pid_path.exists():
        pid = int(pid_path.read_text())
        command = f"$p = Get-CimInstance Win32_Process -Filter 'ProcessId = {pid}'; if ($p -and $p.ExecutablePath -eq '{str(PYTHON).replace(chr(39), chr(39) * 2)}' -and $p.CommandLine -match 'backend.server:app') {{ Stop-Process -Id {pid} }}"
        run(["powershell.exe", "-NoProfile", "-Command", command])
    run([pg_bin() / "pg_ctl.exe", "-D", PGDATA, "-m", "fast", "stop"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["setup", "start", "stop"])
    args = parser.parse_args()
    {"setup": setup, "start": start, "stop": stop}[args.command]()
