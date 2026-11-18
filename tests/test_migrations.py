from pathlib import Path
from uuid import uuid4
import pytest
from sqlalchemy import inspect, text
from tests.conftest import migrate


def test_fresh_database_and_repeat_upgrade(database):
    engine, _ = database
    migrate()
    migrate()
    assert set(
        [
            "jobs",
            "users",
            "applications",
            "application_status_history",
            "owner_sessions",
            "login_attempts",
        ]
    ).issubset(inspect(engine).get_table_names())


def legacy_database(engine):
    fixture = Path(__file__).parent / "fixtures" / "legacy_schema.sql"
    with engine.begin() as conn:
        conn.execute(text(fixture.read_text(encoding="utf-8")))
        user_id, job_id, application_id = str(uuid4()), str(uuid4()), str(uuid4())
        conn.execute(
            text(
                "INSERT INTO users (id,email,full_name) VALUES (:id,'legacy@example.invalid','Preserved User')"
            ),
            {"id": user_id},
        )
        conn.execute(
            text(
                "INSERT INTO jobs (id,platform,platform_job_id,company,title,job_url) VALUES (:id,'legacy','posting-1','Preserved Company','Preserved Job','https://example.invalid/legacy')"
            ),
            {"id": job_id},
        )
        conn.execute(
            text(
                "INSERT INTO applications (id,user_id,job_id,status,notes) VALUES (:id,:user,:job,'applied','Preserve these notes')"
            ),
            {"id": application_id, "user": user_id, "job": job_id},
        )
    return job_id, application_id


def test_adopts_copy_of_existing_schema_without_data_loss(database):
    engine, _ = database
    job_id, application_id = legacy_database(engine)
    migrate()
    with engine.connect() as conn:
        assert conn.execute(
            text("SELECT title,is_demo FROM jobs WHERE id=:id"), {"id": job_id}
        ).one() == ("Preserved Job", False)
        assert (
            conn.execute(
                text("SELECT notes FROM applications WHERE id=:id"),
                {"id": application_id},
            ).scalar()
            == "Preserve these notes"
        )
        assert conn.execute(text("SELECT count(*) FROM users")).scalar() == 1


def test_duplicate_adoption_aborts_without_partial_changes(database):
    engine, _ = database
    legacy_database(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO jobs(id,platform,platform_job_id,company,title,job_url) VALUES (:id,'legacy','posting-1','Duplicate','Other','https://example.invalid/duplicate')"
            ),
            {"id": str(uuid4())},
        )
    with pytest.raises(RuntimeError, match="Duplicate"):
        migrate()
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM jobs")).scalar() == 2
    assert "is_demo" not in {c["name"] for c in inspect(engine).get_columns("jobs")}


def test_incompatible_schema_aborts(database):
    engine, _ = database
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE jobs (id integer PRIMARY KEY)"))
    with pytest.raises(RuntimeError, match="Incompatible"):
        migrate()
    assert "users" not in inspect(engine).get_table_names()
