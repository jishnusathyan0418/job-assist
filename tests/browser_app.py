"""Deterministic browser-test provider, never hosted."""

from backend.product import create_app
from backend.discovery import rank_postings

app = create_app()


def fixture_jobs(profile, source):
    # Optional local audit snapshot; only this disposable test app reads it.
    import os
    import json
    from pathlib import Path

    fixture = os.getenv("E2E_LIVE_POSTINGS_PATH")
    if fixture and profile.filename == "live-audit.txt":
        payload = json.loads(Path(fixture).read_text(encoding="utf-8"))
        return rank_postings(profile, payload["postings"]), []

    common = {
        "platform": "greenhouse",
        "company": "Browser Test Employer",
        "location": "Bengaluru, India",
        "source_kind": "greenhouse",
        "source_board": "fixture",
    }
    postings = [
        {
            **common,
            "platform_job_id": "fixture:123",
            "title": "Python Developer",
            "job_url": "https://example.com/careers/123",
            "description_raw": "Full-time.\nRequirements\nPython and SQL required.\nNo experience required.\nPreferred qualifications\nDocker is a plus.",
        },
        {
            **common,
            "platform_job_id": "fixture:124",
            "title": "Staff Python Engineer",
            "job_url": "https://example.com/careers/124",
            "description_raw": "Requirements\nPython required.\n8 years of experience required.",
        },
    ]
    for number, requirement in enumerate(
        [
            "Exp: 5 - 10yrs",
            "Minimum 6 months of professional experience",
            "Experience: 1.5 years",
            "Strong production experience required.",
            "No experience required.\nAbout us\nApplicants must have 3 years experience.",
        ],
        start=125,
    ):
        postings.append(
            {
                **common,
                "platform_job_id": f"fixture:{number}",
                "title": "Python Developer",
                "job_url": f"https://example.com/careers/{number}",
                "description_raw": "Full-time.\nRequirements\nPython and SQL required.\n"
                + requirement,
            }
        )
    postings.append(
        {
            **common,
            "platform_job_id": "fixture:java",
            "title": "Java Developer",
            "job_url": "https://example.com/careers/java",
            "description_raw": "Full-time.\nRequirements\nJava required.\nNo experience required.",
        }
    )
    postings.append(
        {
            **common,
            "platform_job_id": "fixture:ai",
            "title": "Python Developer - AI Applications",
            "job_url": "https://example.com/careers/ai",
            "description_raw": "Full-time.\nRequirements\nPython, LangChain, retrieval-augmented generation and large language models required.\nNo experience required.",
        }
    )
    for number, pay in enumerate(
        ["Paid internship", "Unpaid internship", "Pay details not disclosed"], start=200
    ):
        postings.append(
            {
                **common,
                "platform_job_id": f"fixture:{number}",
                "title": "Python Intern",
                "job_url": f"https://example.com/careers/{number}",
                "description_raw": "Requirements\nPython and SQL required.\nNo experience required.\n"
                + pay,
            }
        )
    postings.append(
        {
            **common,
            "platform_job_id": "fixture:uncertain",
            "title": "Python Developer - Eligibility unspecified",
            "job_url": "https://example.com/careers/uncertain",
            "description_raw": "Full-time. Requirements\nPython and SQL required. Build backend APIs.",
        }
    )
    if source == "ashby":
        posts = [
            {
                **common,
                "company": "Startup Fixture",
                "platform_job_id": "startup:1",
                "title": "Python Developer",
                "job_url": "https://example.com/startup/1",
                "description_raw": "Requirements\nPython and SQL required.\nExp: 5 - 10yrs",
            }
        ]
        return rank_postings(profile, posts), [
            "ashby:fixture: using saved listings last checked recently. Refresh may be pending."
        ]
    return rank_postings(profile, postings), []


app.state.discover = fixture_jobs
app.state.check_posting = lambda job: None
