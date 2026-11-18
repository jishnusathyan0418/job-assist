"""Live jobs from allowlisted official APIs. Resume contents never leave the app."""

from html import unescape
from html.parser import HTMLParser
import os
import re
import time
from threading import Lock
from urllib.parse import urlsplit
import httpx
import ssl
import certifi
from pathlib import Path
from backend.resume_parser import contains, skills_in


class SourceError(Exception):
    def __init__(self, message, retry_after=300):
        super().__init__(message)
        self.retry_after = retry_after


class PlainText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {"p", "li", "br", "h1", "h2", "h3", "h4", "div"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"p", "li", "h1", "h2", "h3", "h4", "div"}:
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)


def plain(value):
    parser = PlainText()
    parser.feed(unescape(value or ""))
    return re.sub(r"[ \t]+", " ", "".join(parser.parts)).strip()[:30000]


_cache = {}
_lock = Lock()
_client_lock = Lock()
_client = None


def http_client():
    global _client
    with _client_lock:
        if _client is None:
            # Read certificates once in Python; OpenSSL file reads can stall on cloud-synced Windows drives.
            ca_file = os.getenv("SSL_CERT_FILE") or certifi.where()
            context = ssl.create_default_context(
                cadata=Path(ca_file).read_text(encoding="ascii")
            )
            _client = httpx.Client(
                verify=context,
                timeout=15,
                follow_redirects=False,
                headers={"User-Agent": "Jobspace/0.1 (job-search application)"},
            )
        return _client


def get_json(url, params=None, cache=True, max_bytes=16 * 1024 * 1024):
    import json
    from datetime import datetime, timezone
    from email.utils import parsedate_to_datetime

    key = (url, tuple(sorted((params or {}).items())))
    with _lock:
        cached = _cache.get(key)
        if cache and cached and time.monotonic() - cached[0] < 300:
            return cached[1]
    for attempt in range(3):
        try:
            with http_client().stream("GET", url, params=params) as response:
                if response.status_code == 429 or response.status_code >= 500:
                    delay = 2**attempt
                    header = response.headers.get("Retry-After")
                    if header:
                        try:
                            delay = max(1, int(header))
                        except ValueError:
                            try:
                                delay = max(
                                    1,
                                    int(
                                        (
                                            parsedate_to_datetime(header)
                                            - datetime.now(timezone.utc)
                                        ).total_seconds()
                                    ),
                                )
                            except (ValueError, TypeError, OverflowError):
                                delay = 300
                    if attempt == 2 or delay > 2:
                        raise SourceError(
                            "Job source is temporarily busy. Saved results will be used when available.",
                            retry_after=max(60, delay),
                        )
                else:
                    response.raise_for_status()
                    data = bytearray()
                    deadline = time.monotonic() + 20
                    for chunk in response.iter_bytes():
                        data.extend(chunk)
                        if len(data) > max_bytes or time.monotonic() > deadline:
                            raise SourceError(
                                "Job source response exceeded the safe size or time limit."
                            )
                    payload = json.loads(data)
                    break
        except (httpx.TimeoutException, httpx.NetworkError):
            if attempt == 2:
                raise SourceError(
                    "Job source timed out. Please try again later."
                ) from None
            delay = 2**attempt
        except (httpx.HTTPError, ValueError):
            raise SourceError(
                "Job source returned an unavailable or invalid response."
            ) from None
        time.sleep(delay)
    if cache:
        with _lock:
            if len(_cache) > 200:
                _cache.clear()
            _cache[key] = (time.monotonic(), payload)
    return payload


def boards():
    values = os.getenv(
        "GREENHOUSE_BOARDS", "cloudflare,mongodb,databricks,stripe"
    ).split(",")
    return [
        v.strip() for v in values if re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", v.strip())
    ][:6]


def ashby_boards():
    return [
        v.strip()
        for v in os.getenv("ASHBY_BOARDS", "sarvam,Meraki-Labs,ema").split(",")
        if re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", v.strip())
    ][:6]


def source_options():
    return [
        {
            "id": "all",
            "name": "All connected free sources",
            "available": bool(boards() or ashby_boards() or lever_boards()),
            "coverage": ", ".join(boards() + ashby_boards() + lever_boards()),
        },
        {
            "id": "greenhouse",
            "name": "Company job boards",
            "available": bool(boards()),
            "coverage": ", ".join(boards()),
        },
        {
            "id": "ashby",
            "name": "Ashby employer boards",
            "available": bool(ashby_boards()),
            "coverage": ", ".join(ashby_boards()),
        },
        {
            "id": "lever",
            "name": "Lever employer boards",
            "available": bool(lever_boards()),
            "coverage": ", ".join(lever_boards()),
        },
        {
            "id": "adzuna",
            "name": "Adzuna",
            "available": bool(
                os.getenv("ADZUNA_APP_ID") and os.getenv("ADZUNA_APP_KEY")
            ),
            "coverage": "Requires server-side Adzuna credentials",
        },
    ]


def role_words(profile):
    return set(
        re.findall(
            r"[a-zA-Z][a-zA-Z+#.]{1,}", " ".join(profile.preferred_roles).lower()
        )
    ) - {"and", "the", "for", "of", "in", "or"}


def location_match(wanted, found):
    if not wanted:
        return True
    wanted = wanted.casefold()
    found = found.casefold()
    aliases = {
        "bangalore": ["bangalore", "bengaluru"],
        "bengaluru": ["bangalore", "bengaluru"],
        "gurgaon": ["gurgaon", "gurugram"],
        "gurugram": ["gurgaon", "gurugram"],
        "india": [
            "india",
            "bengaluru",
            "bangalore",
            "hyderabad",
            "pune",
            "mumbai",
            "delhi",
            "chennai",
            "noida",
            "gurugram",
            "gurgaon",
        ],
        "uk": ["united kingdom", "london", "uk"],
        "usa": ["united states", "usa", "new york", "san francisco"],
    }
    return any(part in found for part in aliases.get(wanted, [wanted]))


def match(profile, title, description):
    text = title + " " + description
    mentioned = skills_in(text)
    matched = [s for s in profile.skills if contains(text, s) or s in mentioned]
    missing = [
        s for s in mentioned if s.casefold() not in {m.casefold() for m in matched}
    ]
    role_matches = [
        r
        for r in profile.preferred_roles
        if any(contains(title, w) for w in re.findall(r"[\w+#.]+", r))
    ]
    total = len(matched) + len(missing)
    score = round(100 * len(matched) / total) if total else 0
    return {
        "matched_skills": matched,
        "other_mentioned_skills": missing,
        "matching_roles": role_matches,
        "explanation": f"{len(matched)} of {total} recognized skill mentions match your confirmed profile. This is keyword coverage, not an eligibility decision.",
        "score": score,
        "resume_id": str(profile.id),
    }


def fetch_board(board):
    payload = get_json(
        f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs",
        {"content": "true"},
        cache=False,
    )
    if not isinstance(payload, dict) or not isinstance(payload.get("jobs"), list):
        raise SourceError("Job source returned an invalid listing response.")
    items = []
    for row in payload["jobs"]:
        # Reject malformed snapshots instead of replacing usable cached jobs with partial corruption.
        if not isinstance(row, dict) or not isinstance(row.get("id"), int):
            raise SourceError("Job source returned malformed postings.")
        if row.get("internal_job_id") is None:
            continue
        location = row.get("location") or {}
        if (
            not isinstance(location, dict)
            or not isinstance(row.get("title"), str)
            or not isinstance(row.get("content"), str)
            or not isinstance(location.get("name", ""), str)
        ):
            raise SourceError("Job source returned incomplete posting details.")
        url = row.get("absolute_url", "")
        if (
            not isinstance(url, str)
            or urlsplit(url).scheme != "https"
            or not urlsplit(url).hostname
        ):
            continue
        items.append(
            {
                "platform": "greenhouse",
                "platform_job_id": f"{board}:{row['id']}",
                "company": board.title(),
                "title": plain(row["title"])[:255],
                "location": plain(location.get("name", ""))[:255],
                "job_url": url,
                "description_raw": plain(row["content"]),
                "source_kind": "greenhouse",
                "source_board": board,
            }
        )
    return items


def rank_postings(profile, postings):
    from backend.job_matching import assess

    results = []
    for post in postings:
        details = assess(profile, post, match)
        if details is not None:
            results.append({**post, "match": details})
    results.sort(
        key=lambda item: (
            item["match"].get("classification") != "recommended",
            -item["match"]["rank_score"],
            item["platform_job_id"],
        )
    )
    # Rank every eligible description first, then select the best results.
    from backend.search_diagnostics import RankedPostings, summarize

    return RankedPostings(results[:50], summarize(profile, postings, len(results)))


def greenhouse(profile):
    warnings, postings = [], []
    for board in boards():
        try:
            postings.extend(fetch_board(board))
        except SourceError as error:
            warnings.append(f"{board}: {error}")
    if not postings and len(warnings) == len(boards()):
        raise SourceError(
            "All configured company boards are unavailable. Please retry later."
        )
    return rank_postings(profile, postings), warnings


def adzuna(profile):
    app_id, app_key = os.getenv("ADZUNA_APP_ID"), os.getenv("ADZUNA_APP_KEY")
    if not app_id or not app_key:
        raise SourceError(
            "Adzuna is not configured. Use Company job boards or configure Adzuna credentials on the server."
        )
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "what": profile.preferred_roles[0],
        "results_per_page": 20,
        "content-type": "application/json",
    }
    if profile.location:
        params["where"] = profile.location
    payload = get_json(
        f"https://api.adzuna.com/v1/api/jobs/{profile.country}/search/1",
        params=params,
        cache=False,
    )
    items = []
    for row in payload.get("results", []):
        url = row.get("redirect_url", "")
        if urlsplit(url).scheme != "https":
            continue
        title, description = (
            plain(row.get("title", ""))[:255],
            plain(row.get("description", "")),
        )
        items.append(
            {
                "platform": "adzuna",
                "platform_job_id": str(row["id"]),
                "company": plain(
                    row.get("company", {}).get("display_name", "Unknown company")
                )[:255],
                "title": title,
                "location": plain(row.get("location", {}).get("display_name", ""))[
                    :255
                ],
                "job_url": url,
                "description_raw": description,
                "source_kind": "adzuna",
                "source_board": profile.country,
                "match": match(profile, title, description),
            }
        )
    return rank_postings(
        profile, [{k: v for k, v in item.items() if k != "match"} for item in items]
    ), []


def discover(profile, source):
    if source == "adzuna":
        return adzuna(profile)
    sources = {
        "greenhouse": (boards, fetch_board),
        "ashby": (ashby_boards, fetch_ashby_board),
        "lever": (lever_boards, fetch_lever_board),
    }
    if source != "all" and source not in sources:
        raise SourceError("Unsupported job source.")
    items, warnings, succeeded = [], [], 0
    for kind in sources if source == "all" else [source]:
        configured, fetch = sources[kind]
        for board in configured():
            try:
                items.extend(fetch(board))
                succeeded += 1
            except SourceError as error:
                warnings.append(f"{kind}/{board}: {error}")
    if not succeeded:
        raise SourceError(" ".join(warnings) or "No employer boards configured.")
    unique = {item["job_url"]: item for item in items}
    return rank_postings(profile, list(unique.values())), warnings


def check_posting(job):
    if job.source_kind == "lever":
        if not any(
            p["platform_job_id"] == job.platform_job_id
            for p in fetch_lever_board(job.source_board)
        ):
            raise SourceError(
                "This posting is no longer available on the employer board."
            )
        return
    if job.source_kind == "ashby":
        if not any(
            p["platform_job_id"] == job.platform_job_id
            for p in fetch_ashby_board(job.source_board)
        ):
            raise SourceError(
                "This posting is no longer listed by the employer. Check the original page before applying."
            )
        return
    if job.source_kind == "greenhouse":
        try:
            key = job.platform_job_id.split(":", 1)[1]
            # Only request the configured provider host, never the saved application URL.
            get_json(
                f"https://boards-api.greenhouse.io/v1/boards/{job.source_board}/jobs/{int(key)}",
                cache=False,
            )
        except (SourceError, ValueError, IndexError):
            raise SourceError(
                "This posting could not be verified. It may have closed; check the original page before applying."
            ) from None


def fetch_ashby_board(board):
    payload = get_json(
        f"https://api.ashbyhq.com/posting-api/job-board/{board}",
        {"includeCompensation": "true"},
        cache=False,
    )
    if not isinstance(payload, dict) or not isinstance(payload.get("jobs"), list):
        raise SourceError("Ashby returned an invalid listing response.")
    items = []
    for row in payload["jobs"]:
        if not isinstance(row, dict):
            raise SourceError("Ashby returned malformed postings.")
        if row.get("isListed") is not True:
            continue
        url = row.get("jobUrl", "")
        parsed = urlsplit(url) if isinstance(url, str) else None
        if (
            not parsed
            or parsed.scheme != "https"
            or parsed.hostname != "jobs.ashbyhq.com"
        ):
            continue
        if not isinstance(row.get("title"), str) or not isinstance(
            row.get("descriptionPlain"), str
        ):
            raise SourceError("Ashby returned incomplete posting details.")
        if not parsed.path.strip("/").startswith(board + "/"):
            continue
        employment = {
            "Intern": "internship",
            "FullTime": "full_time",
            "PartTime": "part_time",
            "Contract": "contract",
        }.get(row.get("employmentType"))
        location = row.get("location") or ""
        if not isinstance(location, str):
            raise SourceError("Ashby returned an invalid location.")
        if row.get("workplaceType") in ["Remote", "Hybrid", "OnSite"]:
            location += " | " + {"OnSite": "On-site"}.get(
                row["workplaceType"], row["workplaceType"]
            )
        items.append(
            {
                "platform": "ashby",
                "platform_job_id": board
                + ":"
                + parsed.path.rstrip("/").rsplit("/", 1)[-1],
                "company": board.title(),
                "title": plain(row["title"])[:255],
                "location": location[:255],
                "job_url": url,
                "description_raw": row["descriptionPlain"],
                "source_kind": "ashby",
                "source_board": board,
                "employment_type": employment,
                "compensation": row.get("compensation"),
            }
        )
    return items


def lever_boards():
    return [
        v.strip()
        for v in os.getenv("LEVER_BOARDS", "meesho").split(",")
        if re.fullmatch(r"[a-zA-Z0-9_-]{1,80}", v.strip())
    ][:6]


def fetch_lever_board(board):
    items = []
    for page in range(20):
        rows = get_json(
            f"https://api.lever.co/v0/postings/{board}",
            {"mode": "json", "skip": page * 100, "limit": 100},
            cache=False,
        )
        if not isinstance(rows, list):
            raise SourceError("Lever returned an invalid listing response.")
        for row in rows:
            if not isinstance(row, dict):
                raise SourceError("Lever returned malformed postings.")
            url = row.get("hostedUrl")
            parsed = urlsplit(url) if isinstance(url, str) else None
            if (
                not parsed
                or parsed.scheme != "https"
                or parsed.hostname != "jobs.lever.co"
                or not parsed.path.startswith("/" + board + "/")
            ):
                continue
            if not all(isinstance(row.get(k), str) and row[k] for k in ("id", "text")):
                raise SourceError("Lever returned incomplete posting details.")
            categories = row.get("categories") or {}
            if not isinstance(categories, dict) or not isinstance(
                row.get("lists", []), list
            ):
                raise SourceError("Lever returned invalid posting categories.")
            description = row.get("descriptionPlain") or plain(
                row.get("description") or ""
            )
            if not isinstance(description, str):
                raise SourceError("Lever returned an invalid description.")
            sections = [description]
            for section in row.get("lists", []):
                if not isinstance(section, dict):
                    raise SourceError("Lever returned invalid requirements.")
                sections.append(
                    plain(str(section.get("text", "")))
                    + "\n"
                    + plain(str(section.get("content", "")))
                )
            sections.append(
                row.get("additionalPlain") or plain(row.get("additional") or "")
            )
            location = str(categories.get("location") or "")
            workplace = row.get("workplaceType")
            if workplace in ("remote", "hybrid", "on-site"):
                location += " | " + workplace
            employment = {
                "full-time": "full_time",
                "full time": "full_time",
                "fulltime": "full_time",
                "part-time": "part_time",
                "intern": "internship",
                "internship": "internship",
                "contract": "contract",
            }.get(str(categories.get("commitment", "")).lower())
            items.append(
                {
                    "platform": "lever",
                    "platform_job_id": board + ":" + row["id"],
                    "company": board.title(),
                    "title": plain(row["text"])[:255],
                    "location": location[:255],
                    "job_url": url,
                    "description_raw": "\n".join(sections),
                    "source_kind": "lever",
                    "source_board": board,
                    "employment_type": employment,
                }
            )
        if len(rows) < 100:
            return items
    raise SourceError(
        "Lever board exceeded the supported page limit; incomplete listings were not saved."
    )
