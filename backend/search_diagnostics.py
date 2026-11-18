"""Request-local counterfactual counts; never return off-preference postings."""

from types import SimpleNamespace

from backend.role_relevance import match_roles
from backend.requirements_parser import canonical, mentioned, fresher_evidence


class RankedPostings(list):
    def __init__(self, items, diagnostics):
        super().__init__(items)
        self.diagnostics = diagnostics


def summarize(profile, postings, eligible_count):
    priority = {
        canonical(s)
        for s in (getattr(profile, "search_preferences", None) or {}).get(
            "strongest_skills", []
        )
    }
    # Counterfactual counts explain changes without returning off-preference jobs
    # or changing the saved profile. Keep every other eligibility rule intact.
    from backend.job_matching import assess

    prefs = getattr(profile, "search_preferences", None) or {}
    without_location = SimpleNamespace(**{**vars(profile), "location": ""})
    uncertain_experience = SimpleNamespace(
        **{
            **vars(profile),
            "search_preferences": {
                **prefs,
                "include_uncertain_experience": True,
            },
        }
    )
    uncertain_experience_without_location = SimpleNamespace(
        **{
            **vars(without_location),
            "search_preferences": {
                **prefs,
                "include_uncertain_experience": True,
            },
        }
    )
    without_location_count = uncertain_count = 0
    uncertain_experience_without_location_count = 0
    coverage = {s: 0 for s in sorted(priority)}
    roles = entry = all_skills = 0
    for post in postings:
        matches, _, body = match_roles(
            profile.preferred_roles, post["title"], post["description_raw"]
        )
        found = set(mentioned(post["title"] + " " + body, profile.skills))
        roles += bool(matches)
        entry_ok = bool(fresher_evidence(post["description_raw"]))
        entry += entry_ok
        if matches and eligible_count == 0:
            without_location_count += assess(without_location, post, None) is not None
            uncertain_count += assess(uncertain_experience, post, None) is not None
            uncertain_experience_without_location_count += (
                assess(uncertain_experience_without_location, post, None) is not None
            )
        all_skills += bool(priority) and priority.issubset(found)
        for skill in coverage:
            coverage[skill] += skill in found
    return {
        "postings_checked": len(postings),
        "role_matches": roles,
        "fresher_evidence_matches": entry,
        "all_priority_skills_matches": all_skills,
        "priority_skill_coverage": coverage,
        "eligible_count": eligible_count,
        "includes_uncertain_experience": prefs.get(
            "include_uncertain_experience", False
        ),
        "employers": sorted({p["company"] for p in postings if p.get("company")}),
        "counts_are_independent": True,
        "without_location": without_location_count,
        "with_uncertain_experience": uncertain_count,
        "with_uncertain_experience_and_without_location": (
            uncertain_experience_without_location_count
        ),
        "priority_skill_count": len(priority),
        "location_filter": profile.location,
    }
