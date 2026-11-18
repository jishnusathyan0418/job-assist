from types import SimpleNamespace
import pytest
from pydantic import ValidationError
from backend.discovery import rank_postings
from backend.requirements_parser import extract_requirements, canonical
from backend.product_schemas import ProfileInput

PREFS = {
    "career_stage": "fresher",
    "professional_years": 0,
    "internship_months": 6,
    "strongest_skills": ["Python", "SQL"],
    "employment_types": ["full_time"],
    "workplace": "any",
    "include_senior": False,
}


def profile(**preferences):
    return SimpleNamespace(
        id="test",
        skills=["Python", "SQL"],
        preferred_roles=["Python Developer"],
        location="India",
        country="in",
        search_preferences={**PREFS, **preferences},
    )


def job(title="Python Developer", description=None, **kw):
    return dict(
        title=title,
        description_raw=description
        or "Full-time.\nRequirements\nPython and SQL required.\nNo experience required.",
        location="Bengaluru, India",
        platform_job_id="board:1",
        **kw,
    )


def result(post, p=None):
    return rank_postings(p or profile(), [post])


@pytest.mark.parametrize(
    "title",
    [
        "Staff Python Engineer",
        "Principal Python Engineer",
        "Senior Developer - Python",
        "Lead Backend Engineer",
    ],
)
def test_fresher_never_receives_senior_roles(title):
    assert result(job(title)) == []


@pytest.mark.parametrize(
    "years",
    [
        "3+ years of professional experience required",
        "Minimum 2-4 years of experience",
        "At least 1 year of software development experience",
    ],
)
def test_internships_do_not_satisfy_mandatory_professional_years(years):
    assert (
        result(job(description="Full-time.\nRequirements\nPython required.\n" + years))
        == []
    )


def test_confirmed_experienced_user_can_choose_senior_jobs():
    post = job(
        "Staff Python Engineer",
        "Full-time.\nRequirements\nPython required.\n8 years of professional experience required.",
    )
    assert result(
        post,
        profile(
            career_stage="experienced",
            professional_years=8,
            include_senior=True,
            strongest_skills=["Python"],
        ),
    )
    assert not result(
        post,
        profile(career_stage="experienced", professional_years=8, include_senior=False),
    )


def test_required_preferred_and_alternative_skills():
    missing_required = result(
        job(
            description="Full-time.\nRequirements\nPython and Java required.\nNo experience required."
        ),
        profile(strongest_skills=[]),
    )[0]["match"]
    assert missing_required["classification"] == "needs_review"
    assert missing_required["missing_required_skills"] == ["Java"]
    assert any("Java" in flag for flag in missing_required["review_flags"])
    match = result(
        job(
            description="Full-time.\nRequirements\nPython or Java required.\nSQL used in development.\nNo experience required.\nPreferred qualifications\nDocker is a plus."
        )
    )[0]["match"]
    assert match["classification"] == "recommended" and match[
        "missing_preferred_skills"
    ] == ["Docker"]
    assert canonical("NodeJS") == canonical("node.js") and canonical(
        "Java"
    ) != canonical("JavaScript")
    p = profile()
    p.skills = ["JavaScript"]
    p.search_preferences["strongest_skills"] = ["JavaScript"]
    p.preferred_roles = ["JavaScript Developer"]
    assert not result(job("Java Developer", "Requirements\nJava required."), p)


def test_unknown_requirements_are_review_only_and_no_padding():
    assert result(job(description="Work on Python and SQL services.")) == []
    data = result(
        job(description="Work on Python and SQL services."),
        profile(career_stage="experienced", professional_years=2),
    )
    assert data[0]["match"]["classification"] == "needs_review"
    assert result(job("Mechanical Engineer", "Python required.")) == []
    missing_java = result(
        job(
            "Python Developer",
            "Full-time.\nRequirements\nPython and Java required.\nNo experience required.",
        ),
        profile(strongest_skills=[]),
    )[0]["match"]
    assert missing_java["classification"] == "needs_review"
    assert missing_java["missing_required_skills"] == ["Java"]
    assert len(rank_postings(profile(), [job()])) == 1


def test_job_type_and_workplace_filters():
    assert not result(job("Python Intern"))
    assert not result(job(), profile(workplace="remote"))
    post = job()
    post["location"] = "Remote - US"
    assert not result(post, profile(workplace="remote"))
    post["location"] = "Remote worldwide"
    assert result(post, profile(workplace="remote"))


def test_experience_alternatives_and_preferred_years_remain_uncertain():
    req = extract_requirements(
        "Requirements\nPython required.\n3 years of experience or an equivalent degree."
    )
    assert req["minimum_years"] is None and req["uncertainties"]
    assert (
        extract_requirements("Preferred qualifications\n3 years of experience")[
            "minimum_years"
        ]
        is None
    )


def test_required_preferences_are_validated():
    base = dict(
        skills=["Python", "SQL"],
        preferred_roles=["Python Developer"],
        experience="",
        location="India",
        country="in",
    )
    with pytest.raises(ValidationError):
        ProfileInput(**base)
    for change in [
        {"professional_years": 2},
        {"include_senior": True},
        {"strongest_skills": ["Java"]},
        {"employment_types": []},
    ]:
        with pytest.raises(ValidationError):
            ProfileInput(**base, search_preferences={**PREFS, **change})
    assert (
        ProfileInput(
            **base, search_preferences=PREFS
        ).search_preferences.internship_months
        == 6
    )


@pytest.mark.parametrize(
    "location",
    ["Bangalore, India", "Bengaluru, India", "Hyderabad, India", "Remote worldwide"],
)
def test_multiple_location_options_are_alternatives(location):
    p = profile()
    p.location = "Bangalore, Remote, Hyderabad"
    post = job()
    post["location"] = location
    assert result(post, p)


@pytest.mark.parametrize("location", ["Mumbai, India", "Remote - US", "London, UK"])
def test_multiple_locations_do_not_bypass_other_restrictions(location):
    p = profile()
    p.location = "Bangalore, Remote, Hyderabad"
    post = job()
    post["location"] = location
    assert not result(post, p)


def test_remote_only_workplace_overrides_city_alternatives():
    p = profile(workplace="remote")
    p.location = "Bangalore, Remote, Hyderabad"
    post = job()
    post["location"] = "Bengaluru, India"
    assert not result(post, p)
    post["location"] = "Remote worldwide"
    assert result(post, p)


@pytest.mark.parametrize(
    "title",
    [
        "Network Security Engineer",
        "Customer Engineer",
        "Technical Support Engineer",
        "Solutions Engineer",
        "Site Reliability Engineer",
        "QA Engineer",
    ],
)
def test_shared_python_does_not_make_other_roles_python_development(title):
    assert not result(
        job(
            title, "Full-time.\nRequirements\nPython required.\nNo experience required."
        )
    )


@pytest.mark.parametrize(
    "line",
    [
        "8+ years of professional experience writing production code or software programs.",
        "3+ years of experience building backend systems, libraries, or developer software with Python and/or TypeScript.",
        "2+ years experience in a technical role, preferably in the data or cloud field.",
    ],
)
def test_or_in_job_tasks_does_not_erase_experience(line):
    req = extract_requirements(line)
    assert req["minimum_years"] > 0
    assert not result(
        job(description="Full-time.\nRequirements\nPython required.\n" + line)
    )


def test_company_python_mentions_cannot_prove_role_match():
    assert not result(
        job(
            "Software Engineer",
            "About Us\nOur company uses Python.\nWhat you will do\nBuild JavaScript browser interfaces.",
        )
    )


def test_matching_roles_reports_only_supported_user_choices():
    p = profile()
    p.preferred_roles = ["Python Developer", "AI Engineer"]
    data = result(job(), p)[0]["match"]
    assert data["matching_roles"] == ["Python Developer"]
    assert data["role_evidence"][0]["requested_role"] == "Python Developer"
    assert "Python" in data["role_evidence"][0]["text"]


def test_profile_fingerprint_changes_with_user_inputs():
    from backend.role_relevance import profile_fingerprint

    p = profile()
    before = profile_fingerprint(p)
    p.search_preferences["strongest_skills"] = ["SQL"]
    assert profile_fingerprint(p) != before


@pytest.mark.parametrize(
    "text,minimum",
    [
        ("Must have two (2) years of experience in Software Development.", 2),
        ("Must have six (6) years of software development experience.", 6),
        ("4+ years building backend, infrastructure systems, CI and build tooling", 4),
        ("Minimum three years of professional experience developing software.", 3),
    ],
)
def test_experience_with_parentheses_words_or_responsibility_verbs(text, minimum):
    assert extract_requirements(text)["minimum_years"] == minimum


def test_reported_ai_skills_extract_and_validate_with_aliases():
    from backend.resume_parser import skills_in

    skills = skills_in(
        "Python, FastAPI, SQL, LangChain, retrieval-augmented generation, large language models"
    )
    entered = ["Python", "FastAPI", "SQL", "LangChain", "RAG", "LLMs"]
    assert set(entered) <= set(skills)
    data = ProfileInput(
        skills=skills,
        preferred_roles=["Python Developer"],
        search_preferences={**PREFS, "strongest_skills": entered},
    )
    assert data.search_preferences.strongest_skills == entered
    assert canonical("LLM") == canonical("LLMs")
    assert "RAG" not in skills_in("storage fragment")
    with pytest.raises(ValidationError, match="Skills field: RAG, LLMs"):
        ProfileInput(
            skills=["Python", "FastAPI", "SQL", "LangChain"],
            preferred_roles=["Python Developer"],
            search_preferences={**PREFS, "strongest_skills": entered},
        )


@pytest.mark.parametrize(
    "requirement",
    [
        "Exp: 5 - 10yrs",
        "Experience: 2+ yrs",
        "Experience: 1 to 3 years",
        "Minimum 6 months of professional experience",
        "two yrs experience",
        "Experience required: 1.5 years",
        "3 years experience or a degree",
        "Preferred qualifications\n2 years of experience",
        "5+ years experience including internships",
        "About us\nApplicants need 4 yrs experience.",
    ],
)
def test_explicit_fresher_claim_never_overrides_conflicting_full_description(
    requirement,
):
    assert (
        result(
            job(
                description="Full-time.\nPython and SQL required.\nNo experience required.\n"
                + requirement
            )
        )
        == []
    )


@pytest.mark.parametrize(
    "requirement",
    [
        "No experience required.",
        "Freshers are welcome.",
        "Recent graduates (including Summer 2026) or professionals with up to 18 months of experience.",
        "0-2 years of professional experience",
    ],
)
def test_fresher_requires_quoted_affirmative_evidence(requirement):
    data = result(
        job(
            description="Full-time.\nRequirements\nPython and SQL required.\n"
            + requirement
        )
    )
    assert len(data) == 1
    assert {"kind": "fresher_eligibility", "text": requirement} in data[0]["match"][
        "requirement_evidence"
    ]


@pytest.mark.parametrize(
    "requirement",
    [
        "Strong experience building production software.",
        "Python and SQL services.",
        "Freshers are not eligible.",
        "Not open to freshers.",
    ],
)
def test_unknown_or_negated_entry_eligibility_is_not_a_fresher_result(requirement):
    assert (
        result(job(description="Full-time.\nPython and SQL required.\n" + requirement))
        == []
    )


@pytest.mark.parametrize("omitted", ["Python", "LangChain", "RAG", "LLMs"])
def test_priority_skills_at_75_percent_can_be_recommended(omitted):
    p = profile()
    p.skills = ["Python", "LangChain", "RAG", "LLMs"]
    p.search_preferences["strongest_skills"] = p.skills
    p.preferred_roles = ["Software Engineer"]
    text = (
        "Full-time.\nRequirements\n"
        + ", ".join(s for s in p.skills if s != omitted)
        + " required.\nNo experience required."
    )
    matched = result(job("Software Engineer", text), p)
    assert len(matched) == 1
    assert matched[0]["match"]["priority_skill_coverage"] == 75
    assert matched[0]["match"]["classification"] == "recommended"


def test_priority_skills_below_75_percent_are_needs_review():
    p = profile()
    p.skills = ["Python", "LangChain", "RAG", "LLMs"]
    p.search_preferences["strongest_skills"] = p.skills
    matched = result(
        job(
            "Python Developer",
            "Full-time.\nRequirements\nPython and LangChain required.\nNo experience required.",
        ),
        p,
    )
    assert len(matched) == 1
    assert matched[0]["match"]["priority_skill_coverage"] == 50
    assert matched[0]["match"]["classification"] == "needs_review"
    assert any("below 75%" in flag for flag in matched[0]["match"]["review_flags"])


def test_combined_ai_skills_match_aliases_and_keep_fresher_gate():
    p = profile()
    p.skills = ["Python", "LangChain", "RAG", "LLMs"]
    p.search_preferences["strongest_skills"] = p.skills
    text = "Full-time.\nRequirements\nPython, LangChain, retrieval-augmented generation and large language models required.\nNo experience required."
    matched = result(job("Python Developer", text), p)
    assert len(matched) == 1
    assert set(matched[0]["match"]["matched_skills"]) == set(p.skills)
    assert not result(job("Python Developer", text + "\nExp: 5 - 10yrs"), p)
    boilerplate_only = result(
        job(
            "Python Developer",
            "Full-time.\nPython required.\nNo experience required.\nAbout us\nOur company uses LangChain, RAG and LLMs.",
        ),
        p,
    )
    assert len(boilerplate_only) == 1
    assert boilerplate_only[0]["match"]["matched_skills"] == ["Python"]
    assert boilerplate_only[0]["match"]["priority_skill_coverage"] == 25
    assert boilerplate_only[0]["match"]["classification"] == "needs_review"


@pytest.mark.parametrize(
    "text,status",
    [
        ("Paid internship", "paid"),
        ("This is not a paid internship", "unpaid"),
        ("This internship is unpaid.", "unpaid"),
        ("Stipend: INR 15000 per month", "paid"),
        ("Stipend: INR 0", "unpaid"),
        ("Paid leave and health insurance", "unknown"),
        ("Competitive benefits", "unknown"),
        ("Paid internship\nThis is an unpaid internship", "unknown"),
    ],
)
def test_internship_pay_uses_explicit_evidence(text, status):
    from backend.internship_pay import classify_pay

    assert classify_pay("Python Intern", text)[0] == status


def test_internship_pay_preferences_exclude_unknown_without_affecting_full_time():
    paid = job(
        "Python Intern",
        "Python and SQL required.\nNo experience required.\nPaid internship",
    )
    unpaid = job(
        "Python Intern",
        "Python and SQL required.\nNo experience required.\nUnpaid internship",
    )
    unknown = job("Python Intern", "Python and SQL required.\nNo experience required.")
    p = profile(employment_types=["internship"], internship_pay="paid")
    assert result(paid, p) and not result(unpaid, p) and not result(unknown, p)
    p.search_preferences["internship_pay"] = "unpaid"
    assert result(unpaid, p) and not result(paid, p) and not result(unknown, p)
    p.search_preferences["internship_pay"] = "any"
    assert result(unknown, p)[0]["match"]["internship_pay"] == "unknown"
    p.search_preferences.update(
        employment_types=["full_time", "internship"], internship_pay="paid"
    )
    assert result(job(), p)


def test_structured_internship_pay_and_employment_from_provider():
    p = profile(employment_types=["internship"], internship_pay="paid")
    post = job(
        employment_type="internship",
        compensation={
            "summaryComponents": [
                {
                    "compensationType": "Salary",
                    "minValue": 10000,
                    "currencyCode": "INR",
                    "interval": "1 MONTH",
                }
            ]
        },
    )
    assert result(post, p)[0]["match"]["internship_pay"] == "paid"
    post["compensation"]["summaryComponents"][0]["compensationType"] = (
        "EquityPercentage"
    )
    assert not result(post, p)


def test_empty_search_diagnostics_are_independent_and_request_local():
    p = profile()
    p.skills = ["Python", "SQL", "Codex"]
    p.search_preferences["strongest_skills"] = ["Python", "Codex"]
    posts = [
        job(description="Python and SQL required.\nExp: 5 - 10yrs", company="Example")
    ]
    results = rank_postings(p, posts)
    assert results == []
    d = results.diagnostics
    assert d["postings_checked"] == 1 and d["role_matches"] == 1
    assert d["fresher_evidence_matches"] == 0 and d["all_priority_skills_matches"] == 0
    assert d["priority_skill_coverage"] == {"Python": 1, "codex": 0}
    assert d["eligible_count"] == 0 and d["counts_are_independent"] is True
    assert (
        rank_postings(profile(), [job(company="Other")]).diagnostics["eligible_count"]
        == 1
    )
    assert d["employers"] == [
        "Example"
    ]  # Another request cannot overwrite these counts.


def test_priority_skills_do_not_hide_matches_and_other_filters_still_apply():
    p = profile(strongest_skills=[])
    p.skills += ["Codex"]
    found = result(job(), p)
    assert len(found) == 1
    assert found[0]["match"]["matched_skills"] == ["Python", "SQL"]
    assert "2 of 3 confirmed resume skills" in found[0]["match"]["explanation"]
    p.search_preferences["strongest_skills"] = ["Codex"]
    partial = result(job(), p)
    assert len(partial) == 1
    assert partial[0]["match"]["priority_skill_coverage"] == 0
    assert partial[0]["match"]["classification"] == "needs_review"
    full = result(job(description="Python SQL Codex required.\nNo experience required."), p)
    assert len(full) == 1
    assert full[0]["match"]["priority_skill_coverage"] == 100
    assert full[0]["match"]["missing_priority_skills"] == []
    p.search_preferences["strongest_skills"] = []
    assert (
        result(job(description="Python SQL. Minimum 3 years of experience."), p) == []
    )
    assert result(job(title="Staff Python Engineer"), p) == []


def test_resume_skill_coverage_changes_ranking():
    p = profile(strongest_skills=[])
    p.skills = ["Python", "SQL", "FastAPI"]
    sparse = job(
        description="Full-time. Requirements\nPython required. No experience required."
    )
    rich = job(
        description="Full-time. Requirements\nPython, SQL and FastAPI required. No experience required."
    )
    rich["platform_job_id"] = "board:2"
    ranked = rank_postings(p, [sparse, rich])
    assert ranked[0]["platform_job_id"] == "board:2"
    assert ranked[0]["match"]["rank_score"] > ranked[1]["match"]["rank_score"]


def test_empty_diagnostics_distinguish_skill_and_location_constraints():
    p = profile(strongest_skills=["Codex"])
    p.skills += ["Codex"]
    p.location = "Bangalore"
    post = job(description="Python, SQL and Codex required.\nNo experience required.")
    post["location"] = "Dublin"
    rows = rank_postings(p, [post])
    assert rows == []
    assert rows.diagnostics["without_location"] == 1
    assert rows.diagnostics["location_filter"] == "Bangalore"
    assert p.search_preferences["strongest_skills"] == ["Codex"]
    assert p.location == "Bangalore"
    post["location"] = "Bengaluru, India"
    rows = rank_postings(p, [post])
    assert len(rows) == 1
    assert rows[0]["match"]["priority_skill_coverage"] == 100
    assert rows.diagnostics["without_location"] == 0


def test_counterfactual_diagnostics_never_relax_experience_or_pay():
    p = profile(
        strongest_skills=["Codex"],
        employment_types=["internship"],
        internship_pay="paid",
    )
    p.skills += ["Codex"]
    posts = [
        job(
            title="Python Intern",
            description="Python and SQL required. No experience required. Unpaid internship.",
        ),
        job(description="Python and SQL required. 5 years of experience required."),
    ]
    rows = rank_postings(p, posts)
    assert rows == []
    assert rows.diagnostics["without_location"] == 0


def test_uncertain_fresher_counterfactual_preserves_location_with_partial_skills():
    p = profile(strongest_skills=["Codex", "FastAPI"])
    p.skills.extend(["Codex", "FastAPI"])
    p.location = "Bangalore"
    post = job(description="Full-time. Python, SQL and Codex required. Build APIs.")
    rows = result(post, p)
    assert rows == []
    assert rows.diagnostics["with_uncertain_experience"] == 1
    assert rows.diagnostics["with_uncertain_experience_and_without_location"] == 1
    assert p.search_preferences.get("include_uncertain_experience", False) is False
    assert p.search_preferences["strongest_skills"] == ["Codex", "FastAPI"]


def test_uncertain_fresher_requires_opt_in_and_is_never_recommended():
    post = job(
        description="Full-time. Requirements\nPython and SQL required. Build backend APIs."
    )
    assert result(post) == []
    assert result(post).diagnostics["with_uncertain_experience"] == 1
    p = profile(include_uncertain_experience=True)
    rows = result(post, p)
    assert len(rows) == 1
    details = rows[0]["match"]
    assert details["classification"] == "needs_review"
    assert details["experience_status"] == "unconfirmed"
    assert any(
        "Fresher eligibility is unconfirmed" in x for x in details["review_flags"]
    )
    assert not any(
        x["kind"] == "fresher_eligibility" for x in details["requirement_evidence"]
    )


@pytest.mark.parametrize(
    "experience",
    [
        "5 years of experience required.",
        "Minimum 6 months of professional experience.",
        "Freshers cannot apply.",
        "Strong production experience required.",
        "You must have professional experience.",
        "Three years of experience preferred.",
    ],
)
def test_review_mode_never_admits_explicit_experience_conflicts(experience):
    post = job(
        description="Full-time. Requirements\nPython and SQL required.\n" + experience
    )
    assert result(post, profile(include_uncertain_experience=True)) == []


def test_review_mode_keeps_location_and_pay_with_priority_skills():
    p = profile(include_uncertain_experience=True)
    p.skills += ["Codex"]
    p.search_preferences["strongest_skills"] = ["Codex"]
    post = job(description="Full-time. Requirements\nPython and SQL required.")
    partial = result(post, p)
    assert len(partial) == 1
    assert partial[0]["match"]["priority_skill_coverage"] == 0
    assert partial[0]["match"]["classification"] == "needs_review"
    p.search_preferences["strongest_skills"] = []
    p.location = "Hyderabad"
    assert result(post, p) == []
    p.location = "Bangalore"
    reviewed = result(post, p)[0]["match"]
    assert reviewed["classification"] == "needs_review"
    assert any(
        "Fresher eligibility is unconfirmed" in flag
        for flag in reviewed["review_flags"]
    )
    p.search_preferences.update(employment_types=["internship"], internship_pay="paid")
    post["title"] = "Python Intern"
    post["description_raw"] = (
        "Requirements\nPython and SQL required. Unpaid internship."
    )
    assert result(post, p) == []


@pytest.mark.parametrize(
    "wording",
    [
        "1 to 5 years of strong Python fundamentals",
        "Two years of Python knowledge",
        "3 years in Python",
    ],
)
def test_review_excludes_years_of_skill_even_without_word_experience(wording):
    post = job(
        description="Full-time. Requirements\nPython and SQL required.\n" + wording
    )
    assert result(post, profile(include_uncertain_experience=True)) == []
    assert extract_requirements(post["description_raw"])["minimum_years"] > 0


def test_student_and_portfolio_conditions_have_visible_evidence():
    post = job(
        description="Full-time. Requirements\nPython and SQL required.\nCurrently pursuing a degree in Computer Science.\nA public GitHub profile is mandatory.\nStrong academic performance, CGPA of 9+."
    )
    rows = result(post, profile(include_uncertain_experience=True))
    assert len(rows) == 1
    assert rows[0]["match"]["classification"] == "needs_review"
    evidence = [
        e["text"]
        for e in rows[0]["match"]["requirement_evidence"]
        if e["kind"] == "other"
    ]
    assert any("Currently pursuing" in e for e in evidence)
    assert any("GitHub" in e for e in evidence)
    assert any("CGPA" in e for e in evidence)
