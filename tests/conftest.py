import os
from pathlib import Path
from uuid import uuid4
import pytest
import psycopg2
from psycopg2 import sql
from alembic import command
from alembic.config import Config
from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url
from backend.app import create_app
from backend.config import Settings
from backend.database import make_engine, session_factory
from backend.seed import seed

ROOT = Path(__file__).resolve().parent.parent
TEST_PASSWORD = "test-only-owner-password-2026"


@pytest.fixture
def database(monkeypatch):
    admin_url = os.getenv("TEST_ADMIN_DATABASE_URL")
    if not admin_url:
        pytest.skip(
            "Set TEST_ADMIN_DATABASE_URL to a disposable PostgreSQL instance with CREATE DATABASE privilege."
        )
    url = make_url(admin_url)
    admin = psycopg2.connect(
        url.set(drivername="postgresql", database="postgres").render_as_string(
            hide_password=False
        )
    )
    admin.autocommit = True
    name = "jobspace_test_" + uuid4().hex
    with admin.cursor() as cur:
        cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    test_url = url.set(
        drivername="postgresql+psycopg2", database=name
    ).render_as_string(hide_password=False)
    monkeypatch.setenv("MIGRATION_DATABASE_URL", test_url)
    engine = make_engine(test_url)
    yield engine, test_url
    engine.dispose()
    # Only drop the fresh, randomly named database this fixture created.
    assert name.startswith("jobspace_test_") and len(name) == 46
    with admin.cursor() as cur:
        cur.execute(
            sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name))
        )
    admin.close()


def migrate():
    config = Config(str(ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(ROOT / "migrations"))
    command.upgrade(config, "head")


@pytest.fixture
def system(database):
    engine, url = database
    migrate()
    from uuid import UUID

    settings = Settings(
        url,
        "http://localhost:8000",
        False,
        "owner@example.com",
        PasswordHasher().hash(TEST_PASSWORD),
        UUID("00000000-0000-4000-8000-000000000001"),
        8,
    )
    with session_factory(engine)() as db:
        seed(db, settings)
    app = create_app(settings, engine)
    with TestClient(
        app, base_url="http://localhost:8000", raise_server_exceptions=False
    ) as client:
        yield client, app, engine


@pytest.fixture
def owner(system):
    client, app, engine = system
    response = client.post(
        "/api/auth/login",
        headers={"Origin": "http://localhost:8000"},
        json={"email": "owner@example.com", "password": TEST_PASSWORD},
    )
    assert response.status_code == 200, response.text
    client.headers.update(
        {
            "Origin": "http://localhost:8000",
            "X-CSRF-Token": response.json()["csrf_token"],
        }
    )
    return client, app, engine
