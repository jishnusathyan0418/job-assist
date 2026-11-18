"""Explainable ranking; never infer applicant qualifications from dates or job titles."""

import re
from backend.discovery import location_match
from backend.resume_parser import contains
from backend.requirements_parser import (
    canonical,
    mentioned,
    extract_requirements,
    fresher_assessment,
)
from backend.internship_pay import classify_pay
from backend.role_relevance import match_roles, profile_fingerprint

ROLE_ALIASES = {
    "developer": "engineer",
    "development": "engineer",
    "engineering": "engineer",
    "programmer": "engineer",
    "sde": "engineer",
    "swe": "engineer",
    "backend": "backend",
    "front-end": "frontend",
    "back-end": "backend",
}
COUNTRIES = {
    "in": "India",
    "us": "USA",
    "gb": "UK",
    "ca": "Canada",
    "au": "Australia",
    "de": "Germany",
    "fr": "France",
    "nl": "Netherlands",
}
REGIONS = {
    "in": [
        "india",
        "bengaluru",
        "bangalore",
        "hyderabad",
        "pune",
        "mumbai",
        "chennai",
        "gurgaon",
    ],
    "us": ["united states", "usa", "u.s.", "us", "new york", "san francisco"],
    "gb": ["united kingdom", "uk", "london"],
    "ca": ["canada", "toronto"],
    "au": ["australia", "sydney"],
    "de": ["germany", "berlin"],
    "fr": ["france", "paris"],
    "nl": ["netherlands", "amsterdam"],
}
LEVELS = {
    "junior",
    "senior",
    "staff",
    "principal",
    "lead",
    "intern",
    "graduate",
    "entry",
}


def words(value):
    tokens = re.findall(r"[a-z][a-z+#.-]*", value.lower())
    return {
        ROLE_ALIASES.get(w, w)
        for w in tokens
        if w not in LEVELS | {"and", "the", "for", "of", "in", "or", "level"}
    }


def assess(profile, post, skill_match):
    prefs = getattr(profile, "search_preferences", None)
    if not prefs:
        return None
    title, description = post["title"], post["description_raw"]
    is_fresher = prefs["career_stage"] == "fresher"
    entry_evidence, experience_conflict = (
        fresher_assessment(description) if is_fresher else ([], False)
    )
    uncertain_experience = is_fresher and not entry_evidence
    if is_fresher and (
        experience_conflict
        or (
            uncertain_experience
            and not prefs.get("include_uncertain_experience", False)
        )
    ):
        return None
    if re.search(r"\b(senior|staff|principal|lead|sr[.]?)\b", title, re.I) and (
        prefs["career_stage"] == "fresher" or not prefs.get("include_senior")
    ):
        return None
    matching_roles, role_evidence, relevant_description = match_roles(
        profile.preferred_roles, title, description
    )
    if not matching_roles:
        return None
    title_words = words(title)
    requested = [words(role) for role in matching_roles]
    overlap = max((len(w & title_words) / len(w) for w in requested if w), default=0)
    internship = bool(re.search(r"\b(intern|internship)\b", title, re.I))
    employment = (
        "internship"
        if internship
        else "part_time"
        if re.search(r"part.time", title, re.I)
        else "contract"
        if re.search(r"\b(contract|contractor|freelance)\b", title, re.I)
        else "full_time"
        if re.search(r"full.time", description, re.I)
        else None
    )
    if post.get("employment_type") in {
        "internship",
        "full_time",
        "part_time",
        "contract",
    }:
        employment = post["employment_type"]
    if not employment and prefs["employment_types"] == ["internship"]:
        return None
    pay_status, pay_evidence = (
        classify_pay(title, description, post.get("compensation"))
        if employment == "internship"
        else (None, [])
    )
    if (
        employment == "internship"
        and prefs.get("internship_pay", "any") != "any"
        and pay_status != prefs["internship_pay"]
    ):
        return None
    if employment and employment not in prefs["employment_types"]:
        return None
    location = post.get("location") or ""
    preferred = profile.location.strip()
    remote = bool(re.search(r"\bremote\b", location, re.I))
    worldwide = any(
        contains(location, word) for word in ("worldwide", "anywhere", "global")
    )
    restrictions = [
        code
        for code, names in REGIONS.items()
        if any(contains(location, name) for name in names)
    ]
    checks = []
    if uncertain_experience:
        checks.append(
            "Fresher eligibility is unconfirmed: this posting does not explicitly accept zero professional experience. Verify with the employer before applying."
        )
    if employment == "internship" and pay_status == "unknown":
        checks.append(
            "Internship pay is not disclosed or has conflicting statements; confirm with the employer."
        )
    workplace = prefs["workplace"]
    hybrid = contains(location, "hybrid")
    onsite = bool(re.search(r"on.site|in.office", location, re.I))
    if workplace == "remote" and not remote and not worldwide:
        return None
    if workplace == "hybrid" and (onsite or remote and not hybrid):
        return None
    if workplace == "onsite" and (remote or hybrid):
        return None
    if workplace in {"hybrid", "onsite"} and not (hybrid or onsite):
        checks.append(
            "Workplace arrangement is unspecified; confirm it with the employer."
        )
    if not employment:
        checks.append(
            "Employment type is not explicit; confirm it matches your preference."
        )
    if (
        (remote or worldwide)
        and restrictions
        and profile.country not in restrictions
        and not worldwide
    ):
        return None

    if preferred:
        # Comma/semicolon-separated choices are alternatives, not a single place or remote-only switch.
        choices = [
            value.strip() for value in re.split(r"[,;\n]", preferred) if value.strip()
        ]
        cities = [value for value in choices if not contains(value, "remote")]
        accepts_remote = any(contains(value, "remote") for value in choices)
        if any(location_match(city, location) for city in cities):
            location_reason = "Posting matches one of your preferred locations."
        elif (remote or worldwide) and (accepts_remote or worldwide):
            if not restrictions and not worldwide:
                checks.append(
                    "Remote location eligibility is unspecified; verify the employer's permitted countries."
                )
            location_reason = "Posting matches your remote option; verify country and work-authorization requirements."
        else:
            return None
    else:
        location_reason = (
            "No location filter set; verify location and work authorization."
        )
    requirements = extract_requirements(relevant_description, profile.skills)
    skills = {canonical(value) for value in profile.skills}
    strongest = {canonical(value) for value in prefs["strongest_skills"]}
    required = set(requirements["required_skills"])
    missing = required - skills
    missing_alternatives = [
        group for group in requirements["alternative_skills"] if not set(group) & skills
    ]
    if missing or missing_alternatives:
        if missing:
            checks.append(
                "Employer-listed required skills are missing from your confirmed resume: "
                + ", ".join(sorted(missing))
                + ". Review the posting before applying; do not claim skills you do not have."
            )
        for alternatives in missing_alternatives:
            checks.append(
                "The employer asks for at least one of these skills, none of which is on your confirmed resume: "
                + " or ".join(sorted(alternatives))
                + ". Review the posting before applying."
            )
    # Role boilerplate stripping must never hide an explicit experience requirement.
    full_requirements = extract_requirements(description, profile.skills)
    minimum = full_requirements["minimum_years"]
    if minimum is not None and minimum > prefs["professional_years"]:
        return None
    recognized = set(mentioned(title + " " + relevant_description, profile.skills))
    matched = skills & recognized
    if not matched:
        return None
    matched_priority = strongest & recognized
    missing_priority = strongest - recognized
    priority_coverage = (
        round(100 * len(matched_priority) / len(strongest)) if strongest else None
    )
    if strongest and len(matched_priority) * 4 < len(strongest) * 3:
        checks.append(
            f"Priority-skill coverage is {priority_coverage}%, below 75%; review this match."
        )
    checks.extend(requirements["uncertainties"])
    if (
        minimum is None
        and not entry_evidence
        and not full_requirements["no_experience_required"]
    ):
        checks.append(
            "Experience requirement is unspecified; suitability needs review."
        )
    if not required and not requirements["alternative_skills"]:
        checks.append(
            "Required skills were not clearly identified; review the description."
        )
    classification = "needs_review" if checks else "recommended"
    preferred_missing = set(requirements["preferred_skills"]) - skills
    required_match = sorted(required & skills)
    score = round(100 * len(matched) / max(1, len(recognized)))
    rank = round(
        overlap * 50 + 30 * len(skills & recognized) / max(1, len(skills)) + score * 0.2
    )
    reasons = [
        "Matches your requested role: " + ", ".join(matching_roles) + ".",
        "Confirmed skills found in role-specific content: "
        + ", ".join(sorted(matched))
        + ".",
    ]
    if strongest:
        reasons.append(
            f"Selected priority skills found: {len(matched_priority)} of "
            f"{len(strongest)} ({priority_coverage}%): "
            + ", ".join(sorted(matched_priority) or ["none"])
            + "."
        )
    reasons.append(
        f"{len(matched)} of {len(skills)} confirmed resume skills appear in this role; "
        "other resume skills are used for ranking, not mandatory filters."
    )
    if required_match:
        reasons.append(
            "Identified required skills matched: " + ", ".join(required_match) + "."
        )
    if strongest:
        reasons.append(
            "Priority skills influence the review classification, not basic eligibility."
        )
    if entry_evidence:
        reasons.append(
            "The posting explicitly accepts freshers or zero experience; see the employer evidence."
        )
    elif minimum is not None:
        reasons.append(
            f"Posting asks for {minimum}+ professional years; you confirmed {prefs['professional_years']:g}."
        )
    elif requirements["no_experience_required"]:
        reasons.append("Posting explicitly allows no prior experience.")
    return {
        "experience_status": "unconfirmed"
        if uncertain_experience
        else "explicit_entry"
        if entry_evidence
        else "assessed",
        "employment_type": employment,
        "internship_pay": pay_status,
        "pay_evidence": pay_evidence,
        "matched_skills": sorted(matched),
        "matched_priority_skills": sorted(matched_priority),
        "missing_priority_skills": sorted(missing_priority),
        "priority_skill_total": len(strongest),
        "priority_skill_coverage": priority_coverage,
        "missing_required_skills": sorted(missing),
        "missing_required_alternatives": [
            sorted(group) for group in missing_alternatives
        ],
        "other_mentioned_skills": sorted(recognized - skills),
        "matching_roles": matching_roles,
        "role_evidence": role_evidence,
        "matching_version": 9,
        "profile_fingerprint": profile_fingerprint(profile),
        "score": score,
        "rank_score": rank,
        "resume_id": str(profile.id),
        "classification": classification,
        "location_reason": location_reason,
        "review_flags": list(dict.fromkeys(checks)),
        "required_skills": sorted(required),
        "preferred_skills": requirements["preferred_skills"],
        "missing_preferred_skills": sorted(preferred_missing),
        "requirement_evidence": entry_evidence + requirements["evidence"],
        "explanation": " ".join(reasons),
    }
