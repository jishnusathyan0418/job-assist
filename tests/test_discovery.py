from datetime import timedelta
from types import SimpleNamespace
from concurrent.futures import ThreadPoolExecutor
from threading import Event
import httpx
import pytest
from sqlalchemy import select
from backend import discovery
from backend.job_catalog import JobCatalog
from backend.models import JobBoardCache
from backend.database import session_factory
from backend.timeutils import utcnow
from tests.conftest import migrate


def profile(**kw):
    return SimpleNamespace(
        **dict(
            id="test",
            skills=["Python", "SQL"],
            preferred_roles=["Python Developer"],
            location="India",
            country="in",
            experience="Built APIs",
            search_preferences={
                "career_stage": "experienced",
                "professional_years": 3,
                "internship_months": 0,
                "strongest_skills": ["Python", "SQL"],
                "employment_types": ["full_time"],
                "workplace": "any",
                "include_senior": False,
            },
            **kw,
        )
    )


def post(key="1", **kw):
    item = dict(
        platform="greenhouse",
        platform_job_id="one:" + key,
        company="One",
        title="Python Developer",
        location="Bengaluru, India",
        job_url="https://example.com/" + key,
        description_raw="Python SQL",
        source_kind="greenhouse",
        source_board="one",
    )
    item.update(kw)
    return item


def mock_http(monkeypatch, handler):
    client = httpx.Client(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(discovery, "http_client", lambda: client)
    monkeypatch.setattr(discovery.time, "sleep", lambda seconds: None)
    return client


def test_retries_transient_failure_and_preserves_rate_limit(monkeypatch):
    calls = []

    def respond(request):
        calls.append(request)
        return httpx.Response(503 if len(calls) < 3 else 200, json={"jobs": []})

    with mock_http(monkeypatch, respond):
        assert discovery.get_json("https://example.com/retry", cache=False) == {
            "jobs": []
        }
    assert len(calls) == 3
    calls.clear()

    def limited(request):
        calls.append(request)
        return httpx.Response(429, headers={"Retry-After": "120"})

    with mock_http(monkeypatch, limited):
        with pytest.raises(discovery.SourceError) as error:
            discovery.get_json("https://example.com/limit", cache=False)
    assert error.value.retry_after == 120 and len(calls) == 1


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(404),
        httpx.Response(200, content=b"not json"),
        httpx.Response(200, content=b"x" * 100),
    ],
)
def test_invalid_or_oversized_responses_fail_safely(monkeypatch, response):
    calls = []

    def respond(request):
        calls.append(request)
        return response

    with mock_http(monkeypatch, respond):
        with pytest.raises(discovery.SourceError):
            discovery.get_json("https://example.com/bad", cache=False, max_bytes=50)
    assert len(calls) == 1


def test_bulk_listing_requires_valid_details(monkeypatch):
    calls = []

    def respond(request):
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "jobs": [
                    {
                        "id": 1,
                        "internal_job_id": 7,
                        "title": "Python Developer",
                        "location": {"name": "India"},
                        "absolute_url": "https://example.com/job",
                        "content": "<p>Python &amp; SQL</p>",
                    }
                ]
            },
        )

    with mock_http(monkeypatch, respond):
        result = discovery.fetch_board("one")
    assert len(calls) == 1 and calls[0].url.params["content"] == "true"
    assert result[0]["description_raw"] == "Python & SQL"
    with mock_http(
        monkeypatch,
        lambda r: httpx.Response(200, json={"jobs": [{"id": 1, "internal_job_id": 7}]}),
    ):
        with pytest.raises(discovery.SourceError):
            discovery.fetch_board("one")


def test_rank_all_candidates_before_cutoff_and_explain_requirements():
    posts = [
        post(str(i), description_raw="Python SQL Java Docker AWS") for i in range(75)
    ]
    posts.append(
        post(
            "best",
            description_raw="Python SQL. At least 3 years of software engineering experience required.",
        )
    )
    result = discovery.rank_postings(profile(), posts)
    assert len(result) == 50 and result[0]["platform_job_id"] == "one:best"
    assert any(
        "3 years" in row["text"] for row in result[0]["match"]["requirement_evidence"]
    )
    p = profile()
    p.preferred_roles = ["Junior Python Developer"]
    result = discovery.rank_postings(
        p,
        [
            post("senior", title="Senior Python Developer"),
            post("junior", title="Junior Python Developer"),
        ],
    )
    assert result[0]["platform_job_id"] == "one:junior"
    assert len(result) == 1


def test_remote_country_restrictions_and_role_aliases():
    p = profile()
    p.location = "Remote"
    result = discovery.rank_postings(
        p,
        [
            post("us", location="Remote - US"),
            post("world", location="Remote worldwide", title="Python Engineer"),
            post("unknown", location="Remote"),
        ],
    )
    assert {i["platform_job_id"] for i in result} == {"one:world", "one:unknown"}
    assert any(
        "unspecified" in flag
        for i in result
        if i["platform_job_id"] == "one:unknown"
        for flag in i["match"]["review_flags"]
    )
    assert not discovery.rank_postings(
        profile(), [post("sales", title="Sales Manager")]
    )


def test_database_cache_survives_restart_refresh_failure_and_expiry(
    database, monkeypatch
):
    engine, _ = database
    migrate()
    sessions = session_factory(engine)
    monkeypatch.setattr(discovery, "boards", lambda: ["one", "two"])
    calls = []

    def fetch(board):
        calls.append(board)
        return [post(board, source_board=board, platform_job_id=board + ":1")]

    catalog = JobCatalog(sessions, fetch)
    items, warnings = catalog.discover(profile(), "greenhouse")
    assert len(items) == 2 and len(calls) == 2 and not warnings
    restarted = JobCatalog(sessions, fetch)
    assert len(restarted.discover(profile(), "greenhouse")[0]) == 2 and len(calls) == 2
    old = utcnow() - timedelta(hours=1)
    with sessions() as db:
        for row in db.scalars(select(JobBoardCache)):
            row.fetched_at = old
        db.commit()
    items, warnings = restarted.discover(profile(), "greenhouse")
    assert (
        warnings
        and len(calls) == 2
        and all(i["last_verified_at"] == old for i in items)
    )

    def unavailable(board):
        if board == "one":
            raise discovery.SourceError("Provider unavailable", retry_after=600)
        return []

    restarted.fetch = unavailable
    restarted.refresh_due()
    items, warnings = restarted.discover(profile(), "greenhouse")
    assert len(items) == 1 and any("Provider unavailable" in w for w in warnings)
    with sessions() as db:
        row = db.get(JobBoardCache, "one")
        assert row.postings and row.retry_at > utcnow()
        for row in db.scalars(select(JobBoardCache)):
            row.fetched_at = utcnow() - timedelta(hours=25)
            row.retry_at = utcnow() + timedelta(minutes=5)
        db.commit()
    with pytest.raises(discovery.SourceError):
        restarted.discover(profile(), "greenhouse")
    # Competing refreshes must not fetch the same board twice.
    with sessions() as db:
        row = db.get(JobBoardCache, "one")
        row.retry_at = None
        db.commit()
    entered, release = Event(), Event()
    calls.clear()

    def slow(board):
        calls.append(board)
        entered.set()
        assert release.wait(10)
        return [post()]

    restarted.fetch = slow
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(restarted.refresh, "one")
        assert entered.wait(10)
        second = pool.submit(restarted.refresh, "one")
        second.result(timeout=10)
        release.set()
        first.result(timeout=10)
    assert calls == ["one"]


def test_ashby_public_feed_skips_unlisted_and_normalizes_metadata(monkeypatch):
    public = {
        "title": "Python Intern",
        "location": "Bengaluru",
        "descriptionPlain": "Python required.",
        "jobUrl": "https://jobs.ashbyhq.com/example/123",
        "isListed": True,
        "employmentType": "Intern",
        "workplaceType": "OnSite",
        "compensation": {
            "summaryComponents": [{"compensationType": "Salary", "minValue": 1000}]
        },
    }
    calls = []

    def fetch(url, params, cache):
        calls.append((url, params, cache))
        return {
            "jobs": [
                public,
                {**public, "isListed": False},
                {**public, "jobUrl": "https://invalid.example/job"},
            ]
        }

    monkeypatch.setattr(discovery, "get_json", fetch)
    items = discovery.fetch_ashby_board("example")
    assert len(items) == 1 and items[0]["employment_type"] == "internship"
    assert items[0]["platform_job_id"] == "example:123"
    assert items[0]["location"] == "Bengaluru | On-site"
    assert calls[0][1] == {"includeCompensation": "true"}
    monkeypatch.setattr(
        discovery,
        "get_json",
        lambda *a, **kw: {"jobs": [{"isListed": True, "jobUrl": public["jobUrl"]}]},
    )
    with pytest.raises(discovery.SourceError):
        discovery.fetch_ashby_board("example")


def test_combined_sources_merge_before_ranking_and_tolerate_partial_failure(
    monkeypatch,
):
    monkeypatch.setenv("GREENHOUSE_BOARDS", "one")
    monkeypatch.setenv("ASHBY_BOARDS", "two")
    monkeypatch.setenv("LEVER_BOARDS", "three")
    calls = []

    def read(catalog):
        calls.append(catalog.source)
        if catalog.source == "ashby":
            raise discovery.SourceError("Temporarily unavailable")
        return [post("shared"), post(catalog.source)], []

    monkeypatch.setattr(JobCatalog, "read_postings", read)
    rows, warnings = JobCatalog(None).discover(profile(), "all")
    assert set(calls) == {"greenhouse", "ashby", "lever"}
    assert len(rows) == 3
    assert rows.diagnostics["postings_checked"] == 3
    assert any("ashby" in w for w in warnings)
    monkeypatch.setattr(
        JobCatalog,
        "read_postings",
        lambda _: (_ for _ in ()).throw(discovery.SourceError("Unavailable")),
    )
    with pytest.raises(discovery.SourceError):
        JobCatalog(None).discover(profile(), "all")


def test_lever_preserves_requirements_and_validates_urls(monkeypatch):
    row = {
        "id": "one",
        "text": "Python Developer",
        "descriptionPlain": "Full-time. No experience required.",
        "hostedUrl": "https://jobs.lever.co/meesho/one",
        "categories": {"location": "Bengaluru, India", "commitment": "Full-time"},
        "lists": [
            {
                "text": "Requirements",
                "content": "<ul><li>Python and SQL required</li></ul>",
            }
        ],
    }
    monkeypatch.setattr(
        discovery,
        "get_json",
        lambda *a, **kw: [row, {**row, "hostedUrl": "https://evil.example/one"}],
    )
    rows = discovery.fetch_lever_board("meesho")
    assert len(rows) == 1
    assert rows[0]["employment_type"] == "full_time"
    assert "Python and SQL required" in rows[0]["description_raw"]
    assert rows[0]["platform_job_id"] == "meesho:one"
    assert len(discovery.rank_postings(profile(), rows)) == 1


def test_lever_empty_plain_description_preserves_list_requirements(monkeypatch):
    row = {
        "id": "one",
        "text": "Python Developer",
        "descriptionPlain": "",
        "description": "<p>No experience required.</p>",
        "hostedUrl": "https://jobs.lever.co/meesho/one",
        "categories": {"location": "Bengaluru, India", "commitment": "Full-time"},
        "lists": [
            {
                "text": "Requirements",
                "content": "<ul><li>Python and SQL required</li></ul>",
            }
        ],
    }
    monkeypatch.setattr(discovery, "get_json", lambda *a, **kw: [row])
    rows = discovery.fetch_lever_board("meesho")
    assert "No experience required." in rows[0]["description_raw"]
    assert "Python and SQL required" in rows[0]["description_raw"]
    assert len(discovery.rank_postings(profile(), rows)) == 1
