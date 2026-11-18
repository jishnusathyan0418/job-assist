from tests.test_product import product, register, upload, PROFILE  # noqa: F401
from backend.job_catalog import JobCatalog


def test_combined_lever_import_tracks_reviewed_resume_and_optional_requirements(
    request, monkeypatch
):
    client, app, engine = request.getfixturevalue("product")
    register(client)
    resume = upload(client)
    posting = {
        "platform": "lever",
        "platform_job_id": "meesho:fixture",
        "company": "Fixture Employer",
        "title": "Python Developer",
        "location": "Bengaluru, India",
        "job_url": "https://jobs.lever.co/meesho/fixture",
        "description_raw": "Full-time. Requirements\nPython and SQL required. No experience required.",
        "source_kind": "lever",
        "source_board": "meesho",
        "employment_type": "full_time",
    }
    monkeypatch.setenv("LEVER_BOARDS", "meesho")
    monkeypatch.setattr(
        JobCatalog,
        "read_postings",
        lambda c: ([posting] if c.source == "lever" else [], []),
    )
    monkeypatch.setattr(JobCatalog, "refresh_due", lambda *a: None)
    reviewed = {
        **PROFILE,
        "skills": [*PROFILE["skills"], "Codex"],
        "search_preferences": {
            **PROFILE["search_preferences"],
            "strongest_skills": ["Codex"],
        },
    }
    path = "/api/resumes/" + resume["id"] + "/review"
    assert client.put(path, json=reviewed).status_code == 200
    first = client.post("/api/discovery/search", json={"source": "all"})
    assert first.status_code == 200
    first_job = first.json()["items"][0]
    assert first.json()["total"] == 1
    assert first_job["match_details"]["classification"] == "needs_review"
    assert first_job["match_details"]["priority_skill_coverage"] == 0
    assert first_job["match_details"]["missing_priority_skills"] == ["codex"]
    reviewed["search_preferences"]["strongest_skills"] = []
    assert client.put(path, json=reviewed).status_code == 200
    second = client.post("/api/discovery/search", json={"source": "all"})
    assert second.status_code == 200, second.text
    data = second.json()
    assert data["total"] == 1
    assert data["search_profile"]["resume_id"] == resume["id"]
    assert data["search_profile"]["search_preferences"]["strongest_skills"] == []
    assert "Codex" in data["search_profile"]["skills"]
    job = data["items"][0]
    assert job["id"] == first_job["id"]
    assert job["platform"] == "lever"
    assert job["match_details"]["matched_skills"] == ["Python", "SQL"]
    assert job["match_details"]["resume_id"] == resume["id"]
    assert client.get("/api/jobs/" + job["id"]).json()["match_is_current"] is True
    assert (
        client.get("/api/profile").json()["resume"]["search_preferences"][
            "strongest_skills"
        ]
        == []
    )

    # Changing the city must not recycle the previous matching result.
    reviewed["location"] = "Dublin"
    reviewed["search_preferences"]["strongest_skills"] = ["Codex"]
    assert client.put(path, json=reviewed).status_code == 200
    response = client.post("/api/discovery/search", json={"source": "all"})
    assert response.status_code == 200
    assert response.json()["items"] == []
    diagnostic = response.json()["diagnostics"]
    assert diagnostic["without_location"] == 1
    assert diagnostic["location_filter"] == "Dublin"
    assert client.get("/api/profile").json()["resume"]["location"] == "Dublin"
    assert client.get("/api/jobs/" + job["id"]).json()["match_is_current"] is False


def test_uncertain_experience_opt_in_persists_with_separate_classification(request):
    from backend.discovery import rank_postings

    client, app, engine = request.getfixturevalue("product")
    register(client)
    resume = upload(client)
    post = {
        "platform": "ashby",
        "platform_job_id": "test:unknown",
        "company": "Test Employer",
        "title": "Python Developer",
        "location": "Bengaluru, India",
        "job_url": "https://example.com/unknown",
        "source_kind": "ashby",
        "source_board": "test",
        "description_raw": "Full-time. Requirements\nPython and SQL required. Build APIs.",
    }
    app.state.discover = lambda p, s: (rank_postings(p, [post]), [])
    reviewed = {
        **PROFILE,
        "location": "Bangalore",
        "search_preferences": {
            **PROFILE["search_preferences"],
            "include_uncertain_experience": False,
        },
    }
    path = "/api/resumes/" + resume["id"] + "/review"
    assert client.put(path, json=reviewed).status_code == 200
    assert (
        client.post("/api/discovery/search", json={"source": "all"}).json()["items"]
        == []
    )
    reviewed["search_preferences"]["include_uncertain_experience"] = True
    assert client.put(path, json=reviewed).status_code == 200
    response = client.post("/api/discovery/search", json={"source": "all"})
    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["match_details"]["classification"] == "needs_review"
    assert item["match_details"]["experience_status"] == "unconfirmed"
    assert (
        client.get("/api/profile").json()["resume"]["search_preferences"][
            "include_uncertain_experience"
        ]
        is True
    )
    assert client.get("/api/jobs/" + item["id"]).json()["match_is_current"] is True
    reviewed["search_preferences"]["include_uncertain_experience"] = False
    assert client.put(path, json=reviewed).status_code == 200
    assert (
        client.post("/api/discovery/search", json={"source": "all"}).json()["items"]
        == []
    )
    assert client.get("/api/jobs/" + item["id"]).json()["match_is_current"] is False
