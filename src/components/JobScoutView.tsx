import { useEffect, useState } from 'react';
import {
  Globe,
  Check,
  AlertCircle,
  ExternalLink,
  Mail,
  MessageCircle,
  Copy,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  ApplicationStatus,
  ApprovalDecision,
  DiscoveredJobCandidate,
  DiscoverySearchResponse,
  NotificationSettings,
  ResumeProfile,
} from '../types';
import {
  buildMailtoLink,
  buildMissingSkillAlertText,
  buildWhatsAppLink,
} from '../utils/notifications';

interface JobScoutViewProps {
  resumes: ResumeProfile[];
  settings: NotificationSettings;
  onRefresh: () => Promise<void>;
  onOpenDashboard: () => void;
}

export function JobScoutView({
  resumes,
  settings,
  onRefresh,
  onOpenDashboard,
}: JobScoutViewProps) {
  const [resumeId, setResumeId] = useState(resumes[0]?.id || '');
  const [targetRole, setTargetRole] = useState(resumes[0]?.targetRole || 'Full-Stack Engineer');
  const [location, setLocation] = useState('Remote');
  const [skillsInput, setSkillsInput] = useState(
    resumes[0]?.extractedSkills.slice(0, 8).map((s) => s.name).join(', ') || '',
  );
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [minAtsFilter, setMinAtsFilter] = useState<number>(0);

  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<DiscoverySearchResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedKitId, setExpandedKitId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const res = resumes.find((r) => r.id === resumeId);
    if (res) {
      setTargetRole(res.targetRole);
      setSkillsInput(res.extractedSkills.slice(0, 8).map((s) => s.name).join(', '));
    }
  }, [resumeId, resumes]);

  const selectedResume = resumes.find((r) => r.id === resumeId);

  const handleDiscover = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setNotice(null);
    setSearching(true);
    setSelectedIds(new Set());

    try {
      const skills = skillsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/jobs/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeId,
          targetRole: targetRole.trim(),
          location: location.trim(),
          skills,
          useWebSearch,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Discovery search failed.');
      setResults(data);
      if (data.jobs?.[0]) setExpandedKitId(data.jobs[0].id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to fetch live jobs.');
    } finally {
      setSearching(false);
    }
  };

  const setJobApproval = (jobId: string, skill: string, decision: ApprovalDecision) => {
    if (!results) return;
    setResults({
      ...results,
      jobs: results.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              skillApprovals: job.skillApprovals.map((a) =>
                a.skill === skill
                  ? { ...a, decision, decidedAt: new Date().toISOString() }
                  : a,
              ),
            }
          : job,
      ),
    });
  };

  const saveSingleJob = async (job: DiscoveredJobCandidate, status: ApplicationStatus) => {
    setSavingId(job.id);
    setErrorMessage(null);
    setNotice(null);
    try {
      const res = await fetch('/api/jobs/batch-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobs: [job],
          resumeId,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save job.');

      if (results) {
        setResults({
          ...results,
          jobs: results.jobs.map((j) =>
            j.id === job.id ? { ...j, alreadyInPipeline: true } : j,
          ),
        });
      }
      await onRefresh();
      setNotice(
        status === 'Applied'
          ? `Marked ${job.company} — ${job.roleTitle} as Applied with ${selectedResume?.title || 'selected resume'}.`
          : `Saved ${job.company} — ${job.roleTitle} to pipeline.`,
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingId(null);
    }
  };

  const handleBatchQueue = async (status: ApplicationStatus) => {
    if (!results || selectedIds.size === 0) return;
    setBatchSaving(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const picked = results.jobs.filter((j) => selectedIds.has(j.id) && !j.alreadyInPipeline);
      if (picked.length === 0) return;
      const res = await fetch('/api/jobs/batch-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs: picked, resumeId, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch queue failed.');

      setResults({
        ...results,
        jobs: results.jobs.map((j) =>
          selectedIds.has(j.id) ? { ...j, alreadyInPipeline: true } : j,
        ),
      });
      setSelectedIds(new Set());
      await onRefresh();
      setNotice(`Added ${data.createdCount} roles to your application pipeline.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Batch save failed.');
    } finally {
      setBatchSaving(false);
    }
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const visibleJobs =
    results?.jobs.filter((j) => j.matchScore >= minAtsFilter) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Live Job Discovery & Guided Apply
          </h1>
          <p className="text-sm text-slate-500">
            Fetch open roles legally from official public job feeds and grounded web search, score ATS fit against your resume, and apply with zero skill fabrication.
          </p>
        </div>

        {notice && (
          <button
            type="button"
            onClick={onOpenDashboard}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap shrink-0"
          >
            View in Applications →
          </button>
        )}
      </div>

      {/* Search Criteria Surface */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <form onSubmit={handleDiscover} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Baseline Resume
              </label>
              <select
                value={resumeId}
                onChange={(e) => setResumeId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Target Job Position
              </label>
              <input
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g., Full-Stack Engineer"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Preferred Location / Mode
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Remote, US, Europe..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Minimum ATS Display Filter
              </label>
              <select
                value={minAtsFilter}
                onChange={(e) => setMinAtsFilter(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value={0}>All Scores (0%+)</option>
                <option value={60}>Moderate+ (60%+)</option>
                <option value={75}>Strong Threshold (75%+)</option>
                <option value={80}>Top Matches (80%+)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-12 items-end">
            <div className="md:col-span-7">
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Focus Skills (comma-separated, pre-filled from resume)
              </label>
              <input
                type="text"
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="md:col-span-5 flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useWebSearch}
                  onChange={(e) => setUseWebSearch(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>Include Google Search Grounding</span>
              </label>

              <button
                type="submit"
                disabled={searching}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Globe className="h-4 w-4" />
                <span>{searching ? 'Fetching & Scoring...' : 'Discover Live Jobs'}</span>
              </button>
            </div>
          </div>
        </form>

        <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Legal Discovery Policy: Fetches exclusively from public open job feeds (Remotive, Himalayas, Arbeitnow) and Gemini Google Search Grounding—never bypasses logins, CAPTCHAs, or restricted sites.
        </p>
      </section>

      {errorMessage && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {errorMessage}
        </p>
      )}

      {notice && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <Check className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </p>
      )}

      {searching && (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 rounded-xl border border-slate-200 bg-white p-6 space-y-3">
              <div className="h-5 w-64 rounded bg-slate-100" />
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="h-4 w-2/3 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      )}

      {results && !searching && (
        <div className="space-y-4">
          {/* Source Telemetry & Batch Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-slate-600">
              <span className="font-medium text-slate-900">Sources Queried:</span>
              {results.sourcesChecked.map((src, idx) => (
                <span key={src.source} className="font-mono tabular-nums">
                  {idx > 0 && <span className="mr-2 text-slate-300">·</span>}
                  {src.source}: {src.status === 'ok' ? `${src.fetchedCount} fetched` : 'unavailable'}
                </span>
              ))}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-slate-600 tabular-nums">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  disabled={batchSaving}
                  onClick={() => handleBatchQueue('Saved')}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
                >
                  Save Selected Drafts
                </button>
              </div>
            )}
          </div>

          {visibleJobs.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <p className="text-sm font-medium text-slate-900">
                No discovered roles meet the current {minAtsFilter}% ATS filter
              </p>
              <button
                type="button"
                onClick={() => setMinAtsFilter(0)}
                className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                Show all scored jobs
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleJobs.map((job) => {
                const pendingApprovals = job.skillApprovals.filter((a) => a.decision === 'pending');
                const expanded = expandedKitId === job.id;
                const alertText = buildMissingSkillAlertText({
                  company: job.company,
                  roleTitle: job.roleTitle,
                  atsScore: job.matchScore,
                  resumeTitle: selectedResume?.title || 'Selected Resume',
                  missingSkills: pendingApprovals.map((p) => p.skill),
                });

                return (
                  <article
                    key={job.id}
                    className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        {!job.alreadyInPipeline && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${job.company} ${job.roleTitle}`}
                            checked={selectedIds.has(job.id)}
                            onChange={(e) => {
                              const next = new Set(selectedIds);
                              if (e.target.checked) next.add(job.id);
                              else next.delete(job.id);
                              setSelectedIds(next);
                            }}
                            className="mt-1 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                          />
                        )}

                        <div className="min-w-0">
                          <h2 className="font-display text-base font-semibold text-slate-900">
                            {job.company} — {job.roleTitle}
                          </h2>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>{job.source}</span>
                            <span aria-hidden="true">·</span>
                            <span>{job.location}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-slate-700 tabular-nums">
                              {job.compensation}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{job.publishedAt}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div
                            className={`font-mono text-xl font-semibold tabular-nums ${
                              job.matchScore >= 80
                                ? 'text-emerald-700'
                                : job.matchScore >= 60
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                            }`}
                          >
                            {job.matchScore}% ATS
                          </div>
                          <div className="text-xs text-slate-500">{job.fitLabel}</div>
                        </div>
                      </div>
                    </div>

                    <p className="text-sm text-slate-700 leading-relaxed">{job.matchSummary}</p>

                    <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 md:grid-cols-2 text-xs">
                      <div>
                        <span className="font-medium text-slate-500">Matched Skills: </span>
                        <span className="text-slate-800">
                          {job.matchedSkills.length > 0 ? job.matchedSkills.join(' · ') : 'None listed'}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-slate-500">Missing / Unverified: </span>
                        <span className={job.missingSkills.length > 0 ? 'text-amber-800 font-medium' : 'text-slate-600'}>
                          {job.missingSkills.length > 0 ? job.missingSkills.join(' · ') : 'None'}
                        </span>
                      </div>
                    </div>

                    {/* Human Verification Guardrail */}
                    {job.skillApprovals.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>
                              Human Approval Required Before Referencing Missing Skills
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <a
                              href={buildWhatsAppLink(settings.whatsappNumber, alertText)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                            >
                              <MessageCircle className="h-3 w-3" />
                              <span>WhatsApp Alert</span>
                            </a>
                            <a
                              href={buildMailtoLink(
                                settings.email,
                                `[JobPulse] Missing skill review: ${job.company} — ${job.roleTitle}`,
                                alertText,
                              )}
                              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Mail className="h-3 w-3" />
                              <span>Email Alert</span>
                            </a>
                          </div>
                        </div>

                        <div className="divide-y divide-amber-200/60">
                          {job.skillApprovals.map((item) => (
                            <div
                              key={item.skill}
                              className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-1 last:pb-0 text-xs"
                            >
                              <span className="font-medium text-slate-900">
                                {item.skill}{' '}
                                <span className="font-normal text-slate-600">
                                  ({item.decision === 'pending' ? 'held out' : item.decision})
                                </span>
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setJobApproval(job.id, item.skill, 'approved')}
                                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium ${
                                    item.decision === 'approved'
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                      : 'border-slate-200 bg-white text-slate-700'
                                  }`}
                                >
                                  <Check className="h-3 w-3" />
                                  <span>Approve</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setJobApproval(job.id, item.skill, 'declined')}
                                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium ${
                                    item.decision === 'declined'
                                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                                      : 'border-slate-200 bg-white text-slate-700'
                                  }`}
                                >
                                  <X className="h-3 w-3" />
                                  <span>Exclude</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Expandable Application Kit */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedKitId(expanded ? null : job.id)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                      >
                        {expanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        <span>Verified Application Kit (Bullets & Cover Note)</span>
                      </button>

                      {expanded && (
                        <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-4 text-xs">
                          <div>
                            <p className="font-semibold text-slate-700 mb-1.5">
                              Tailored Bullets (Grounded in {selectedResume?.title})
                            </p>
                            <ul className="space-y-1.5 text-slate-700">
                              {job.tailoredBullets.map((b, i) => (
                                <li key={i} className="flex items-start justify-between gap-2">
                                  <span>• {b}</span>
                                  <button
                                    type="button"
                                    onClick={() => copyText(b, `${job.id}_b_${i}`)}
                                    className="text-slate-400 hover:text-slate-700 shrink-0"
                                  >
                                    {copiedKey === `${job.id}_b_${i}` ? (
                                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                          {job.coverNote && (
                            <div className="border-t border-slate-200 pt-2.5">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-slate-700">Cover Note</span>
                                <button
                                  type="button"
                                  onClick={() => copyText(job.coverNote, `${job.id}_note`)}
                                  className="text-blue-600 hover:text-blue-700 font-medium"
                                >
                                  {copiedKey === `${job.id}_note` ? 'Copied' : 'Copy Note'}
                                </button>
                              </div>
                              <p className="text-slate-700 leading-relaxed">{job.coverNote}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <a
                        href={job.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        <span>Open Official Apply Page</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>

                      <div className="flex items-center gap-2 shrink-0">
                        {job.alreadyInPipeline ? (
                          <span className="font-mono text-xs font-medium text-emerald-700">
                            Saved in Pipeline
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={savingId === job.id}
                              onClick={() => saveSingleJob(job, 'Saved')}
                              className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              Queue Draft
                            </button>
                            <button
                              type="button"
                              disabled={savingId === job.id}
                              onClick={() => saveSingleJob(job, 'Applied')}
                              className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {savingId === job.id ? 'Saving...' : 'Log as Applied'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Grounded Web Search Sources Citation Footer */}
          {results.groundingUrls.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
                Grounded Web Sources
              </h3>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-xs">
                {results.groundingUrls.slice(0, 8).map((u, idx) => (
                  <li key={idx} className="truncate">
                    <a
                      href={u.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {u.title || u.uri}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
