from dataclasses import replace
from datetime import timedelta
from io import BytesIO
import json
from uuid import uuid4
import zipfile
import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy import create_engine, select
from backend.product import create_app
from backend.config import get_settings
from backend.database import session_factory
from backend.models import User, UserSession
from backend.resume_parser import extract, suggest, skills_in
from backend.discovery import SourceError, match, location_match
from backend.timeutils import utcnow
from tests.conftest import migrate

PASSWORD = "private-test-password-2026"
RESUME = b"Alex Example\nPython Developer\nSkills\nPython, SQL, FastAPI, Git\nExperience\nBackend Intern at Example Studio\nBuilt a small Python API.\nEducation\nComputer Science degree"
PROFILE = {
    "search_preferences": {
        "career_stage": "fresher",
        "professional_years": 0,
        "internship_months": 0,
        "strongest_skills": ["Python", "SQL"],
        "employment_types": ["full_time", "internship"],
        "workplace": "any",
        "include_senior": False,
    },
    "skills": ["Python", "SQL", "FastAPI", "Git"],
    "preferred_roles": ["Python Developer"],
    "experience": "Backend Intern at Example Studio",
    "location": "",
    "country": "in",
}


@pytest.fixture
def product(database):
    engine, url = database
    migrate()
    settings = replace(
        get_settings(),
        database_url=url,
        origin="http://localhost:8000",
        secure_cookie=False,
    )
    app = create_app(settings, engine)
    with TestClient(
        app, base_url=settings.origin, raise_server_exceptions=False
    ) as client:
        yield client, app, engine


def test_app_entrypoint_is_not_cached():
    engine = create_engine("sqlite://")
    app = create_app(replace(get_settings(), database_url="sqlite://"), engine)
    with TestClient(app) as client:
        response = client.get("/app")
    engine.dispose()
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"


def register(client, email="alex@example.com"):
    response = client.post(
        "/api/auth/register",
        headers={"Origin": "http://localhost:8000"},
        json={"full_name": "Alex Example", "email": email, "password": PASSWORD},
    )
    assert response.status_code == 201, response.text
    data = response.json()
    client.headers.update(
        {"Origin": "http://localhost:8000", "X-CSRF-Token": data["csrf_token"]}
    )
    return data


def upload(client):
    r = client.post(
        "/api/resumes?filename=resume.txt",
        content=RESUME,
        headers={"Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def new_job(client, **overrides):
    data = {
        "title": "Python Developer",
        "company": "Example Studio",
        "platform": "company careers",
        "job_url": "https://example.com/jobs/" + uuid4().hex,
        "description_raw": "Python and SQL",
        "location": "Remote",
        **overrides,
    }
    result = client.post("/api/jobs", json=data)
    assert result.status_code == 201, result.text
    return result.json(), data


def test_registration_private_default_and_recovery(product):
    client, app, engine = product
    for path in [
        "/api/jobs",
        "/jobs",
        "/api/applications",
        "/api/profile",
        "/api/statistics",
        "/api/applications/export",
    ]:
        assert client.get(path).status_code == 401, path
    data = register(client)
    assert client.get("/api/auth/session").json()["user"]["email"] == "alex@example.com"
    assert client.get("/api/statistics").json()["total"] == 0
    assert client.get("/api/jobs").json()["items"] == []
    assert (
        client.post(
            "/api/auth/register",
            json={
                "full_name": "Duplicate",
                "email": "ALEX@example.com",
                "password": PASSWORD,
            },
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/api/auth/recover",
            json={
                "email": "alex@example.com",
                "recovery_code": "bad",
                "new_password": PASSWORD,
            },
        ).status_code
        == 401
    )
    result = client.post(
        "/api/auth/recover",
        json={
            "email": "alex@example.com",
            "recovery_code": data["recovery_code"],
            "new_password": "changed-private-password",
        },
    )
    assert (
        result.status_code == 200
        and result.json()["recovery_code"] != data["recovery_code"]
    )
    assert not client.get("/api/auth/session").json()["authenticated"]
    assert (
        client.post(
            "/api/auth/login", json={"email": "alex@example.com", "password": PASSWORD}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "alex@example.com", "password": "changed-private-password"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/auth/recover",
            json={
                "email": "alex@example.com",
                "recovery_code": data["recovery_code"],
                "new_password": PASSWORD,
            },
        ).status_code
        == 401
    )


def test_resume_upload_review_and_download(product):
    client, app, engine = product
    register(client)
    assert (
        client.post("/api/discovery/search", json={"source": "greenhouse"}).status_code
        == 409
    )
    r = upload(client)
    assert r["skills"] == ["Python", "SQL", "FastAPI", "Git"] or set(
        r["skills"]
    ) == set(PROFILE["skills"])
    assert r["confirmed_at"] is None and "Backend Intern" in r["experience"]
    assert (
        client.post("/api/discovery/search", json={"source": "greenhouse"}).status_code
        == 409
    )
    result = client.put("/api/resumes/" + r["id"] + "/review", json=PROFILE)
    assert result.status_code == 200 and result.json()["confirmed_at"]
    assert client.get("/api/profile").json()["resume"]["preferred_roles"] == [
        "Python Developer"
    ]
    assert (
        client.get("/api/profile").json()["resume"]["search_preferences"][
            "career_stage"
        ]
        == "fresher"
    )
    from backend.models import Resume

    with session_factory(engine)() as db:
        from uuid import UUID

        old = db.get(Resume, UUID(r["id"]))
        old.search_preferences = None
        db.commit()
    assert (
        client.post("/api/discovery/search", json={"source": "greenhouse"}).status_code
        == 409
    )
    assert (
        client.put("/api/resumes/" + r["id"] + "/review", json=PROFILE).status_code
        == 200
    )
    assert client.get("/api/resumes/" + r["id"] + "/download").content == RESUME
    assert (
        client.post("/api/resumes?filename=bad.exe", content=b"bad").status_code == 422
    )
    assert (
        client.post("/api/resumes?filename=bad.pdf", content=b"bad").status_code == 422
    )
    assert (
        client.post(
            "/api/resumes?filename=big.txt", content=b"x" * (5 * 1024 * 1024 + 1)
        ).status_code
        == 413
    )
    assert client.delete("/api/resumes/" + r["id"]).status_code == 204
    assert client.get("/api/profile").json()["resume"] is None


def tailoring_model_output(rewrite="Built a small Python API."):
    return {
        "fit_summary": "Your resume shows Python API work relevant to this posting.",
        "keyword_review": [
            {
                "phrase": "Python",
                "priority": "required",
                "category": "technical",
                "job_evidence": "We require Python and SQL to build APIs.",
                "resume_evidence": "Python",
            }
        ],
        "skills_gaps": [],
        "experience_rewrites": [
            {
                "source_evidence": "Built a small Python API.",
                "rewritten_bullet": rewrite,
            }
        ],
        "ats_notes": ["The generated draft uses a plain-text, single-column layout."],
        "latex_source": (
            "\\documentclass{article}\n"
            "\\begin{document}\n"
            "\\section*{Skills}\nPython\n"
            "\\end{document}\n"
        ),
    }


def prepare_tailoring_case(client, app):
    register(client)
    resume = upload(client)
    assert (
        client.put("/api/resumes/" + resume["id"] + "/review", json=PROFILE).status_code
        == 200
    )
    job, _ = new_job(
        client,
        description_raw="We require Python and SQL to build APIs.",
    )
    app.state.settings = replace(
        app.state.settings,
        groq_api_key="test-key",
        groq_model="test-model",
        groq_zero_data_retention_confirmed=True,
    )
    return resume, job


def test_tailoring_requires_consent_and_configured_zdr(product, monkeypatch):
    client, app, _ = product
    _, job = prepare_tailoring_case(client, app)
    from backend import resume_tailoring

    def unexpected_call(*args, **kwargs):
        raise AssertionError("Provider must not be called without consent and ZDR.")

    monkeypatch.setattr(resume_tailoring.httpx, "post", unexpected_call)
    denied = client.post(
        f"/api/jobs/{job['id']}/tailor-resume",
        json={"external_processing_confirmed": False},
    )
    assert denied.status_code == 422
    assert "Confirm that your resume" in denied.json()["detail"]

    app.state.settings = replace(
        app.state.settings, groq_zero_data_retention_confirmed=False
    )
    unavailable = client.post(
        f"/api/jobs/{job['id']}/tailor-resume",
        json={"external_processing_confirmed": True},
    )
    assert unavailable.status_code == 503
    assert "Zero Data Retention" in unavailable.json()["detail"]

    app.state.settings = replace(
        app.state.settings, groq_model="", groq_zero_data_retention_confirmed=True
    )
    no_model = client.post(
        f"/api/jobs/{job['id']}/tailor-resume",
        json={"external_processing_confirmed": True},
    )
    assert no_model.status_code == 503
    assert "GROQ_MODEL" in no_model.json()["detail"]


def test_tailoring_returns_evidence_and_original_format_checks(product, monkeypatch):
    client, app, _ = product
    resume, job = prepare_tailoring_case(client, app)
    from backend import resume_tailoring

    received = {}

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(tailoring_model_output())
                        }
                    }
                ]
            }

    def mock_post(url, **kwargs):
        received["url"] = url
        received.update(kwargs)
        return Response()

    monkeypatch.setattr(resume_tailoring.httpx, "post", mock_post)
    response = client.post(
        f"/api/jobs/{job['id']}/tailor-resume",
        json={"external_processing_confirmed": True},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["resume_id"] == resume["id"]
    assert result["job_id"] == job["id"]
    assert result["keyword_review"][0]["resume_evidence"] == "Python"
    assert result["format_checks"] == {
        "complete_latex_document": True,
        "no_tables_graphics_or_columns": True,
        "safe_latex_commands_and_packages": True,
        "standard_section_heading_present": True,
    }
    assert any("sent to Groq" in warning for warning in result["warnings"])
    assert received["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert received["headers"]["Authorization"] == "Bearer test-key"
    user_prompt = received["json"]["messages"][1]["content"]
    assert "Built a small Python API." in user_prompt
    assert "We require Python and SQL to build APIs." in user_prompt


def test_tailoring_rejects_unsupported_experience_metrics(product, monkeypatch):
    client, app, _ = product
    _, job = prepare_tailoring_case(client, app)
    from backend import resume_tailoring

    class Response:
        status_code = 200

        @staticmethod
        def json():
            content = json.dumps(tailoring_model_output("Improved API performance by 25%."))
            return {"choices": [{"message": {"content": content}}]}

    monkeypatch.setattr(
        resume_tailoring.httpx,
        "post",
        lambda *args, **kwargs: Response(),
    )
    response = client.post(
        f"/api/jobs/{job['id']}/tailor-resume",
        json={"external_processing_confirmed": True},
    )
    assert response.status_code == 502
    assert "added a number" in response.json()["detail"]


def test_private_accounts_cannot_read_or_mutate_each_other(product):
    client, app, engine = product
    register(client)
    resume = upload(client)
    job, body = new_job(client)
    application = client.post(
        "/api/applications", json={"job_id": job["id"], "notes": "Private notes"}
    ).json()
    with TestClient(app, base_url="http://localhost:8000") as other:
        register(other, "other@example.com")
        for path in [
            "/api/jobs/" + job["id"],
            "/jobs/" + job["id"],
            "/api/applications/" + application["id"],
            "/api/applications/" + application["id"] + "/history",
            "/api/resumes/" + resume["id"] + "/download",
        ]:
            assert other.get(path).status_code == 404, path
        assert other.put("/api/jobs/" + job["id"], json=body).status_code == 404
        assert (
            other.patch(
                "/api/applications/" + application["id"], json={"notes": "Attack"}
            ).status_code
            == 404
        )
        assert (
            other.post("/api/applications", json={"job_id": job["id"]}).status_code
            == 404
        )
        assert (
            other.put(
                "/api/resumes/" + resume["id"] + "/review", json=PROFILE
            ).status_code
            == 404
        )
        assert other.delete("/api/resumes/" + resume["id"]).status_code == 404
        assert other.get("/api/jobs").json()["total"] == 0
        assert other.get("/api/statistics").json()["total"] == 0
        assert (
            load_workbook(
                BytesIO(other.get("/api/applications/export").content)
            ).active.max_row
            == 1
        )
        # Same external URL can be privately saved by two people without exposing their notes/content.
        assert other.post("/api/jobs", json=body).status_code == 201
    assert (
        client.get("/api/applications/" + application["id"]).json()["notes"]
        == "Private notes"
    )


def test_live_search_import_matching_and_idempotency(product):
    client, app, engine = product
    register(client)
    r = upload(client)
    client.put("/api/resumes/" + r["id"] + "/review", json=PROFILE)

    def fake_source(profile, source):
        return [
            {
                "platform": "greenhouse",
                "platform_job_id": "test:123",
                "company": "Real Source Fixture",
                "title": "Python Developer",
                "location": "Remote",
                "job_url": "https://example.com/opening/123",
                "description_raw": "Python, SQL, Docker",
                "source_kind": "greenhouse",
                "source_board": "test",
                "match": match(profile, "Python Developer", "Python SQL Docker"),
            }
        ], ["One source unavailable."]

    app.state.discover = fake_source
    result = client.post("/api/discovery/search", json={"source": "greenhouse"})
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["total"] == 1 and data["warnings"]
    job = data["items"][0]
    assert set(job["match_details"]["matched_skills"]) == {"Python", "SQL"}
    assert job["match_details"]["other_mentioned_skills"] == ["Docker"]
    assert job["match_score"] == 67 and job["editable"] is False
    assert (
        client.put(
            "/api/jobs/" + job["id"],
            json={
                "title": "Changed",
                "company": "Changed",
                "platform": "greenhouse",
                "job_url": job["job_url"],
            },
        ).status_code
        == 403
    )
    assert (
        client.post("/api/discovery/search", json={"source": "greenhouse"}).status_code
        == 429
    )
    with session_factory(engine)() as db:
        user = db.scalar(select(User).where(User.email == "alex@example.com"))
        user.last_search_at = None
        db.commit()
    assert (
        client.post("/api/discovery/search", json={"source": "greenhouse"}).json()[
            "total"
        ]
        == 1
    )
    assert client.get("/api/jobs").json()["total"] == 1
    # Legacy results cannot masquerade as current recommendations. Changing the
    # confirmed profile also invalidates a previously current saved match.
    assert client.get("/api/jobs/" + job["id"]).json()["match_is_current"] is False
    from backend.models import Resume, UserJob
    from backend.role_relevance import profile_fingerprint

    with session_factory(engine)() as db:
        membership = db.scalar(select(UserJob))
        profile = db.scalar(select(Resume))
        membership.match_details = {
            **membership.match_details,
            "matching_version": 8,
            "profile_fingerprint": profile_fingerprint(profile),
        }
        db.commit()
    assert client.get("/api/jobs/" + job["id"]).json()["match_is_current"] is False
    with session_factory(engine)() as db:
        membership = db.scalar(select(UserJob))
        membership.match_details = {
            **membership.match_details,
            "matching_version": 9,
        }
        db.commit()
    assert client.get("/api/jobs/" + job["id"]).json()["match_is_current"] is True
    changed = {**PROFILE, "location": "India"}
    assert (
        client.put("/api/resumes/" + r["id"] + "/review", json=changed).status_code
        == 200
    )
    assert client.get("/api/jobs/" + job["id"]).json()["match_is_current"] is False
    app.state.check_posting = lambda job: (_ for _ in ()).throw(
        SourceError("Posting unavailable")
    )
    assert client.post("/api/jobs/" + job["id"] + "/start").status_code == 409
    assert client.get("/api/applications").json()["total"] == 0


def test_apply_confirmation_history_and_export(product):
    client, app, engine = product
    register(client)
    resume = upload(client)
    client.put("/api/resumes/" + resume["id"] + "/review", json=PROFILE)
    job, _ = new_job(client, company="=SUM(1,2)")
    started = client.post("/api/jobs/" + job["id"] + "/start")
    assert started.status_code == 200, started.text
    application = started.json()["application"]
    base = "/api/applications/" + application["id"]
    assert (
        application["status"] == "application_started"
        and application["applied_at"] is None
    )
    assert application["resume_version_id"] == resume["id"]
    assert (
        client.post("/api/jobs/" + job["id"] + "/start").json()["application"]["id"]
        == application["id"]
    )
    assert len(client.get(base + "/history").json()) == 1
    assert client.post(base + "/confirm", json={"confirmed": False}).status_code == 422
    assert (
        client.post(base + "/confirm", json={"confirmed": True}).json()["status"]
        == "applied"
    )
    assert client.post(base + "/confirm", json={"confirmed": True}).status_code == 200
    assert len(client.get(base + "/history").json()) == 2
    assert (
        client.patch(
            base, json={"status": "interview", "notes": "Prepare SQL examples"}
        ).status_code
        == 200
    )
    assert len(client.get(base + "/history").json()) == 3
    assert client.get("/api/statistics?status=interview").json()["total"] == 1
    assert client.delete("/api/resumes/" + resume["id"]).status_code == 409
    sheet = load_workbook(
        BytesIO(client.get("/api/applications/export?status=interview").content)
    ).active
    assert (
        sheet.max_row == 2
        and sheet["A2"].data_type == "s"
        and sheet["A2"].value == "=SUM(1,2)"
    )


def test_new_auth_expiration_origin_and_throttle(product):
    client, app, engine = product
    register(client)
    assert (
        client.post(
            "/api/discovery/search",
            headers={"Origin": "https://evil.example"},
            json={"source": "greenhouse"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/discovery/search",
            headers={"X-CSRF-Token": "bad"},
            json={"source": "greenhouse"},
        ).status_code
        == 403
    )
    with session_factory(engine)() as db:
        for s in db.scalars(select(UserSession)):
            s.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/profile").status_code == 401
    for _ in range(10):
        assert (
            client.post(
                "/api/auth/login",
                json={"email": "alex@example.com", "password": "incorrect"},
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/api/auth/login", json={"email": "alex@example.com", "password": PASSWORD}
        ).status_code
        == 429
    )


def test_resume_text_docx_pdf_and_matching_rules():
    assert "Python" in extract("resume.txt", RESUME)
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as z:
        z.writestr(
            "word/document.xml",
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Python Developer with SQL and FastAPI experience</w:t></w:r></w:p></w:body></w:document>',
        )
    assert "FastAPI" in extract("resume.docx", buffer.getvalue())
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    page[NameObject("/Resources")] = DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
    )
    stream = DecodedStreamObject()
    stream.set_data(
        b"BT /F1 12 Tf 20 700 Td (Python Developer with SQL and FastAPI experience) Tj ET"
    )
    page[NameObject("/Contents")] = stream
    pdf = BytesIO()
    writer.write(pdf)
    assert "Python" in extract("resume.pdf", pdf.getvalue())
    assert "Java" not in skills_in("JavaScript developer")
    assert location_match("India", "Bengaluru")
    assert not location_match("India", "London")
    assert suggest(RESUME.decode())["preferred_roles"] == ["Python Developer"]


def test_source_error_does_not_create_fake_jobs(product):
    client, app, engine = product
    register(client)
    r = upload(client)
    client.put("/api/resumes/" + r["id"] + "/review", json=PROFILE)
    app.state.discover = lambda p, s: (_ for _ in ()).throw(
        SourceError("Provider temporarily unavailable")
    )
    result = client.post("/api/discovery/search", json={"source": "greenhouse"})
    assert result.status_code == 503 and client.get("/api/jobs").json()["total"] == 0


def test_fresher_search_filters_full_descriptions_and_persists_evidence(product):
    from backend.discovery import rank_postings

    client, app, engine = product
    register(client)
    resume = upload(client)
    assert (
        client.put("/api/resumes/" + resume["id"] + "/review", json=PROFILE).status_code
        == 200
    )
    statements = [
        "Exp: 5 - 10yrs",
        "2 years of professional experience required",
        "Minimum 6 months experience",
        "Strong production experience required",
        "No experience required.\nAbout us\nApplicants must have 3 years experience.",
        "Recent graduates (including Summer 2026) or professionals with up to 18 months of experience.",
    ]
    posts = [
        {
            "platform": "greenhouse",
            "platform_job_id": f"strict:{i}",
            "company": "Experience Test Employer",
            "title": "Python Developer",
            "location": "Bengaluru, India",
            "job_url": f"https://example.com/strict/{i}",
            "description_raw": "Full-time.\nRequirements\nPython and SQL required.\n"
            + statement,
            "source_kind": "greenhouse",
            "source_board": "strict",
        }
        for i, statement in enumerate(statements)
    ]
    app.state.discover = lambda profile, source: (rank_postings(profile, posts), [])
    response = client.post("/api/discovery/search", json={"source": "greenhouse"})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total"] == 1
    job = data["items"][0]
    assert job["job_url"].endswith("/5") and job["match_is_current"] is True
    assert job["description_raw"] == posts[5]["description_raw"]
    expected = {"kind": "fresher_eligibility", "text": statements[5]}
    assert expected in job["match_details"]["requirement_evidence"]
    reloaded = client.get("/api/jobs/" + job["id"]).json()
    assert expected in reloaded["match_details"]["requirement_evidence"]
    assert client.get("/api/jobs").json()["total"] == 1


def test_search_uses_new_resume_and_changed_inputs_not_cached_results(product):
    from backend.discovery import rank_postings

    client, app, engine = product
    register(client)
    first = upload(client)
    first = client.put("/api/resumes/" + first["id"] + "/review", json=PROFILE).json()
    posts = [
        {
            "platform": "greenhouse",
            "platform_job_id": f"inputs:{language}",
            "company": "Input Test",
            "title": language + " Developer",
            "location": "India",
            "job_url": "https://example.com/input/" + language,
            "description_raw": f"Full-time.\nRequirements\n{language} required.\nSQL is optional.\nNo experience required.",
            "source_kind": "greenhouse",
            "source_board": "inputs",
        }
        for language in ["Python", "Java"]
    ]
    seen = []

    def source(profile, provider):
        seen.append(str(profile.id))
        return rank_postings(profile, posts), []

    app.state.discover = source
    old_request = {
        "source": "greenhouse",
        "resume_id": first["id"],
        "profile_fingerprint": first["profile_fingerprint"],
    }
    response = client.post("/api/discovery/search", json=old_request)
    assert response.status_code == 200, response.text
    assert [j["title"] for j in response.json()["items"]] == ["Python Developer"]
    assert client.post("/api/discovery/search", json=old_request).status_code == 429
    second = upload(client)
    assert (
        client.post("/api/discovery/search", json={"source": "greenhouse"}).status_code
        == 409
    )
    java = {
        **PROFILE,
        "skills": ["Java"],
        "preferred_roles": ["Java Developer"],
        "search_preferences": {
            **PROFILE["search_preferences"],
            "strongest_skills": ["Java"],
        },
    }
    second = client.put("/api/resumes/" + second["id"] + "/review", json=java).json()
    assert client.post("/api/discovery/search", json=old_request).status_code == 409
    new_request = {
        "source": "greenhouse",
        "resume_id": second["id"],
        "profile_fingerprint": second["profile_fingerprint"],
    }
    response = client.post("/api/discovery/search", json=new_request)
    assert response.status_code == 200, response.text
    assert [j["title"] for j in response.json()["items"]] == ["Java Developer"]
    assert response.json()["search_profile"]["resume_id"] == second["id"]
    assert response.json()["items"][0]["match_details"]["resume_id"] == second["id"]
    assert seen == [first["id"], second["id"]]
    assert client.get("/api/profile").json()["resume"]["id"] == second["id"]
    assert (
        client.get("/api/jobs").json()["total"] == 2
    )  # History, not fresh search results.
    # Same version, changed preferences: real zero-result output, no previous cards returned.
    changed = {**java, "location": "London"}
    client.put("/api/resumes/" + second["id"] + "/review", json=changed)
    response = client.post("/api/discovery/search", json={"source": "greenhouse"})
    assert response.status_code == 200 and response.json()["items"] == []
    assert response.json()["search_profile"]["location"] == "London"


def test_profile_change_during_provider_request_rejects_obsolete_output(product):
    from backend.models import Resume

    client, app, engine = product
    register(client)
    resume = upload(client)
    client.put("/api/resumes/" + resume["id"] + "/review", json=PROFILE)

    def changing_source(profile, provider):
        with session_factory(engine)() as db:
            stored = db.get(Resume, profile.id)
            stored.location = "London"
            db.commit()
        return [], []

    app.state.discover = changing_source
    response = client.post("/api/discovery/search", json={"source": "greenhouse"})
    assert (
        response.status_code == 409 and "during the search" in response.json()["detail"]
    )
    assert client.get("/api/jobs").json()["total"] == 0


def test_search_returns_partial_ai_skill_matches_with_review_labels(product):
    from backend.discovery import rank_postings

    client, app, engine = product
    register(client)
    resume = upload(client)
    priority_skills = ["Python", "LangChain", "RAG", "LLMs"]
    payload = {
        **PROFILE,
        "preferred_roles": ["Software Engineer"],
        "skills": [*priority_skills, "SQL"],
        "search_preferences": {
            **PROFILE["search_preferences"],
            "strongest_skills": priority_skills,
        },
    }
    assert (
        client.put("/api/resumes/" + resume["id"] + "/review", json=payload).status_code
        == 200
    )
    bodies = [
        "SQL required.",
        "Python required.",
        "Python and LangChain required.",
        "Python, LangChain and RAG required.",
        "Python, LangChain, retrieval-augmented generation and large language models required.",
    ]
    posts = [
        {
            "platform": "greenhouse",
            "platform_job_id": f"ai:{i}",
            "company": "AI Test",
            "title": "Software Engineer",
            "location": "India",
            "job_url": f"https://example.com/ai/{i}",
            "source_kind": "greenhouse",
            "source_board": "ai",
            "description_raw": "Full-time.\nRequirements\n"
            + body
            + "\nNo experience required.",
        }
        for i, body in enumerate(bodies)
    ]
    app.state.discover = lambda profile, source: (rank_postings(profile, posts), [])
    response = client.post("/api/discovery/search", json={"source": "greenhouse"})
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert len(items) == 5
    by_url = {item["job_url"]: item for item in items}
    zero_coverage = by_url["https://example.com/ai/0"]["match_details"]
    one_skill = by_url["https://example.com/ai/1"]["match_details"]
    two_skills = by_url["https://example.com/ai/2"]["match_details"]
    threshold = by_url["https://example.com/ai/3"]["match_details"]
    all_skills = by_url["https://example.com/ai/4"]["match_details"]
    assert zero_coverage["classification"] == "needs_review"
    assert zero_coverage["priority_skill_coverage"] == 0
    assert one_skill["classification"] == "needs_review"
    assert one_skill["priority_skill_coverage"] == 25
    assert two_skills["classification"] == "needs_review"
    assert two_skills["priority_skill_coverage"] == 50
    assert threshold["classification"] == "recommended"
    assert threshold["priority_skill_coverage"] == 75
    assert all_skills["classification"] == "recommended"
    reloaded = client.get("/api/jobs/" + by_url["https://example.com/ai/4"]["id"]).json()
    assert set(reloaded["match_details"]["matched_skills"]) == set(priority_skills)
    assert reloaded["match_is_current"] is True


def test_ashby_search_persists_paid_internship_and_cache(product, monkeypatch):
    from backend import discovery
    from backend.models import JobBoardCache

    client, app, engine = product
    register(client)
    resume = upload(client)
    settings = {
        **PROFILE,
        "search_preferences": {
            **PROFILE["search_preferences"],
            "employment_types": ["internship"],
            "internship_pay": "paid",
        },
    }
    assert (
        client.put(
            "/api/resumes/" + resume["id"] + "/review", json=settings
        ).status_code
        == 200
    )
    monkeypatch.setenv("ASHBY_BOARDS", "example")
    post = {
        "platform": "ashby",
        "platform_job_id": "example:123",
        "company": "Example",
        "title": "Python Developer",
        "location": "Bengaluru, India",
        "job_url": "https://jobs.ashbyhq.com/example/123",
        "description_raw": "Requirements\nPython and SQL required.\nNo experience required.",
        "source_kind": "ashby",
        "source_board": "example",
        "employment_type": "internship",
        "compensation": {
            "summaryComponents": [
                {
                    "compensationType": "Salary",
                    "minValue": 10000,
                    "currencyCode": "INR",
                    "interval": "1 MONTH",
                }
            ]
        },
    }
    calls = []

    def fetch(board):
        calls.append(board)
        return [
            post,
            {
                **post,
                "platform_job_id": "example:unknown",
                "job_url": "https://jobs.ashbyhq.com/example/unknown",
                "compensation": None,
            },
        ]

    monkeypatch.setattr(discovery, "fetch_ashby_board", fetch)
    response = client.post("/api/discovery/search", json={"source": "ashby"})
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert len(items) == 1 and items[0]["source_kind"] == "ashby"
    assert items[0]["match_details"]["internship_pay"] == "paid"
    assert "compensation" not in items[0]
    assert client.get("/api/jobs/" + items[0]["id"]).json()["match_details"][
        "pay_evidence"
    ]
    assert (
        client.get("/api/profile").json()["resume"]["search_preferences"][
            "internship_pay"
        ]
        == "paid"
    )
    with session_factory(engine)() as db:
        assert db.get(JobBoardCache, "ashby:example") is not None
    assert calls == ["example"]
    # Reproduce partial skill coverage against a usable but stale startup snapshot.
    with session_factory(engine)() as db:
        db.get(JobBoardCache, "ashby:example").fetched_at = utcnow() - timedelta(
            minutes=20
        )
        db.commit()
    changed = {
        **settings,
        "skills": settings["skills"] + ["Codex"],
        "search_preferences": {
            **settings["search_preferences"],
            "strongest_skills": ["Python", "Codex"],
        },
    }
    client.put("/api/resumes/" + resume["id"] + "/review", json=changed)
    partial = client.post("/api/discovery/search", json={"source": "ashby"})
    assert partial.status_code == 200, partial.text
    body = partial.json()
    assert len(body["items"]) == 1 and body["diagnostics"]["postings_checked"] == 2
    assert body["items"][0]["match_details"]["classification"] == "needs_review"
    assert body["items"][0]["match_details"]["priority_skill_coverage"] == 50
    assert body["diagnostics"]["all_priority_skills_matches"] == 0
    assert body["diagnostics"]["priority_skill_coverage"]["codex"] == 0
    assert any("using saved listings" in w for w in body["warnings"])
    assert (
        client.get("/api/jobs").json()["total"] == 1
    )  # Prior history retained, not new results.
