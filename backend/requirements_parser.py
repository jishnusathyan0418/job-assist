"""Conservative requirement extraction with source evidence and explicit uncertainty."""

import re
from backend.resume_parser import SKILLS, ALIASES, contains

EXTRA = {
    "Node.js": ["nodejs", "node.js"],
    "JavaScript": ["javascript", "js"],
    "TypeScript": ["typescript", "ts"],
    "PostgreSQL": ["postgresql", "postgres"],
    "Python": ["python", "python3", "python 3"],
    ".NET": [".net", "dotnet"],
}
NAMES = {
    skill: list(dict.fromkeys([skill] + ALIASES.get(skill, []) + EXTRA.get(skill, [])))
    for skill in SKILLS
}


def canonical(value):
    value = value.strip()
    for skill, aliases in NAMES.items():
        if value.casefold() in {a.casefold() for a in aliases}:
            return skill
    return value.casefold()


def mentioned(text, additional=()):
    found = []
    for skill, names in NAMES.items():
        if skill == "Go" and not re.search(
            r"\bgolang\b|\bGo (?:language|programming)\b|\b(?:Python|Java|Rust)[, /]+Go\b",
            text,
            re.I,
        ):
            continue
        if any(contains(text, name) for name in names):
            found.append(skill)
    for skill in additional:
        normalized = canonical(skill)
        if normalized not in found and contains(text, skill):
            found.append(normalized)
    return found


def skill_duration_context(after):
    """Recognize 'years of Python fundamentals' without inventing work history."""
    return bool(
        re.match(r"\s*(?:of|in|with)\b", after, re.I)
        and mentioned(after[:80])
        and not re.search(
            r"\b(?:degree|bachelor|college|university|course|program)\b",
            after[:80],
            re.I,
        )
    )


REQUIRED = re.compile(
    r"^(?:minimum|basic|required|essential|mandatory)?\s*(?:qualifications|requirements|skills)(?: and experience)?\s*:?$|^(?:what you bring|what you.ll bring|what we.re looking for|what we look for|who you are|what you.ll need|you have|must.haves)\s*:?$",
    re.I,
)
PREFERRED = re.compile(
    r"^(?:preferred|desired|additional|bonus) (?:qualifications|requirements|skills)|^nice.to.have|^bonus points",
    re.I,
)
RESET = re.compile(
    r"^(?:responsibilities|benefits|about us|about the|what you.ll do|what we offer|the role|compensation)",
    re.I,
)
OPTIONAL = re.compile(
    r"\b(preferred|nice.to.have|bonus|optional|a plus|desirable|not required)\b", re.I
)
MANDATORY = re.compile(
    r"\b(must|required|require|mandatory|essential|proficien(?:t|cy)|minimum|at least)\b",
    re.I,
)
YEARS = re.compile(
    r"\b(\d{1,2})(?:\s*(?:[-\u2013\u2014]|to)\s*\d{1,2})?\)?\s*\+?\s*(?:years?|yrs?)\b",
    re.I,
)


def extract_requirements(text, additional=()):
    required, preferred, alternatives, evidence, uncertain = set(), set(), [], [], []
    minimum = None
    no_experience = bool(
        re.search(
            r"\bno (?:prior |previous |professional )?experience (?:is )?(?:required|necessary)\b",
            text,
            re.I,
        )
    )
    section = "unknown"
    for raw in re.split(r"\n|;|[\u2022]|(?<=[.!?])\s+(?=[A-Z])", text):
        line = raw.strip(" -\t:")
        if not line:
            continue
        if PREFERRED.match(line):
            section = "preferred"
            if len(line.split()) < 7:
                continue
        elif REQUIRED.match(line):
            section = "required"
            continue
        elif RESET.match(line):
            section = "unknown"
        context = (
            "preferred"
            if OPTIONAL.search(line)
            else "required"
            if MANDATORY.search(line) or section == "required"
            else section
        )
        if context == "required" and re.search(
            r"\b(degree|bachelor|master|phd|certification|license|authori[sz]ed|sponsorship)\b",
            line,
            re.I,
        ):
            uncertain.append(
                "Education, certification or work-authorization requirements need your review."
            )
            evidence.append({"kind": "other", "text": line[:600]})
        if context == "required" and re.search(
            r"\b(?:currently pursuing|currently enrolled|public github|github profile|proof of work|prior internships|cgpa|jee|gate rank|academic performance)\b",
            line,
            re.I,
        ):
            uncertain.append(
                "Student status, academic criteria, prior internships or portfolio requirements are not verified; review the employer evidence."
            )
            evidence.append({"kind": "other", "text": line[:600]})
        skills = mentioned(line, additional)
        # Long unstructured prose cannot safely identify which listed skills are mandatory.
        ambiguous = len(line) > 600 or bool(
            re.search(r"\b(?:and/or|such as|e\.g\.|for example)\b", line, re.I)
        )
        if skills and context == "required":
            evidence.append({"kind": "skills", "text": line[:600]})
            if ambiguous:
                uncertain.append(
                    "Some skill requirements are ambiguous; review the quoted requirements."
                )
            elif re.search(r"\bor\b", line, re.I) and len(skills) > 1:
                if re.search(r"\band\b", line, re.I):
                    uncertain.append(
                        "The posting mixes alternative and combined skills; review which are mandatory."
                    )
                else:
                    alternatives.append(skills)
            else:
                required.update(skills)
        elif context == "preferred":
            preferred.update(skills)
        # Normalize spelled-out years while keeping the original evidence unchanged.
        number_words = {
            "one": 1,
            "two": 2,
            "three": 3,
            "four": 4,
            "five": 5,
            "six": 6,
            "seven": 7,
            "eight": 8,
            "nine": 9,
            "ten": 10,
        }
        year_line = re.sub(
            r"\b(" + "|".join(number_words) + r")(?=\s+(?:or more\s+)?years?\b)",
            lambda m: str(number_words[m.group().lower()]),
            line,
            flags=re.I,
        )
        years = list(YEARS.finditer(year_line))
        experience_years = [
            year
            for year in years
            if re.search(
                r"\b(?:exp|experience|building|developing|designing|implementing|programming|working|leading|managing|maintaining|engineering)\b",
                year_line[max(0, year.start() - 45) : year.end() + 110],
                re.I,
            )
            or skill_duration_context(year_line[year.end() : year.end() + 110])
        ]
        if (
            experience_years
            and context != "preferred"
            and not re.search(r"\b(?:up to|at most|maximum)\s+\d", year_line, re.I)
        ):
            evidence.append({"kind": "experience", "text": line[:600]})
            # 'Code or software programs' and 'Python and/or TypeScript' are not alternatives to years.
            education_alternative = bool(
                re.search(
                    r"\bor\s+(?:(?:an?|the|equivalent|relevant)\s+)*(?:degree|bachelor|master|ph\.?d|diploma|qualification)\b|(?:degree|bachelor|master|ph\.?d|diploma)[^.;]{0,100}\bor\s+(?:at least\s+)?\d+\+?\s*years?",
                    line,
                    re.I,
                )
            )
            internship_condition = bool(re.search(r"internship", line, re.I))
            if education_alternative or internship_condition or len(line) > 600:
                uncertain.append(
                    "Experience has education alternatives or internship conditions; check the quoted requirement."
                )
            else:
                minimum = max(
                    minimum or 0, min(int(year.group(1)) for year in experience_years)
                )
    if no_experience and minimum:
        uncertain.append(
            "The posting contains conflicting experience statements; review them."
        )
        # Keep the explicit minimum; an unrelated no-experience statement must not erase it.
    return {
        "required_skills": sorted(required),
        "preferred_skills": sorted(preferred - required),
        "alternative_skills": alternatives,
        "minimum_years": minimum,
        "no_experience_required": no_experience,
        "evidence": evidence[:12],
        "uncertainties": list(dict.fromkeys(uncertain)),
    }


# A fresher must have affirmative employer evidence, not merely an unparsed minimum.
ENTRY_EVIDENCE = re.compile(
    r"\bno (?:prior |previous |professional |work )?experience (?:is )?(?:required|necessary)\b"
    r"|\b(?:freshers?|recent graduates?|new graduates?)\s+(?:are\s+)?(?:welcome|eligible|encouraged|can apply|may apply)\b"
    r"|^recent graduates?\b"
    r"|\b(?:open to|welcome|welcoming|seeking|hiring)\s+(?:freshers?|recent graduates?|new graduates?)\b"
    r"|\b0\s*(?:[-\u2013\u2014]|to)\s*\d+\s*(?:years?|yrs?|months?)\s+(?:of\s+)?(?:professional\s+|work\s+)?experience\b",
    re.I,
)
DURATION = re.compile(
    r"\b(\d+(?:\.\d+)?)(?:\s*(?:[-\u2013\u2014]|to)\s*\d+(?:\.\d+)?)?\)?\s*\+?\s*(?:years?|yrs?|months?|mos?)\b",
    re.I,
)
WORK_EXPERIENCE = re.compile(
    r"\b(?:exp|experience|building|developing|designing|implementing|programming|working|leading|managing|maintaining|engineering)\b",
    re.I,
)


def fresher_assessment(text):
    """Return quoted eligibility evidence only when no conflicting experience is found.

    Scan the full description, independently of sections stripped for role matching.
    Ambiguous alternatives and preferred positive experience are conservatively excluded.
    """
    evidence = []
    for raw in re.split(r"\n|;|[\u2022]|(?<=[.!?])\s+(?=[A-Z])", text):
        line = raw.strip()
        if not line:
            continue
        positive = bool(ENTRY_EVIDENCE.search(line))
        negated = bool(
            re.search(
                r"\b(?:not|no|cannot|can't|ineligible)\b.{0,50}\b(?:freshers?|graduates?)\b"
                r"|\b(?:freshers?|graduates?)\b.{0,50}\b(?:not|cannot|can't|ineligible)\b",
                line,
                re.I,
            )
        )
        if negated:
            return [], True
        # Unnumbered mandatory professional experience also conflicts with zero.
        if re.search(
            r"\b(?:professional|commercial|industry|production)\b.{0,60}\bexperience\b.{0,40}\b(?:required|essential|mandatory)\b"
            r"|\b(?:require|requires|must have)\b.{0,60}\b(?:professional|commercial|industry|production)\b.{0,30}\bexperience\b",
            line,
            re.I,
        ):
            return [], True
        # Word forms are normalized solely for matching; quotes retain employer text.
        normalized = line
        for word, number in {
            "one": 1,
            "two": 2,
            "three": 3,
            "four": 4,
            "five": 5,
            "six": 6,
            "seven": 7,
            "eight": 8,
            "nine": 9,
            "ten": 10,
        }.items():
            normalized = re.sub(
                r"\b" + word + r"(?=\s+(?:years?|yrs?|months?)\b)",
                str(number),
                normalized,
                flags=re.I,
            )
        for duration in DURATION.finditer(normalized):
            if float(duration.group(1)) == 0:
                continue
            before = normalized[max(0, duration.start() - 100) : duration.start()]
            after = normalized[duration.end() : duration.end() + 160]
            # An upper bound is not a minimum, e.g. graduates or up to 18 months.
            if re.search(r"\b(?:up to|at most|maximum)\s*$", before, re.I):
                continue
            if WORK_EXPERIENCE.search(before + " " + after) or skill_duration_context(
                after
            ):
                return [], True
        if positive:
            evidence.append({"kind": "fresher_eligibility", "text": line[:600]})
    return evidence, False


def fresher_evidence(text):
    return fresher_assessment(text)[0]
