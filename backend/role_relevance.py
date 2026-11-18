"""Require evidence for the requested kind of work, not merely a shared tool."""

import re
import hashlib
import json
from backend.resume_parser import contains
from backend.requirements_parser import mentioned

FAMILIES = {
    "support": r"\b(?:support|customer|technical services|technical account)\b",
    "solutions": r"\bsolutions?\b",
    "sales": r"\b(?:sales|presales|pre-sales)\b",
    "network": r"\b(?:network|networking)\b",
    "security": r"\b(?:security|cybersecurity)\b",
    "operations": r"\b(?:site reliability|sre|devops|infrastructure|systems?|platform operations)\b",
    "testing": r"\b(?:qa|quality assurance|test|testing|sdet)\b",
    "data": r"\b(?:data engineer|data engineering|analytics engineer|data analyst)\b",
    "nonsoftware": r"\b(?:mechanical|civil|electrical|hardware)\b",
}
SOFTWARE = re.compile(
    r"\b(?:software|backend|back.end|frontend|front.end|full.stack|developer|programmer|sde|swe|application engineer)\b",
    re.I,
)
AI = re.compile(
    r"\b(?:ai|artificial intelligence|machine learning|ml|generative ai|genai|llm|nlp|computer vision)\b",
    re.I,
)
BOILERPLATE = re.compile(
    r"^(?:about (?:us|the company)|who we are|benefits|compensation|equal opportunity|privacy|accommodations|we are an equal|our mission)",
    re.I,
)
WORK = re.compile(
    r"^(?:about the (?:role|team)|the role|what you.ll (?:do|build)|what you (?:will|would) do|responsibilities|requirements|qualifications|minimum qualifications|what we look for|what we.re looking for|who you are|you will|your (?:role|impact|responsibilities)|the impact you will have)",
    re.I,
)


def job_evidence(description):
    lines = []
    skip = False
    for raw in description.splitlines():
        line = raw.strip()
        if not line:
            continue
        if WORK.match(line):
            skip = False
        elif BOILERPLATE.match(line):
            skip = True
        if not skip and not re.search(
            r"\b(?:AI (?:is a partner|native curiosity)|our culture|company.s mission)\b",
            line,
            re.I,
        ):
            lines.append(line)
    return lines


def match_roles(roles, title, description):
    lines = job_evidence(description)
    role_matches = []
    evidence = []
    title_families = {
        name for name, pattern in FAMILIES.items() if re.search(pattern, title, re.I)
    }
    for role in roles:
        wanted_families = {
            name for name, pattern in FAMILIES.items() if re.search(pattern, role, re.I)
        }
        wants_ai = bool(AI.search(role))
        wants_software = bool(SOFTWARE.search(role))
        # A Python mention does not turn support/network/security work into Python development.
        if title_families - wanted_families and (wants_software or wants_ai):
            continue
        technologies = set(mentioned(role))
        title_technologies = set(mentioned(title))
        languages = {
            "Python",
            "Java",
            "JavaScript",
            "TypeScript",
            "C++",
            "C#",
            "Ruby",
            "PHP",
            "Go",
            "Rust",
            "Swift",
            "Kotlin",
        }
        if (
            technologies & languages
            and title_technologies & languages
            and not technologies & title_technologies & languages
        ):
            continue
        if wants_ai:
            if not (
                AI.search(title)
                and re.search(
                    r"engineer|developer|scientist|research|intern", title, re.I
                )
            ):
                continue
            signal = next((line for line in lines if AI.search(line)), None)
        elif wants_software:
            if not (
                SOFTWARE.search(title)
                or technologies & title_technologies
                and re.search(r"engineer|intern", title, re.I)
            ):
                continue
            signal = (
                next(
                    (line for line in lines if technologies & set(mentioned(line))),
                    None,
                )
                if technologies
                else next(iter(lines), None)
            )
            if technologies and not signal and not technologies & title_technologies:
                continue
        else:
            wanted = {w.casefold() for w in re.findall(r"[a-zA-Z]+", role)} - {
                "junior",
                "senior",
                "intern",
                "entry",
                "level",
            }
            if not wanted or not all(contains(title, w) for w in wanted):
                continue
            signal = next(iter(lines), None)
        role_matches.append(role)
        evidence.append(
            {
                "requested_role": role,
                "job_title": title,
                "text": (signal or title)[:600],
            }
        )
    return role_matches, evidence, "\n".join(lines)


def profile_fingerprint(profile):
    inputs = {
        "skills": sorted(s.casefold() for s in profile.skills),
        "roles": sorted(r.casefold() for r in profile.preferred_roles),
        "location": profile.location.casefold(),
        "country": profile.country,
        "preferences": profile.search_preferences,
    }
    return hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
