# Jobspace - real-user V0

A private job-search workspace with signup, resume review, supported live job discovery, employer-site applications, status history, dashboards and Excel export. React/TypeScript and FastAPI are served from one origin; PostgreSQL stores accounts and data.

## Open it on this computer

Open **http://localhost:8080/app**. Select **Create account**, enter your name/email and a password of at least 12 characters, and save the recovery code. Old owner-demo credentials do not authenticate personal accounts. New accounts start empty; earlier fictional rows are preserved but hidden.

To start the prepared local app in PowerShell:

```powershell
.\.venv\Scripts\python.exe scripts/local_demo.py start
```

The historical helper filename is retained. The product uses the separate PostgreSQL instance at 127.0.0.1:55432. It does not alter the original learning database or the existing service on port 8000. The root `.env` configures port 8080 on this computer.
On Windows, the PostgreSQL data directory is `%LOCALAPPDATA%\Jobspace\pgdata`, outside the project folder. This keeps database files off cloud-synced drives.

## Use the five features

1. **Create account / Sign in:** each account has its own workspace. Save the recovery code privately. Forgot password uses that code; a reset invalidates old sessions and issues a replacement code. V0 does not send verification or password-reset emails.
2. **Resume & profile:** upload searchable PDF, DOCX or UTF-8 TXT (5 MB, PDF up to 20 pages). Review suggested skills and experience, then explicitly confirm Fresher/Experienced, relevant professional years, internship months separately, optional priority skills, target roles, employment types, workplace preference, location and country. Correct omissions, then select **Confirm profile & find jobs**. Scanned PDFs need conversion to searchable text. The parser extracts text and suggests known skill names; it does not invent qualifications or use paid AI.
3. **Find live jobs:** select a source and **Find matching jobs**. Results are fetched from configured employers, matched to confirmed roles/location, and saved to your private job board. The explanation shows matched and missing skills from the posting. A result needs at least one confirmed resume skill; selected skills to prioritize show a coverage percentage. At 75% or higher, a posting can be Recommended if other checks pass; lower-coverage matches and postings with employer-required skills missing from your resume appear under Needs review. Never add a missing skill to your resume unless it is true. Search still enforces role, location, seniority, explicit experience, job type and internship-pay filters. Internships do not automatically count as professional years. Remote-country restrictions remain subject to employer confirmation. There is no minimum result count or padding with weak matches. Searches have a 60-second cooldown.
4. **Prepare, apply and track:** on a saved job, select **Prepare resume draft** to compare your latest confirmed resume with that job's saved description. Each run requires your explicit consent to send both texts to Groq. The server requires a Groq API key, model name and a separately enabled Zero Data Retention setting. The result is an un-saved LaTeX draft with keyword evidence, possible gaps and rewritten experience bullets; download it, review every claim, and compile/inspect it yourself. This is not an ATS scan or score, and it cannot guarantee selection. You may instead call `@resume-tailor` in VS Code Copilot Chat and attach the resume and job description; that agent does not read your Jobspace account. Then select **Apply on employer site**, complete and submit the real employer form yourself, and confirm submission in the tracker. Use **Update application** for status, date and notes. The timeline persists after reload. Merely opening a link never counts as submitted. Employer responses do not automatically sync; update the tracker when you receive one. Manual job entry and tracking are also available.
5. **Overview / Applications:** see only your own totals, filter records, then **Export Excel**. Exports use the current filters. Dates in list/dashboard filters mean first tracked; date applied is separately editable. Dashboard cards count current statuses.

## Local setup from source

Use Python 3.12, Node.js 22 and PostgreSQL. In a fresh Windows checkout:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe scripts/local_demo.py setup
.\.venv\Scripts\python.exe scripts/build_frontend.py
.\.venv\Scripts\python.exe scripts/local_demo.py start
```

Fresh helper setup defaults to localhost:8000 and refuses to overwrite existing credentials. Change `APP_ORIGIN` in root `.env` to an available local port before starting. Setup migrates and grants access; it no longer creates a public demo or owner login. Stop the helper's app/database with `scripts/local_demo.py stop` when no tests are using them.

For an existing PostgreSQL server, create a dedicated database, copy `.env.example` to `.env`, and configure `DATABASE_URL` for a restricted runtime role and `MIGRATION_DATABASE_URL` for its database owner. Run:

```text
python -m alembic upgrade head
```

Use `scripts/grant_runtime.sql` with psql (`-v runtime_role=jobspace`) while connected as the database owner. Create the login role separately with your own password. psql takes `postgresql://` URLs; SQLAlchemy accepts `postgresql+psycopg2://`. Build with `npm ci` then `npm run build` inside `frontend`, and start `python -m uvicorn backend.server:app --host 127.0.0.1 --port 8000`.

On cloud-synced Windows drives use `scripts/build_frontend.py`; it builds dependencies on the local temporary disk and copies compiled assets back. `APP_ORIGIN` must exactly match the browser address, including port. Localhost and 127.0.0.1 differ. Hosted deployments require HTTPS and `COOKIE_SECURE=true`.

## Supported sources

`GREENHOUSE_BOARDS=cloudflare,mongodb,databricks,stripe` is the default. Up to six configured employer boards are queried using the public Greenhouse Job Board GET API. Job discovery sends only search terms to job providers, not resumes or profile details. The optional resume tailoring feature is separate: after explicit per-request consent, it sends the latest confirmed resume text and the saved job description to Groq. Greenhouse search ranks every available description before returning up to 50 matches. Public listings are cached in PostgreSQL: snapshots under 15 minutes old are reused; snapshots up to 24 hours old are returned with a warning and refreshed after the response. Older snapshots are excluded if refresh fails. Refresh is triggered by searches, not an always-running paid scheduler. Duplicate refreshes across workers are prevented with a database lease. Temporary network/server failures receive bounded retries; provider Retry-After delays postpone further attempts. A posting is rechecked before starting a Greenhouse application. A source failure returns an explicit error or partial-results warning, never invented jobs.

### Resume tailoring provider setup

Set these variables only in the server environment (never in frontend code or a committed file):

```text
GROQ_API_KEY=<your Groq API key>
GROQ_MODEL=<model ID you have checked in your Groq account>
GROQ_ZERO_DATA_RETENTION_CONFIRMED=true
```

Before enabling the last setting, turn on Zero Data Retention in your Groq account. The application cannot verify that provider-side setting; the environment flag records your confirmation and prevents the feature from running unless set. The page asks for consent and price confirmation on each draft. No model is selected by default: check the current price and availability in your Groq account before setting `GROQ_MODEL`. The app cannot guarantee free usage or enforce a provider spending limit. Groq's current model pages can list per-token prices. Groq documents that inference data is not retained by default, may be logged for reliability or abuse investigations unless ZDR is enabled, and retained data is stored in the US. Review Groq's current [data handling documentation](https://console.groq.com/docs/your-data), [model pricing](https://console.groq.com/docs/models), and terms before sending personal information. Model availability, pricing, and account limits can change.

To list model IDs available to your API key, first put the key in the root `.env`, then run this from the project root in PowerShell. This reads the key directly from `.env`, checks for an empty value, and never prints it:

```powershell
@'
from dotenv import dotenv_values
import httpx

key = (dotenv_values(".env").get("GROQ_API_KEY") or "").strip()
if not key:
    raise SystemExit("GROQ_API_KEY is empty in .env. Add your key, then try again.")

response = httpx.get(
    "https://api.groq.com/openai/v1/models",
    headers={"Authorization": f"Bearer {key}"},
    timeout=20,
)
if response.status_code == 401:
    raise SystemExit("Groq rejected the key (401). Check that it is valid and active.")
response.raise_for_status()
print("\n".join(model["id"] for model in response.json()["data"]))
'@ | .\.venv\Scripts\python.exe -
```

This lists IDs, not prices or a promise of free use. Check Groq's current model page and your account's billing/usage before choosing one. Put the exact chosen ID in `GROQ_MODEL` and restart the app.

The app returns a draft in the current page and does not store it. Download the `.tex` file, inspect it, and compile it yourself (for example, in Overleaf, which is a separate service). The layout is a new, simple single-column format; it does not include Jake's Resume template code. Static format checks only inspect the generated LaTeX. They are not an employer ATS and do not predict hiring decisions.

The VS Code agent is invoked as `@resume-tailor` in Copilot Chat. Attach or paste the resume and the job description; it is not connected to Jobspace's database or Groq settings. Copilot processes that chat content under the user's Copilot plan and policies, so use it only if those terms are acceptable.

For optional Adzuna search, register with Adzuna and set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in server environment variables. Only role/location/country search terms are sent. Without credentials, Adzuna is visibly unavailable and company-board search still works. There is no arbitrary-web scraping or universal automatic submission.

Provider references: https://docs.greenhouse.io/job-board.html and https://developer.adzuna.com/overview.

## Deploy with Render and Neon

The Dockerfile builds the frontend and runs the API as an unprivileged OS user. `render.yaml` requests a free Docker web service. Hosting needs your repository, Render account and Neon credentials; no public URL is created by local setup.

1. Create a dedicated Neon database for real accounts. Keep development/test data separate. Use TLS (`sslmode=require`), a direct owner connection for migrations and a pooled restricted connection for runtime.
2. In a separate terminal environment, set the hosted migration URL and apply `alembic upgrade head`. Create the runtime login role and grant access with `scripts/grant_runtime.sql`. Do not seed fictional data. Verify the permissions include the new resumes, user_jobs, user_sessions and auth_attempts and job_board_cache tables.
3. Push source to your repository, excluding `.env`, `.local`, `.venv`, node_modules and private files. Create the Render Blueprint service using `render.yaml`.
4. Set `DATABASE_URL`, the exact provider-generated HTTPS `APP_ORIGIN`, and optional source credentials. Keep `COOKIE_SECURE=true`. No OWNER_EMAIL or OWNER_PASSWORD_HASH is needed. Users register through the UI.
5. Keep `RUN_MIGRATIONS=false` after explicit migration. Optional startup migration requires `RUN_MIGRATIONS=true`, `MIGRATION_DATABASE_URL`, and runtime grants/default privileges; it never seeds data. Remove the privileged migration secret from runtime when not needed.
6. Deploy and verify `/health/ready`, signup, login, resume review, live discovery, private records and Excel download. Use test accounts for verification and do not submit an employer application just to test the app.

Render's free service sleeps after inactivity, so open it before presenting. Resumes are stored in PostgreSQL rather than the container filesystem. Free quotas are limited; monitor usage and configure database backups/retention before inviting a large audience. No paid resources are enabled automatically.

Hosting references: https://render.com/docs/docker, https://render.com/docs/free, https://neon.com/docs/connect/connection-pooling.

## Architecture and tradeoffs

Browser -> same-origin FastAPI -> SQLAlchemy -> PostgreSQL. The API also fetches supported provider GET endpoints and runs document extraction in a bounded subprocess.

- **Private access:** every data endpoint authenticates a server-side session. Queries scope jobs, applications, history, resumes, statistics and exports to the current user. Public metadata and health checks contain no account details. Legacy `/jobs` URLs now require sign-in to protect real data.
- **Authentication:** Argon2 password hashes; random session tokens stored hashed in PostgreSQL; eight-hour expiry; HTTP-only, SameSite Strict cookies. Writes require the configured Origin and a session-specific CSRF token, which protects against forged browser requests. Login/recovery and signup are throttled in the database. Recovery codes are stored hashed and rotate on reset. Email is an account identifier, not verified ownership in V0.
- **Jobs and matching:** imported public postings can share one canonical row; `user_jobs` controls whose board includes them and stores personalized match explanations. Manually entered jobs belong to their creator and cannot be edited by other accounts. Duplicate URLs and nonempty platform/posting IDs are prevented within that scope. One application per user/job.
- **Consistency:** application status and its history entry commit together in one database transaction. `applications.status` is the tracking source of truth. Legacy `jobs.status` is not synchronized. Resume versions linked to applications are retained; unused versions can be deleted. File content does not change when profile review fields are edited.
- **Storage:** resumes are private database blobs, capped at ten versions per user. This simplifies V0 deployment but object storage and account deletion/retention tools are future improvements. Resume parser subprocesses have a timeout and, on Linux, memory/CPU limits. Tailored drafts are returned to the browser but are not stored.
- **Migrations:** 0001 adopts the old schema after compatibility/duplicate checks; 0002 adds real accounts without deleting legacy records. Legacy owner auth/seed modules remain for regression testing; the deployed entry point is `backend.server:app`, which uses `backend.product`. Do not deploy `backend.app` directly.

## Validation

Run backend tests against a disposable PostgreSQL instance with a role permitted to create databases:

```text
TEST_ADMIN_DATABASE_URL=<disposable database owner URL>
python -m pytest tests -q
```

Each database test creates and drops only its own randomly named database. Browser tests use `python scripts/test_e2e.py`, which reads the migration connection from root `.env`, creates an isolated database and uses installed Chrome. The browser-only provider fixture is in `tests/browser_app.py`; it is not included in the Docker image. Live provider connectivity is checked separately, without sending applications. See `VERIFICATION.md` for actual results and remaining deployment checks.

## Later milestone: owner/admin dashboard

Deferred at the user's request: add an explicit owner/admin role, registered-user counts, account management and platform-wide statistics. Current personal accounts have equal permissions. This milestone is not implemented.


## Greenhouse reliability update

Migration `0003_job_board_cache` stores only public employer listings and source-refresh timestamps, separate from private user matches. Full-description listing requests replace per-result detail fetching. Successful refreshes replace a board snapshot, removing disappeared postings from future discovery; existing saved applications remain intact. Before applying, the original posting is still verified with the provider.

Search reports source outages and stale data explicitly. A cache hit does not update Last checked; that timestamp reflects a successful provider fetch. If a board has no valid snapshot, the first search waits for its initial request. Initial fetches and refreshes run at most two boards concurrently. There is no paid service dependency. Lever, Ashby and the owner dashboard remain later milestones.


## Confirmed search profile and eligibility update

Migration `0004_search_preferences` adds nullable preferences to resume versions without inventing answers or deleting existing data. Existing profiles must complete the new preferences before another search. Reopen **Resume & profile**, confirm the form, and use **Find live jobs** again. Previously saved jobs and application history remain saved; match details on those records describe the search that saved them.

Required skills, preferred skills, alternatives and experience are extracted with conservative rules and source evidence. Known aliases such as NodeJS/Node.js are normalized; Java and JavaScript remain different. No paid AI is used. Unstructured, ambiguous, educational, certification and work-authorization conditions remain Needs review. This is a screening aid, not a verified eligibility decision. A source can legitimately return few or no suitable jobs, especially for freshers at the currently configured employers.

The requirements parser preserves paragraph/list boundaries from provider descriptions. All supported discovery paths, including optional Adzuna, apply the same eligibility rules. Strongest skills must belong to the user's confirmed resume skills. Profile answers are private and are not sent to Greenhouse.

See `IMPLEMENTATION PLAN.md` for the current milestone and deferred work.


### Matching relevance and saved results

Discovery uses the reviewed resume skills and confirmed search preferences. Requested roles must have supporting job-title and role-content evidence; sharing Python with a support or network-security posting is insufficient for a Python Developer search. Open "Why this fits your requested role" to see the evidence. Explicit experience above your confirmed professional years is excluded, including formats such as "two (2) years" and "4+ years building". Unclear requirements stay in Needs review.

After changing your profile, run Find live jobs again. Older saved jobs remain in your job board; their detail page warns when the matching version or confirmed inputs have changed. A blank location means no city/location filter, so set your preferred locations if worldwide results are unsuitable. Matching uses rules and limited employer feeds: it can miss suitable jobs and cannot guarantee eligibility.


## Strict fresher eligibility correction - 2026-09-20

A real Cloudflare AI Agents posting contained `Exp: 5 - 10yrs`. The parser missed the abbreviation and the previous Needs review fallback admitted it for a fresher. Experience parsing now recognizes abbreviated years and ranges; a separate fresher gate scans the entire description, including sections removed from role matching. It requires quoted affirmative evidence accepting freshers, recent graduates or zero experience. Missing, conflicting or ambiguous experience is excluded from fresher results in both tabs. Positive preferred experience is also conservatively excluded; this may omit eligible postings rather than guess.

Search cards show the employer's exact fresher-eligibility statement. Matcher version 3 invalidates historical recommendations; saved jobs and application records are retained, and their detail pages mark old matches as outdated. Re-run Find live jobs after refreshing the page. Needs review can still indicate other uncertainties such as employment type or education; it no longer substitutes for fresher experience evidence.

Tests include the actual abbreviated wording, months, decimal years, education alternatives, internship conditions, experience hidden by section stripping, negated fresher statements and a real recent-graduate/upper-bound clause. API and Chrome workflows exercise filtering and saved evidence. No automatic employer submissions are performed.


## Changed-resume search verification - 2026-09-20

Discovery uses the newest uploaded resume after it is confirmed. A new file does not guarantee different jobs: target roles are alternatives, and a posting must match at least one confirmed resume skill. Cached employer listings are shared public source data; ranking is recomputed from each search profile.

Fixed stale display behavior: starting a search clears previous cards, including when the request fails or is throttled. The frontend refreshes the active profile before searching and displays its filename and priority skills. Requests identify the resume and fingerprint of confirmed inputs; obsolete requests and input changes during provider processing return 409 rather than importing results for the wrong profile. Responses include the exact search profile. Confirming changed search inputs resets the one-minute repeat-search cooldown; confirming unchanged inputs does not.

Regression scenarios include a Python-to-Java second resume with different output, an unconfirmed new resume, stale request identifiers, a location change producing zero results, profile changes during provider processing, and browser failure clearing. Job board retains saved history; Find live jobs displays only the current search results. Project AGENTS.md now records the user's persistent instruction to verify output against actual inputs end to end.


## Required skill combination - 2026-09-20

Historical behavior (superseded by the user-approved update below): selected strongest skills were all required, not alternatives. Matching version 4 invalidated older saved match assessments.

Existing saved jobs and application history are preserved. No new AI service or paid dependency is used.


## Additional platforms and internship pay - 2026-09-20

Implemented Ashby public employer-board discovery, configured by ASHBY_BOARDS (default sarvam). The source dropdown separates existing Greenhouse employers from Startup / Ashby job boards. Sarvam's official careers page links to its Ashby board. A live check returned 61 public postings (52 Bengaluru; 1 internship); the actual cache and current strict profile returned zero matches without warnings. Unlisted postings are skipped. Provider employment type and disclosed salary metadata inform matching; metadata is not passed as unknown job-table columns. Namespaced cache keys prevent collisions, and existing refresh leases, retry limits and freshness rules apply. Ashby posting availability is checked before starting an application.

Internship preferences: paid only, unpaid only, or either including undisclosed pay. The profile asks when Internship is selected. Strict choices require explicit matching pay evidence; missing/conflicting pay stays unknown. Paid leave and equity are not proof of a paid internship. The preference persists in existing search_preferences JSON, so no schema migration is required. Existing profiles default to either until reviewed; all selected skill and fresher gates remain enforced. Matcher version 5 invalidates older assessments.

Platform expansion plan:
- LinkedIn: obtain an appropriate approved partner/feed agreement; its documented Talent APIs are recruiting integrations, not an enabled consumer job-search feed in this app. https://learn.microsoft.com/en-us/linkedin/talent/apply-connect/create-apply-connect-jobs
- Indeed: evaluate Publisher/partner access and permission to use listings for personalized matching. No integration or credentials enabled. https://docs.indeed.com/
- Naukri and other commercial boards: request authorized feed/API access. A public search API was not verified in this session. Users can already add a posting manually from its URL; these platforms are not labeled connected.
- Bengaluru startups: add verified employer boards through existing Greenhouse/Ashby settings, using Bengaluru/Bangalore location filters. Sarvam is the first Ashby employer; this does not cover all Bengaluru startups. https://www.sarvam.ai/careers
- Lever: documented public employer Postings API is the next independent adapter; not implemented in this change. https://github.com/lever/postings-api
- Adzuna: existing optional integration requires registered credentials; not enabled here.

Ashby API reference: https://developers.ashbyhq.com/docs/public-job-posting-api . No paid services, automatic applications or external account actions enabled.


## Explain empty startup searches - 2026-09-21

Reproduced the reported screenshot with a fresh Sarvam response and the current confirmed profile. Of 61 postings, 12 match a requested role, zero pass the conservative fresher evidence check, zero contain all seven selected required skills, and zero mention Codex in role-specific content. Counts are independent, not additive exclusion totals. The source returned data correctly; the empty result follows the user's strict requirements.

Fixed misleading presentation: renamed Startup / Ashby job boards to Ashby employer boards, explicitly listed connected-employer coverage, and added request-local search diagnostics. Empty results now show postings checked, eligible total, requested-role count, fresher evidence count and per-skill coverage. Required skills and fresher/pay preferences remain unchanged. The saved-listing notice no longer promises matches after waiting. Changing the selected source clears previous results, warnings and diagnostics; source switching is disabled during a search to avoid attributing a pending response to another source.

Diagnostics are calculated from the same postings and matching helpers used for that request, passed through the search endpoint, and never stored in shared global state. Source failures remain errors; they are not represented as successful zero-result searches. Saved job/application history is preserved.


### Resume-based ranking and combined search

Find live jobs defaults to **All connected free sources** (configured Greenhouse, Ashby and Lever employers). This is not an internet-wide search. `LEVER_BOARDS=meesho` adds the public Lever employer feed; up to six board identifiers can be configured. Listings are merged and deduplicated before ranking, and a failed source is reported while available sources remain usable. Adzuna stays a separate credential-dependent option.

On Resume & profile, **Skills** contains your confirmed resume skills and influences ranking. **Skills to prioritize** is optional. Any result must mention at least one confirmed resume skill. The card shows what percent of selected priority skills appeared: 75% or higher can be Recommended if other checks pass; lower coverage appears under Needs review. If the employer lists a required skill that is missing from your resume, the posting can still appear under Needs review with a warning. This helps you review the job; it does not claim you have that skill. Existing experience, location, job-type, seniority and pay checks remain enforced.

Lever public API documentation: https://github.com/lever/postings-api . Applications still open on the employer site; no automatic submissions are made.


### Optional review of unclear fresher eligibility

Resume & profile now offers **Include unclear fresher eligibility in Needs review**. It is off by default and saved with the reviewed profile. Explicit positive experience requirements, senior roles, location conflicts and strict internship-pay conflicts are still excluded. Missing employer-required skills are shown under Needs review with evidence instead of being silently hidden. A role with no explicit fresher evidence can appear only under Needs review after opt-in; its card says eligibility is unconfirmed. Quoted student-enrollment, academic and portfolio conditions are displayed for personal review. This is not an eligibility guarantee.

## Partial skill matches - 2026-11-15

The user-approved rule replaces the earlier all-selected-skills hard filter. A job must match at least one confirmed resume skill to appear. Selected priority skills are counted together: at least 75% coverage can be Recommended when the other checks pass; lower coverage is Needs review. Explicit employer-required skills not found in the confirmed resume, and unmet employer alternatives, are now shown as Needs review with a warning instead of being silently hidden. The user must verify those requirements before applying; the app never adds unverified skills to a resume.

Role relevance, seniority, numeric experience conflicts, location/work authorization, employment type and internship-pay restrictions remain enforced. This update can reveal partial matches, but it does not promise results if those remaining filters exclude all connected listings. Matching version 8 invalidates older saved match assessments while retaining saved jobs and application history.

For broader resume-based suggestions, keep all genuine skills under Skills, select only essential mandatory posting skills (or none), retain your intended location, and explicitly choose whether uncertain experience is acceptable for review. Existing profiles are not silently changed.

The default Ashby configuration now includes `sarvam,Meraki-Labs,ema`; existing installations can update ASHBY_BOARDS to add these public employer boards. All connected free sources covers configured Greenhouse/Ashby/Lever employers, not every internet job board.
