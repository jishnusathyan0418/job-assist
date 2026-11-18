from backend.timeutils import utcnow
import io
from datetime import timedelta
from uuid import uuid4
from openpyxl import load_workbook
from sqlalchemy import event, select
from backend.database import session_factory
from backend.models import Application, Job, OwnerSession, StatusHistory, User
from backend.seed import seed
from tests.conftest import TEST_PASSWORD


def payload(**overrides):
    return {
        "company": "Test Fictional Company",
        "title": "Python Developer",
        "platform": "Company Careers",
        "job_url": "https://example.invalid/test-" + uuid4().hex,
        "location": "Remote",
        "description_raw": "Fictional only.",
        **overrides,
    }


def test_job_workflow_and_duplicates(owner):
    client, _, _ = owner
    data = payload(platform_job_id="abc-123")
    created = client.post("/api/jobs", json=data)
    assert created.status_code == 201
    job = created.json()
    assert job["platform"] == "company careers"
    assert client.post("/api/jobs", json=data).status_code == 409
    assert (
        client.post(
            "/api/jobs", json={**data, "job_url": "https://example.invalid/other"}
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/api/jobs",
            json={
                **data,
                "platform": "another",
                "job_url": "https://example.invalid/other",
            },
        ).status_code
        == 201
    )
    assert (
        client.put(
            "/api/jobs/" + job["id"], json={**data, "title": "Updated title"}
        ).status_code
        == 200
    )
    result = client.get(
        "/api/jobs", params={"q": "Updated title", "location": "Remote", "limit": 1}
    ).json()
    assert result["total"] == 1 and result["items"][0]["id"] == job["id"]
    assert client.get("/api/jobs?limit=1&offset=1").json()["offset"] == 1
    assert isinstance(client.get("/jobs").json(), list)
    assert client.get("/jobs/" + job["id"]).status_code == 200
    assert client.get("/api/jobs/" + str(uuid4())).status_code == 404
    assert client.get("/api/jobs/not-a-uuid").status_code == 422
    assert client.get("/api/jobs?limit=0").status_code == 422
    assert (
        client.post(
            "/api/jobs", json=payload(job_url="javascript:alert(1)")
        ).status_code
        == 422
    )
    assert client.post("/api/jobs", json=payload(company=" ")).status_code == 422
    assert client.get("/api/jobs?q=not-present-anywhere").json()["items"] == []
    assert client.get("/api/jobs?q=%25").json()["items"] == []


def test_application_history_persistence_and_filters(owner):
    client, _, engine = owner
    job = client.post("/api/jobs", json=payload()).json()
    created = client.post(
        "/api/applications",
        json={"job_id": job["id"], "status": "applied", "notes": "First note"},
    )
    assert created.status_code == 201
    app = created.json()
    path = "/api/applications/" + app["id"]
    assert app["applied_at"] is not None
    assert (
        client.post("/api/applications", json={"job_id": job["id"]}).status_code == 409
    )
    assert (
        client.patch(
            path, json={"status": "interview", "notes": "Prepare SQL examples"}
        ).status_code
        == 200
    )
    assert client.patch(path, json={"notes": "Updated notes"}).status_code == 200
    history = client.get(path + "/history").json()
    assert [h["status"] for h in history] == ["applied", "interview"]
    assert history[1]["previous_status"] == "applied"
    assert client.get(path).json()["notes"] == "Updated notes"
    assert client.patch(path, json={"status": "invented"}).status_code == 422
    assert client.patch(path, json={"status": None}).status_code == 422
    assert (
        client.patch(
            path, json={"applied_at": (utcnow() + timedelta(days=1)).isoformat()}
        ).status_code
        == 422
    )
    assert (
        client.get("/api/applications?status=interview&company=Test Fictional").json()[
            "total"
        ]
        == 1
    )
    assert (
        client.get(
            "/api/applications?date_from=2026-02-02&date_to=2026-01-01"
        ).status_code
        == 422
    )
    with session_factory(engine)() as db:
        stored = db.get(Application, app["id"])
        assert stored.status == "interview" and stored.notes == "Updated notes"
        assert db.get(Job, job["id"]).status == "discovered"


def test_history_failure_rolls_back_status(owner):
    client, _, engine = owner
    application = client.get("/api/applications?limit=1").json()["items"][0]

    def fail_history(mapper, connection, target):
        raise RuntimeError("Simulated history write failure")

    event.listen(StatusHistory, "before_insert", fail_history)
    try:
        response = client.patch(
            "/api/applications/" + application["id"], json={"status": "withdrawn"}
        )
        assert response.status_code == 500
    finally:
        event.remove(StatusHistory, "before_insert", fail_history)
    with session_factory(engine)() as db:
        assert db.get(Application, application["id"]).status == application["status"]


def test_statistics_and_excel_match_filters(owner):
    client, _, _ = owner
    job = client.post(
        "/api/jobs", json=payload(company='=HYPERLINK("https://example.invalid")')
    ).json()
    client.post(
        "/api/applications",
        json={"job_id": job["id"], "status": "applied", "notes": "+SUM(1,2)"},
    )
    params = {"company": "=HYPERLINK"}
    rows = client.get("/api/applications", params=params).json()
    stats = client.get("/api/statistics", params=params).json()
    assert stats["total"] == rows["total"] == 1 and stats["by_status"]["applied"] == 1
    assert sum(client.get("/api/statistics").json()["by_status"].values()) == 11
    export = client.get("/api/applications/export", params=params)
    assert export.status_code == 200
    sheet = load_workbook(io.BytesIO(export.content)).active
    assert (
        sheet.max_row == 2
        and sheet["A2"].data_type == "s"
        and sheet["H2"].data_type == "s"
    )
    assert (
        sheet["A2"].value.startswith("=HYPERLINK") and sheet["H2"].value == "+SUM(1,2)"
    )
    empty = load_workbook(
        io.BytesIO(client.get("/api/applications/export?q=unfindable").content)
    ).active
    assert empty.max_row == 1
    today = utcnow().date().isoformat()
    assert (
        client.get(
            "/api/statistics", params={**params, "date_from": today, "date_to": today}
        ).json()["total"]
        == 1
    )


def test_public_data_isolation_and_write_denial(system):
    client, app, engine = system
    with session_factory(engine)() as db:
        person = User(email="private@example.invalid", full_name="Private person")
        job = Job(**payload(company="PRIVATE COMPANY"), is_demo=False)
        db.add_all([person, job])
        db.flush()
        private = Application(
            user_id=person.id, job_id=job.id, status="applied", notes="PRIVATE NOTES"
        )
        db.add(private)
        db.commit()
        private_job_id, private_app_id = str(job.id), str(private.id)
    for path in ["/jobs", "/api/jobs", "/api/applications", "/api/statistics"]:
        body = client.get(path).text
        assert (
            "PRIVATE" not in body
            and "private@example" not in body
            and "user_id" not in body
        )
    assert client.get("/jobs/" + private_job_id).status_code == 404
    assert client.get("/api/jobs/" + private_job_id).status_code == 404
    assert client.get("/api/applications/" + private_app_id).status_code == 404
    assert (
        client.get("/api/applications/" + private_app_id + "/history").status_code
        == 404
    )
    job_id = client.get("/api/jobs?limit=1").json()["items"][0]["id"]
    app_id = client.get("/api/applications?limit=1").json()["items"][0]["id"]
    assert client.post("/api/jobs", json=payload()).status_code == 401
    assert client.put("/api/jobs/" + job_id, json=payload()).status_code == 401
    assert client.post("/api/applications", json={"job_id": job_id}).status_code == 401
    assert (
        client.patch(
            "/api/applications/" + app_id, json={"status": "offer"}
        ).status_code
        == 401
    )
    assert client.get("/api/auth/session").json() == {
        "authenticated": False,
        "csrf_token": None,
    }


def test_auth_csrf_expiry_and_logout(owner):
    client, _, engine = owner
    response = client.get("/api/auth/session")
    assert response.headers["cache-control"] == "no-store"
    assert response.json()["authenticated"]
    assert (
        client.post(
            "/api/jobs", json=payload(), headers={"Origin": "https://evil.invalid"}
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/jobs", json=payload(), headers={"X-CSRF-Token": "bad"}
        ).status_code
        == 403
    )
    assert client.post("/api/auth/logout").status_code == 204
    assert not client.get("/api/auth/session").json()["authenticated"]
    login = client.post(
        "/api/auth/login",
        json={"email": "owner@example.com", "password": TEST_PASSWORD},
    )
    assert (
        "HttpOnly" in login.headers["set-cookie"]
        and "SameSite=strict" in login.headers["set-cookie"]
    )
    with session_factory(engine)() as db:
        for session in db.scalars(select(OwnerSession)):
            session.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert not client.get("/api/auth/session").json()["authenticated"]
    assert client.post("/api/jobs", json=payload()).status_code == 401


def test_login_limit_and_safe_validation(system):
    client, _, _ = system
    for _ in range(10):
        result = client.post(
            "/api/auth/login",
            headers={"Origin": "http://localhost:8000"},
            json={"email": "owner@example.com", "password": "wrong"},
        )
        assert result.status_code == 401
    assert (
        client.post(
            "/api/auth/login",
            headers={"Origin": "http://localhost:8000"},
            json={"email": "owner@example.com", "password": TEST_PASSWORD},
        ).status_code
        == 429
    )
    secret = "never-echo-this-password"
    response = client.post(
        "/api/auth/login", json={"email": "x", "password": secret, "unexpected": secret}
    )
    assert response.status_code == 422 and secret not in response.text


def test_seed_is_idempotent_and_preserves_edits(owner):
    client, app, engine = owner
    application = client.get("/api/applications?limit=1").json()["items"][0]
    client.patch(
        "/api/applications/" + application["id"], json={"notes": "Keep this edit"}
    )
    with session_factory(engine)() as db:
        seed(db, app.state.settings)
        seed(db, app.state.settings)
    assert client.get("/api/jobs").json()["total"] == 15
    assert client.get("/api/applications").json()["total"] == 10
    assert (
        client.get("/api/applications/" + application["id"]).json()["notes"]
        == "Keep this edit"
    )


def test_database_failure_is_safe(system):
    client, _, engine = system

    def fail_connection(conn, cursor, statement, parameters, context, executemany):
        from sqlalchemy.exc import OperationalError

        raise OperationalError(
            "secret SQL", "secret params", Exception("secret password")
        )

    event.listen(engine, "before_cursor_execute", fail_connection)
    try:
        response = client.get("/api/jobs")
        assert response.status_code == 503 and "secret" not in response.text
        assert client.get("/health/ready").status_code == 503
    finally:
        event.remove(engine, "before_cursor_execute", fail_connection)
    assert client.get("/health/live").status_code == 200
