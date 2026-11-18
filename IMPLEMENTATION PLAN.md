# Jobspace V0 implementation plan

## Current milestone: accurate, user-confirmed job matching

User-approved scope: replace broad keyword recommendations with an explicit search profile and eligibility checks. Retain the free Greenhouse integration, durable public listing cache, private accounts and manual employer-site applications.

1. Add a mandatory confirmed search profile: fresher/experienced, relevant professional years, internship months separately, optional priority skills, target roles, location/country, job types and workplace preference. Do not infer professional years from resume dates. Existing users must review these fields before searching again.
2. Filter before ranking. Exclude explicit senior/staff/principal/lead roles for freshers; explicit mandatory experience above the confirmed level; and incompatible job types and locations. Keep missing employer-required skills visible as review warnings rather than silently treating them as satisfied.
3. Parse requirement context: required, preferred and incidental skill mentions, canonical aliases, alternative skills and experience requirements. Preserve evidence excerpts. Ambiguous requirements must be Needs review, never silently treated as satisfied.
4. Rank only relevant candidates, with no result-count padding. A posting needs at least one confirmed resume skill. Optional priority-skill coverage below 75% is Needs review; coverage at or above 75% can be Recommended when all other checks pass. Separate Recommended from Needs review. Explain matched requirements, uncertainties, and missing skills. Apply the same rules to every supported discovery source.
5. Validate the fresher/staff regression, years/skill mismatch, alternatives and preferred requirements, role confusion, location/job-type filters, profile validation and persistence, migration adoption, and complete browser workflow.
6. Update documentation, restart the local app, and refresh the deployment package after checks pass.

Status: completed and validated locally on 2026-09-10.

Validation: 33 backend/matching/cache/migration tests passed; 2 Chrome browser tests passed, including explicit fresher selection, preference persistence after reload, and Staff-role exclusion. Production frontend build and added-code static checks passed. Migration 0004 applied to the separate local product database and the app restarted on localhost:8080.

Known limits: parsing is rule-based, so ambiguous requirements remain Needs review. Employment and workplace details absent from postings are not invented. Existing saved jobs retain historical match details. Source coverage remains the configured employers; no suitable matches is a valid result.

## Completed earlier

Private signup/login and recovery; resume upload/review; Greenhouse and optional Adzuna discovery; applications, notes/history, dashboard and Excel; PostgreSQL snapshots, provider retries, background refresh and freshness notices.

## Deferred

Owner/admin dashboard and account management; Lever/Ashby integrations; automatic applications and employer-message synchronization; OCR and AI resume tailoring. No paid services or external submissions are enabled by this milestone.


## Relevance correction - 2026-09-20

The previous completed checks missed real false positives. The confirmed Python Developer fresher profile returned support, network-security and solutions roles because Python appeared in their descriptions, and explicit experience requirements were sometimes ignored.

Implemented: require evidence for the requested role and compatible job title; exclude unrelated job families and conflicting title languages; remove identifiable company/benefits boilerplate before skill matching; report only roles actually matched, with evidence visible in discovery. Recognize experience despite incidental "or", parenthesized numbers, spelled-out years and phrases such as "4+ years building". Confirmed career stage, skills, strongest skills, years, locations and job preferences remain the inputs; no filler results are added.

Saved matches now record the matching version and a fingerprint of confirmed inputs. Job details flag legacy matches or changed-profile matches as outdated, preserving saved jobs and application history. Run a new search after reviewing preferences.

Read-only verification using 2,324 cached public listings and the most recently confirmed profile: previous output capped at 50; corrected output 2 Needs review, 0 Recommended. Missing explicit experience information remains uncertain. This profile has no location filter; locations are not invented. These are snapshot results, not a guarantee of eligibility or market coverage.


## Strict fresher eligibility correction - 2026-09-20

A real Cloudflare AI Agents posting contained `Exp: 5 - 10yrs`. The parser missed the abbreviation and the previous Needs review fallback admitted it for a fresher. Experience parsing now recognizes abbreviated years and ranges; a separate fresher gate scans the entire description, including sections removed from role matching. It requires quoted affirmative evidence accepting freshers, recent graduates or zero experience. Missing, conflicting or ambiguous experience is excluded from fresher results in both tabs. Positive preferred experience is also conservatively excluded; this may omit eligible postings rather than guess.

Search cards show the employer's exact fresher-eligibility statement. Matcher version 3 invalidates historical recommendations; saved jobs and application records are retained, and their detail pages mark old matches as outdated. Re-run Find live jobs after refreshing the page. Needs review can still indicate other uncertainties such as employment type or education; it no longer substitutes for fresher experience evidence.

Tests include the actual abbreviated wording, months, decimal years, education alternatives, internship conditions, experience hidden by section stripping, negated fresher statements and a real recent-graduate/upper-bound clause. API and Chrome workflows exercise filtering and saved evidence. No automatic employer submissions are performed.


## Changed-resume search verification - 2026-09-20

Discovery uses the newest uploaded resume after it is confirmed. A new file does not guarantee different jobs: target roles are alternatives, and a posting must match at least one strongest skill. The audited recent profiles retained Python Developer, fresher status and Python, so the same graduate posting remained eligible within the four configured employers. Cached employer listings are shared public source data; ranking is recomputed from each search profile.

Fixed stale display behavior: starting a search clears previous cards, including when the request fails or is throttled. The frontend refreshes the active profile before searching and displays its filename and strongest skills. Requests identify the resume and fingerprint of confirmed inputs; obsolete requests and input changes during provider processing return 409 rather than importing results for the wrong profile. Responses include the exact search profile. Confirming changed search inputs resets the one-minute repeat-search cooldown; confirming unchanged inputs does not.

Regression scenarios include a Python-to-Java second resume with different output, an unconfirmed new resume, stale request identifiers, a location change producing zero results, profile changes during provider processing, and browser failure clearing. Job board retains saved history; Find live jobs displays only the current search results. Project AGENTS.md now records the user's persistent instruction to verify output against actual inputs end to end.


## Required skill combination - 2026-09-20

User-approved change: selected strongest skills are now ALL required, not alternatives. The field is labeled Required skills for job search. Select skills from the reviewed resume; each must occur in the role-specific posting content. Other resume skills remain available for checking employer requirements. Example: Python, LangChain, RAG, LLMs rejects generic Python postings missing any selected AI skill. Aliases such as retrieval-augmented generation and large language models are recognized. Fresher evidence and all existing eligibility filters remain enforced; zero matches is valid.

Matching version 4 invalidates older saved match assessments. Existing saved jobs and application history are preserved. No new AI service or paid dependency is used. Tests cover each missing selected skill, complete combinations with aliases, boilerplate-only mentions, experience conflicts, search API persistence and the browser workflow.


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


## Resume ranking and combined employer search - 2026-09-21

Implemented the next Lever adapter using its documented public Postings API, with Meesho as the default configured employer. Paginated retrieval preserves requirement sections, validates employer URLs, bounds response pages, and uses namespaced durable cache leases. Posting availability is checked before starting an application. Combined free-source search merges all configured Greenhouse/Ashby/Lever snapshots before global ranking and the result limit, deduplicates URLs, and reports partial failures. Optional Adzuna remains separate.

Corrected the product distinction between resume skills and mandatory posting skills. All confirmed resume skills contribute to ranking. The mandatory-skills list can be empty; every explicitly selected mandatory skill still must match. Existing saved profiles are not silently changed. The profile offers an explicit action to clear mandatory filters while retaining resume skills. Career stage, fresher evidence, mandatory employer qualifications, locations and internship-pay checks remain enforced. Matcher version 6 marks older saved assessments as historical. No schema migration required.

Further coverage expansion remains necessary: these employer boards do not cover every startup, LinkedIn, Indeed or Naukri. No result is fabricated to fill an empty search.


## Combined mandatory-skill and location restrictions - 2026-09-21

Reproduced the screenshot using the current confirmed profile: Bangalore, fresher with zero professional years, full-time/internship, any internship pay, and seven mandatory skills. Removing mandatory skills alone still produces zero matches. The previously reported MongoDB recent-graduate role is in Dublin, so it is not a match for Bangalore. The earlier broader-location audit must not be presented as evidence of a suitable result for this updated profile.

Added exact counterfactual counts to each search: results without mandatory skills, and results without both mandatory skills and the city filter. Other eligibility checks remain enforced. Counts do not import or display off-preference jobs and do not mutate preferences. The UI explicitly warns when changing skills alone cannot resolve the empty result and links to profile review. Additional Meraki-Labs and Ema public-board checks did not establish a matching fresher role; neither was added merely to inflate coverage.


## Current priority-skill behavior - 2026-11-15

This supersedes the older mandatory-skill sections above. Selected priority skills guide review classification rather than filtering jobs out. A result must still match at least one confirmed resume skill. Less than 75% priority-skill coverage is shown under Needs review; 75% or more may be Recommended only when the independent role, location, experience, job-type, seniority and internship-pay checks pass. Employer-required skills missing from the confirmed resume appear as warnings under Needs review, never as skills the user possesses. Searches can validly return zero results when those remaining checks exclude every posting.

Validation: 89 affected matching/provider/cache/API tests passed, including wrong-city exclusion, retained experience/pay checks, changed-profile identity and persistence. All eight Chrome workflows passed in 25.7 seconds, including the new two-filter scenario. TypeScript/Vite build and Ruff checks passed. This fixes the incomplete explanation; it does not create vacancies or establish that a job exists for every combination of requirements.


## Broader coverage and explicit uncertainty review - 2026-09-21

Added verified public Meraki Labs and Ema boards through the existing cached Ashby adapter. Updated local source configuration and example defaults; no paid service or API credentials introduced.

Added include_uncertain_experience (default false) to reviewed JSON preferences. Strict fresher behavior remains the default. Opt-in admits unconfirmed fresher eligibility only as Needs review, never Recommended. Cards distinguish this explicitly, show quoted academic/enrollment/portfolio requirements, and retain all mandatory-skill, location, pay and explicit experience conflict checks. No schema migration required. Matcher version 7 invalidates earlier stored assessments.

Live-description review exposed a missed numerical requirement: "1 to 5 years of strong Python fundamentals". Duration parsing now recognizes skill-duration requirements without the word experience, and the employer posting is excluded. Added tests for spelled-out/ranged skill durations, unnumbered mandatory professional experience, strict default versus opt-in, profile changes and browser persistence. No universal accuracy or guaranteed vacancies claimed.
