# V0 verification - completed 2026-09-10

- Frontend TypeScript and production Vite build: passed.
- Full PostgreSQL backend suite: **22 passed** (644 seconds). Includes fresh/adopted migrations preserving records, legacy tracker regressions, private account isolation, account recovery/session expiry/CSRF/throttling, resume upload/review/download, duplicate live imports, confirmation/history, safe Excel cells and source failure handling.
- Chrome browser suite: **2 passed** (17.4 seconds). New-account signup, recovery-code acknowledgment, resume extraction/review, job matching, employer application link, explicit submission confirmation, interview update and notes, reload persistence, dashboard, Excel download, logout/login, 390-pixel mobile layout and recoverable database error.
- Browser discovery uses a deterministic provider adapter in `tests/browser_app.py` with a disposable database. No real employer application was submitted. The adapter is not shipped in Docker.
- Separate real Greenhouse discovery check: **20 current matches**, no warnings, **6.1 seconds**, using Software Engineer / India and synthetic skill terms. HTTPS certificate verification remains enabled. Pooled clients and certificate loading from memory avoid a Google Drive/OpenSSL file-read stall.
- Added Python implementation static check: passed.
- Current app is served at http://localhost:8080/app from the dedicated local database. Previous fictional records remain unassigned/hidden; personal accounts must register.

## Deployment checks still required

No hosted deployment was performed: Render/Neon account access and secrets are not available. Docker is not installed here, so the Docker image itself has not been executed. The frontend build, Python runtime, migrations and browser workflow were validated locally. Use README deployment instructions, verify hosted HTTPS cookies and runtime-role grants, then repeat the workflow on the provider URL.

Adzuna credentials are not configured and its live API has not been exercised. Default company-board discovery works without them. V0 applications are submitted by the user on the employer site; employer responses require manual status updates. Email verification, automatic submissions and inbox synchronization are not implemented.

Screenshots from disposable browser tests: `.local/v0-dashboard.png` and `.local/v0-mobile.png`. Test accounts and their data were dropped with the disposable database.

Final continuation checks: both targeted ownership/import tests passed (46.65 seconds); static checks and pip dependency checks passed. Restarted the final app, verified HTTP 200 readiness, anonymous session response and current frontend, and verified Create account in Chrome on localhost:8080.


## Greenhouse reliability update - 2026-09-10

- 20 selected backend, provider, cache and migration tests passed in 243.23 seconds. Checks include bounded retries and Retry-After, invalid/oversized responses, bulk-description parsing, ranking beyond the previous 20-candidate cutoff, role aliases, remote-country restrictions, experience-review explanations, cache persistence across service instances, refresh failure fallback, 24-hour expiry and cross-worker refresh deduplication. Existing private-account product tests and fresh/adopted migration tests also passed.
- Both Chrome browser workflows passed in 19.6 seconds using the isolated provider fixture. TypeScript/Vite build and added-code static checks passed.
- Real full-description requests returned 352 Cloudflare, 403 MongoDB, 869 Databricks and 618 Stripe postings (2,242 total) in 6.5 seconds. Counts are a snapshot, not guaranteed coverage.
- Actual database-backed discovery for synthetic Python Developer / India preferences returned 50 matches from three employers with no warnings: 12.77 seconds initially, 3.48 seconds from a new service instance reusing PostgreSQL snapshots. No personal account or application records were created by this live check.
- Applied migration 0003 and granted runtime access to job_board_cache on the separate local product database. Restarted localhost:8080 and verified HTTP 200 readiness and the new frontend assets.
- Earlier figures above describe the previous version. Lever, Ashby and owner/admin features remain deferred. Public deployment remains unperformed.


## Confirmed eligibility update - 2026-09-10

- 33 selected matching, preference-validation, product, cache and migration tests passed in 148.11 seconds. Includes fresher exclusion of Staff/Senior/Principal/Lead; mandatory experience and internship separation; required/preferred/alternative skills; NodeJS aliases and Java/JavaScript distinction; unrelated roles; job types/workplace; existing-profile confirmation gate; persisted preferences; migration preservation.
- 2 Chrome browser tests passed in 13.5 seconds. Browser provider fixture now uses the real eligibility matcher and includes a Staff posting that must be excluded for the fresher. The test confirms new preferences, waits for navigation, reloads, searches, checks Recommended (1), applies/tracks, exports, and logs back in. Mobile and failure recovery also passed.
- TypeScript/Vite production build and added-code static checks passed. Applied migration 0004 to the separate local product database and restarted localhost:8080.
- A synthetic Python/SQL fresher search against real cached company listings returned 2 Needs review candidates, 0 Recommended and 0 senior-level roles, with 4 stale-source notices. This verifies conservative filtering, not complete market coverage or confirmed eligibility. No personal records or employer submissions were created by this check.
- Updated implementation plan: IMPLEMENTATION PLAN.md. Old profiles require confirmation of new preferences; previously saved jobs/history are retained.


## Current run - 2026-09-20

Started the local app and verified HTTP 200 readiness, current assets and the account creation screen in actual Chrome with zero page errors. Database revision is 0004_search_preferences. The runtime role intentionally has no access to migration metadata; the revision was read with the migration account.

The temporary Node dependencies were missing. Restored them from the lockfile using scripts/build_frontend.py; the production frontend build passed. Python dependency consistency passed.

Both Chrome workflow tests passed in 12.0 seconds. These use deterministic employer postings with the real matcher and an isolated database. They cover signup, resume/preferences, mixed-city/remote preferences, Staff-role exclusion, application link and explicit manual confirmation, updates/history, persistence, dashboard, Excel, logout/login, mobile layout and recoverable errors.

Separate live checks refreshed all four sources without errors: Cloudflare 379, MongoDB 402, Databricks 878, Stripe 665 (2,324 listings). Synthetic Python/AI profiles with Python/SQL strongest skills and Bangalore/Remote/Hyderabad returned one Needs review candidate each for fresher and 3-year experience profiles; zero senior roles. One real candidate passed the pre-application posting-availability check. No employer application was submitted and no personal account records were created by live checks.

These checks verify the local manual application-tracking workflow, not guaranteed job suitability or complete internet coverage. Automatic submission, employer-message sync, admin dashboard, configured Adzuna and public-hosted verification remain outside the delivered/verified scope. Live report: .local/live-verification.json. Backend test report: .local/current-verification.xml.

Full current backend suite: **51 passed**, 2 deprecation warnings, in 262.06 seconds. Includes migrations, private data isolation, authentication, parsing, matching, provider/cache failures and export.


## Relevance audit and corrections - 2026-09-20

Reproduced irrelevant matches for the most recently confirmed Python Developer fresher profile. Shared Python mentions admitted support/network/solutions work; incidental "or" skipped explicit experience; parenthesized/spelled-out numbers and years followed by responsibility verbs were missed. Added requested-role evidence and corrections, plus version/input fingerprints for outdated saved matches.

- Full backend regression: 63 passed in 259.27 seconds. After the final experience-format and saved-match API additions, all 37 eligibility tests plus the updated API test passed (38 passed in 10.16 seconds). Four new format cases are additional to the 63-test run.
- Final Chrome workflows: 2 passed in 7.9 seconds after all parser changes; isolated provider fixtures with real matching, signup/profile, tracking, persistence, export, mobile and recoverable errors. No employer submission.
- TypeScript/Vite production build and changed-Python static checks passed.
- Read-only audit of 2,324 cached public postings using the latest confirmed profile: 2 Needs review and 0 Recommended, compared with the previous 50-result cap. Neither remaining posting establishes fresher eligibility. The profile's location is blank, so no location filter applies. No personal records were changed. Snapshot report: .local/relevance-verification.json.
- Local service restarted; /health/ready, /app and /api/auth/session returned HTTP 200.

Rule-based matching is conservative and imperfect; these checks do not establish universal accuracy. Configured employer coverage and manual employer-site application limitations remain unchanged. Users should re-run discovery; saved historical matches remain available with an outdated-match notice.


## Fresher experience regression - 2026-09-20

Reproduced the user's reported failure against the confirmed fresher profile: Software Engineer, AI Agents (Cloudflare) contains `Exp: 5 - 10yrs`, but version 2 returned it under Needs review. The year abbreviation was unrecognized and the uncertainty fallback did not enforce fresher eligibility. Some old saved jobs also contained explicit experience requirements and no current matcher version.

Version 3 requires affirmative fresher/zero-experience evidence from the full employer description and rejects conflicting or uncertain experience. Full-description checks run independently of role-section filtering. Numeric abbreviations, ranges, months, decimals and conservative conflicting-alternative checks have regression coverage. Search cards display the quoted eligibility statement; old saved match assessments are invalidated without deleting application history.

Fresh provider requests returned Cloudflare 379, MongoDB 402, Databricks 878 and Stripe 665 postings. The confirmed fresher profile returned one Needs review candidate: MongoDB Software Engineer 2, explicitly accepting recent graduates (including Summer 2026) or professionals with up to 18 months of experience. Other eligibility requirements remain for user review. The 5-10-year Cloudflare result was excluded. Report: .local/fresher-live-fresh-audit.json. No personal records were changed by this audit.

Final production build passed. Both Chrome workflows passed in 14.9 seconds with seven provider fixtures, including abbreviated experience, months, decimals, unknown experience and requirements in stripped sections. Tests assert exactly one accepted result, Needs review (0), visible employer evidence, submission confirmation, application history, reload persistence, export and mobile/error recovery. An intermediate browser run failed because the new assertion was ahead of compiled assets; rebuilding the final UI resolved it.

The local service was restarted; /health/ready and /app returned HTTP 200. This validates the tested cases and current sources, not a guarantee that arbitrary employer wording can always be interpreted correctly. Conservative filtering can exclude suitable jobs.

Full final PostgreSQL backend suite: **87 passed**, 2 deprecation warnings, in 315.69 seconds. Includes actual search-route rejection/persistence tests, eligibility regressions, private account isolation, migrations and export. Report: .local/fresher-verification.xml.


## Changed-resume / repeated-output investigation - 2026-09-20

Compared the newest three resume versions and reran their confirmed inputs against 2,324 stored public postings. The newest version was selected correctly. All retained Python Developer, fresher status and Python among their strongest skills, and all matched MongoDB Software Engineer 2. Public listing snapshots are cached; personalized ranking is recomputed. This overlap is not evidence of an old resume being reused.

Found and fixed a separate stale-output defect: failed or throttled searches left previous cards on screen. The UI now clears results before requests, refreshes the newest profile, displays its filename/strongest skills, and binds the request to its ID and input fingerprint. The server rejects obsolete input snapshots, checks for profile changes during provider processing, and returns the exact search inputs. Changed confirmed inputs reset the repeat-search cooldown; unchanged confirmation retains it.

Read-only input/output audit: current profile => one MongoDB graduate candidate; AI Engineer only => zero; strongest skills RAG/LLMs only => zero; location London => zero. No real profiles or application records were changed. Report: .local/changed-input-output-audit.json.

Tests added: second resume Python -> Java changes returned title and resume attribution; unconfirmed new resume blocks search; old request returns 409; changed location returns empty items; in-flight profile change rejects output; saved history remains separate. Browser test covers second upload, confirmation, reload, changed result title, filename display and failure clearing. The initial filename assertion used an exact text match against a labeled paragraph; it was corrected to assert the full displayed label.

Production frontend build and changed-Python static checks passed. Local service restarted; /health/ready and /app returned HTTP 200. Persistent user verification instructions saved in AGENTS.md. Provider coverage remains four configured employers; job overlap is legitimate and no filler results are generated.

Final validation: **89 backend tests passed** in 333.43 seconds (2 deprecation warnings); **3 Chrome workflows passed** in 15.6 seconds. Backend report: .local/changed-profile-verification.xml.


## All selected search skills required - 2026-09-20

User requested matching the selected skill combination rather than any one skill. Matcher version 4 requires every canonical selected strongest skill in role-specific content. The profile field is now labeled Required skills for job search and explains all entries are mandatory. Existing role, fresher and employer-requirement gates remain active; old match assessments are invalidated.

Read-only audit of the latest confirmed fresher profile against 2,322 stored listings: LangChain, RAG, LLMs, Python, Claude Code, Codex and SQL together return zero matches. The previous generic Python posting is excluded. No user inputs were changed. Report: .local/all-skills-output-audit.json.

Four Chrome workflows passed in 16.9 seconds, including the complete Python/LangChain/RAG/LLMs combination, rejecting partial-skill postings, detail reload, changed resumes, failure clearing and application tracking/export. Production TypeScript/Vite build and static checks passed. Unit cases remove each selected AI skill in turn, verify aliases and boilerplate exclusion, and retain the fresher experience gate.

Legacy test fixtures that assumed any-one-skill matching were updated to express their intended independent behavior: a ranking fixture now includes both selected skills; a contrasting-language fixture marks SQL optional to the employer while keeping it visible for the Python profile. The updated contrasting-resume API regression passed independently (18.87 seconds).

Broad backend run: 94 passed, 1 failed in 276.97 seconds. The process had already loaded the earlier contrasting-language fixture that required SQL for Java applicants; after correcting the fixture to mark SQL optional, the isolated regression passed (18.87 seconds), and passed again after the broad run completed (9.07 seconds). No application code changed after the browser run. Raw reports: .local/all-skills-verification.xml and .local/all-skills-fixture-recheck.xml. Local readiness returned 200 and the final compiled UI asset was verified.


## Public startup source and internship compensation - 2026-09-20

Implemented Ashby public postings adapter and namespaced PostgreSQL cache, default board sarvam. Live source check: 61 public listings, 52 Bengaluru, 1 internship. Database-backed discovery with the current confirmed profile: 61 cached listings, zero eligible matches, zero warnings; no personal profile or application changes. Report: .local/ashby-live-verification.json. Source remains distinct from Greenhouse and optional Adzuna. LinkedIn/Indeed partner integrations, Naukri feeds and Lever are documented next steps, not represented as active connections.

Implemented persisted paid/unpaid/either internship preference, explicit compensation evidence, unknown/conflict exclusion for strict choices, and disclosure on search cards. Structured Ashby employment type and salary metadata are used without assuming an internship is paid. New tests cover unpaid/paid wording, negation, monetary stipends, benefits-only text, conflicting evidence, equity exclusion, metadata normalization, unlisted postings, and cached Ashby API imports.

Five Chrome workflows passed in 19.4 seconds, including paid-only to unpaid-only preference changes and persistence after reload. The application/history/export, changed-resume, all-required-skills, mobile and recoverable-error flows also passed. Production TypeScript/Vite build and changed-code static checks passed. Restarted localhost:8080 and verified readiness HTTP 200 and the final compiled UI asset.

No schema migration needed for internship_pay inside existing JSON preferences. Existing profiles retain compatibility; review the profile to choose a strict pay preference. Manual employer-site application flow is unchanged; no external application was submitted and no paid service was enabled.

Final complete backend run: **107 passed**, 2 deprecation warnings, in 280.39 seconds. Includes paid internship source metadata, Ashby cache/import, persisted preferences and all earlier privacy, matching, migration and export regressions. Report: .local/sources-internships-verification.xml.


## Screenshot: empty startup search - 2026-09-21

Reproduced the exact confirmed preferences against a fresh Sarvam response: 61 postings, 12 role matches, zero postings passing the conservative fresher check, zero containing all selected required skills, and zero role-content Codex mentions. These are independent checks, not additive counts. Required-skill coverage: LLMs 22, LangChain 2, Python 21, RAG 2, SQL 9, Claude Code 2, Codex 0. Report: .local/startup-empty-live-audit.json. No profile or application records were modified.

The empty result is consistent with the configured single-employer coverage and user-required filters. Fixed the misleading Startup label and generic explanation: Ashby employer boards now explicitly displays connected coverage, and the search response/UI shows request-local counts and skill coverage. The cache notice explains that refreshing may still produce zero matches. Switching source clears previous results, diagnostics, warnings and errors; switching during an active request is disabled. No matching criteria were relaxed.

Six Chrome workflows passed in 23.5 seconds. New scenario covers fresher + paid internship preference + missing Codex on the Ashby source, a saved-listing warning, zero-result explanation, source-change clearing and reload persistence. The existing account, application/history/export, mobile/failure, changed-resume, all-skills and pay preference flows passed. An initial reload assertion expected capitalized Codex; it was corrected to the existing canonical lowercase representation. Production TypeScript/Vite build and static checks passed. Local app restarted, readiness returned 200, and final compiled UI asset verified.

API regression also reproduces an empty result from a stale but usable Ashby cache while preserving prior saved history. Diagnostic counts are tested for isolation between requests. Source failures continue to return errors, not fabricated successful zero-result summaries.

Final full backend run: **108 passed**, 2 deprecation warnings, in 308.39 seconds. Report: .local/startup-empty-verification.xml.


## Resume ranking and combined sources - 2026-09-21

Root causes confirmed: all selected strongest_skills were mandatory posting keywords, while Ashby covered only configured employers. Broadening search does not remove fresher eligibility or guarantee suitable vacancies. Existing mandatory selections remain unchanged; the user explicitly clears or revises them on profile review. All confirmed resume skills now contribute to ranking. Matching version 6 invalidates old saved assessments.

Live audit with the latest confirmed profile: 2,434 postings across Cloudflare, MongoDB, Databricks, Stripe, Sarvam and Meesho. Saved mandatory requirements returned zero. A read-only copy with an empty mandatory-skills list returned one MongoDB Software Engineer 2 posting, matching Python Developer / Backend Developer roles and four confirmed skills. Employer evidence explicitly accepts recent graduates (including Summer 2026) or professionals with up to 18 months of experience. No source warnings after the Lever parser correction. The real profile, resume and applications were not modified. Report: .local/resume-ranking-live-audit.json. This is a point-in-time result, not a promise of more jobs or universal accuracy.

Lever's live response included postings with empty descriptionPlain and descriptions supplied through HTML or requirements lists. The adapter now preserves those sections and a regression covers that response shape. Combined search merges and deduplicates before ranking/limiting, keeps successful sources when another fails, and fails clearly if all sources fail. Its default coverage remains six configured employers, not all internet platforms.

Validation: full backend run 112 passed (327.45 seconds); subsequent focused matching/provider run 85 passed including the new real-response regression; additional API/database integration test passed for combined Lever import, strict-to-optional requirements, current resume identity and persisted profile. Seven Chrome workflows passed (29.2 seconds), including changed resumes, failed-search clearing, mobile/database errors, all mandatory AI skills, paid/unpaid internships, and the new explicit mandatory-filter removal/reload flow. Frontend TypeScript/Vite build and final Ruff checks passed. Local app restarted; /health/ready and /app returned 200, private discovery requires sign-in, bundle index-BV-O-dgR.js served.

No schema migration, paid service, automatic application submission or external-account action was introduced. Broader approved sources and more employer coverage remain follow-up work.


## Combined mandatory-skill and location restrictions - 2026-09-21

Reproduced the screenshot using the current confirmed profile: Bangalore, fresher with zero professional years, full-time/internship, any internship pay, and seven mandatory skills. Removing mandatory skills alone still produces zero matches. The previously reported MongoDB recent-graduate role is in Dublin, so it is not a match for Bangalore. The earlier broader-location audit must not be presented as evidence of a suitable result for this updated profile.

Added exact counterfactual counts to each search: results without mandatory skills, and results without both mandatory skills and the city filter. Other eligibility checks remain enforced. Counts do not import or display off-preference jobs and do not mutate preferences. The UI explicitly warns when changing skills alone cannot resolve the empty result and links to profile review. Additional Meraki-Labs and Ema public-board checks did not establish a matching fresher role; neither was added merely to inflate coverage.

Validation: 89 affected matching/provider/cache/API tests passed, including wrong-city exclusion, retained experience/pay checks, changed-profile identity and persistence. All eight Chrome workflows passed in 25.7 seconds, including the new two-filter scenario. TypeScript/Vite build and Ruff checks passed. This fixes the incomplete explanation; it does not create vacancies or establish that a job exists for every combination of requirements.

Final exact-profile audit: 2,433 postings, 336 role matches, 3 fresher-evidence postings, zero containing every mandatory skill. Zero pass with mandatory skills removed; one passes with both mandatory skills and location removed. Actual suggestions remain zero for the saved Bangalore profile. Report: .local/combined-restrictions-live-audit.json. Restarted localhost:8080, readiness/UI HTTP 200 and bundle index-DP5-aHmt.js verified.


## Expanded employer coverage and optional experience review - 2026-09-21

Implemented Meraki Labs and Ema public Ashby boards (eight configured employers overall). Existing profile preferences are preserved. New include_uncertain_experience is false by default and can be explicitly saved from profile review. Without fresher evidence, results remain excluded unless this option is enabled; opted-in candidates are always Needs review with a prominent unconfirmed-eligibility warning. Mandatory skills, location, pay, seniority and positive experience conflicts remain enforced. Student enrollment, academic and portfolio constraints are surfaced with employer quotations, not treated as confirmed qualifications.

Real-posting audit exposed "1 to 5 years of strong Python fundamentals" in a Meraki AI Engineer role. The previous parser missed this because experience was not written explicitly. Added skill-duration recognition and regression tests; that role is now excluded. Explicit mandatory professional/production experience without a number also remains excluded.

Final audit of 2,500 available stored postings and the confirmed Bangalore profile: existing seven mandatory skills -> zero; optional skills with strict fresher evidence -> zero; optional skills plus opt-in uncertainty review -> one AI Engineer Intern at Meraki Labs, Bangalore/on-site. Python alone as mandatory plus uncertainty review also yields that one candidate. It mentions Python, RAG and LLMs but requires current degree enrollment, academic/proof-of-work criteria and a public GitHub profile. It is a possible role for personal review, not confirmed eligibility. No profile or application was modified by these audits. Report: .local/expanded-review-live-audit.json.

Validation: full backend suite 129 passed (285.37 seconds); ten Chrome workflows passed (36.9 seconds), including an isolated actual-employer-snapshot workflow. That workflow copies non-identifying confirmed search inputs, reproduces zero results under strict settings, explicitly clears mandatory skills and enables review, verifies the one real internship and its enrollment/GitHub warnings, then reloads the job detail. It does not submit applications or use the user's account. Screenshot: .local/actual-bangalore-review.png. Snapshot test is optional in normal CI and enabled through E2E_LIVE_POSTINGS_PATH; private local audit files are excluded from the source archive.

Production frontend build passed. Local app restarted at localhost:8080; readiness and frontend returned HTTP 200, and bundle index-BFdq0SGv.js was verified. No paid service, new schema migration, external account action or automatic application submission introduced. No promise of universal accuracy or guaranteed vacancies.
