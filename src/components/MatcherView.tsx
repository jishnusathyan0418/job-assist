import { useState } from 'react';
import { Sparkles, Check, AlertCircle, Copy, X, Mail, MessageCircle } from 'lucide-react';
import type {
  ApplicationStatus,
  ApprovalDecision,
  MatchAnalysisResult,
  NotificationSettings,
  ResumeProfile,
} from '../types';
import {
  buildMailtoLink,
  buildMissingSkillAlertText,
  buildWhatsAppLink,
} from '../utils/notifications';

interface MatcherViewProps {
  resumes: ResumeProfile[];
  settings: NotificationSettings;
  onSaved: (applicationId: string) => Promise<void>;
}

const SAMPLE_JD = {
  company: 'Helios Compute',
  roleTitle: 'Senior Full-Stack AI Engineer',
  location: 'San Francisco / Hybrid',
  compensation: '$215k – $250k + equity',
  jobUrl: 'https://jobs.example.com/helios/senior-ai-fullstack',
  jobDescription: `We are seeking a Senior Full-Stack AI Engineer to own our customer-facing agent orchestration studio and high-throughput execution APIs.

Responsibilities:
- Design responsive React 19 + TypeScript dashboards for live workflow traces and evaluation benchmarks.
- Build resilient Node.js / Express or Next.js backend services backed by PostgreSQL and Redis.
- Implement deterministic structured-output LLM pipelines (JSON Schema validation, retry policies, and automated eval suites).
- Partner closely with infrastructure engineers on container deployments (Docker, AWS) and observability telemetry.

Requirements:
- 5+ years of production TypeScript, React, and Node.js experience.
- Deep experience with relational database modeling and query optimization in PostgreSQL.
- Hands-on track record building production LLM evaluation harnesses or agentic workflows.
- Production experience with Terraform and Kafka event streaming.`,
};

export function MatcherView({ resumes, settings, onSaved }: MatcherViewProps) {
  const [resumeId, setResumeId] = useState(resumes[0]?.id || '');
  const [company, setCompany] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [location, setLocation] = useState('Remote');
  const [compensation, setCompensation] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState('');

  const [analysis, setAnalysis] = useState<MatchAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | 'note' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedResume = resumes.find((r) => r.id === resumeId);

  const loadSample = () => {
    setCompany(SAMPLE_JD.company);
    setRoleTitle(SAMPLE_JD.roleTitle);
    setLocation(SAMPLE_JD.location);
    setCompensation(SAMPLE_JD.compensation);
    setJobUrl(SAMPLE_JD.jobUrl);
    setJobDescription(SAMPLE_JD.jobDescription);
    setErrorMessage(null);
  };

  const handleAnalyze = async () => {
    setErrorMessage(null);
    if (!resumeId) {
      setErrorMessage('Create or select a baseline resume profile first.');
      return;
    }
    if (!company.trim() || !roleTitle.trim() || !jobDescription.trim()) {
      setErrorMessage('Company, role title, and job description are required to run matching.');
      return;
    }

    setAnalyzing(true);
    try {
      const res = await fetch('/api/applications/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeId, company, roleTitle, jobDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Match analysis failed.');
      setAnalysis(data.analysis);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to complete match analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

  const setApprovalDecision = (skill: string, decision: ApprovalDecision) => {
    if (!analysis) return;
    setAnalysis({
      ...analysis,
      skillApprovals: analysis.skillApprovals.map((item) =>
        item.skill === skill
          ? { ...item, decision, decidedAt: new Date().toISOString() }
          : item,
      ),
    });
  };

  const handleSave = async (status: ApplicationStatus) => {
    setErrorMessage(null);
    if (!company.trim() || !roleTitle.trim() || !jobDescription.trim()) {
      setErrorMessage('Company, role title, and job description are required.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          roleTitle,
          location,
          compensation: compensation || 'Undisclosed',
          jobUrl,
          jobDescription,
          resumeId,
          status,
          nextFollowUp: nextFollowUp || null,
          matchScore: analysis?.matchScore ?? 0,
          atsBreakdown: analysis?.atsBreakdown,
          fitLabel: analysis?.fitLabel ?? 'Moderate Fit',
          matchSummary: analysis?.matchSummary ?? '',
          matchedSkills: analysis?.matchedSkills ?? [],
          missingSkills: analysis?.missingSkills ?? [],
          skillApprovals: analysis?.skillApprovals ?? [],
          tailoredBullets: analysis?.tailoredBullets ?? [],
          coverNote: analysis?.coverNote ?? '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save application.');
      await onSaved(data.application.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const copyText = async (text: string, key: number | 'note') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(key);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch {
      // Clipboard API unavailable
    }
  };

  const alertMessage = analysis
    ? buildMissingSkillAlertText({
        company: company || 'Target Company',
        roleTitle: roleTitle || 'Target Role',
        atsScore: analysis.matchScore,
        resumeTitle: selectedResume?.title || 'Selected Resume',
        missingSkills: analysis.missingSkills,
      })
    : '';
  const whatsappHref = buildWhatsAppLink(settings.whatsappNumber, alertMessage);
  const emailHref = buildMailtoLink(
    settings.email,
    `[JobPulse] Missing skill review: ${company} — ${roleTitle} (${analysis?.matchScore ?? 0}% ATS)`,
    alertMessage,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            New Application & AI Matcher
          </h1>
          <p className="text-sm text-slate-500">
            Compute ATS score, verify missing skills with human-in-the-loop approval, and never fabricate unverified experience.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSample}
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          Load Sample Job Description
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Input Form */}
        <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 space-y-4 self-start">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Resume Used for Application
            </label>
            <select
              value={resumeId}
              onChange={(e) => setResumeId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.extractedSkills.length} skills)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Company</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g., Helios Compute"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Role Title</label>
              <input
                type="text"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g., Senior Full-Stack AI Engineer"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Remote / Hybrid"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Compensation</label>
              <input
                type="text"
                value={compensation}
                onChange={(e) => setCompensation(e.target.value)}
                placeholder="e.g., $210k – $245k"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Job Posting URL</label>
              <input
                type="url"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Follow-up Date</label>
              <input
                type="date"
                value={nextFollowUp}
                onChange={(e) => setNextFollowUp(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Job Description
            </label>
            <textarea
              rows={9}
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the full role description, responsibilities, and requirements..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-relaxed text-slate-800 focus:border-blue-600 focus:outline-none"
            />
          </div>

          {errorMessage && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {errorMessage}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={analyzing}
              onClick={handleAnalyze}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" />
              <span>{analyzing ? 'Analyzing ATS Fit...' : 'Run ATS Match'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('Saved')}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                Save Draft
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('Applied')}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {saving ? 'Saving...' : 'Mark Applied'}
              </button>
            </div>
          </div>
        </section>

        {/* Right Analysis Output */}
        <section className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6">
          {!analysis && !analyzing ? (
            <div className="flex h-full min-h-[380px] flex-col items-center justify-center text-center px-4">
              <h2 className="font-display text-base font-semibold text-slate-900">
                ATS & Truthfulness Guardrail Ready
              </h2>
              <p className="mt-1.5 max-w-sm text-sm text-slate-500">
                Run ATS Match to compute your score, inspect keyword alignment, and verify any missing skills before adding them to your application.
              </p>
            </div>
          ) : analyzing ? (
            <div className="space-y-5">
              <div className="h-14 w-48 rounded bg-slate-100" />
              <div className="h-4 w-full rounded bg-slate-100" />
              <div className="h-4 w-5/6 rounded bg-slate-100" />
              <div className="grid grid-cols-2 gap-4 pt-4">
                <div className="h-28 rounded bg-slate-100" />
                <div className="h-28 rounded bg-slate-100" />
              </div>
              <div className="h-32 rounded bg-slate-100" />
            </div>
          ) : (
            analysis && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-5">
                  <p className="text-xs font-medium text-slate-500">
                    ATS Match Score · {selectedResume?.title}
                  </p>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span
                      className={`font-mono text-4xl font-semibold tabular-nums ${
                        analysis.matchScore >= 80
                          ? 'text-emerald-700'
                          : analysis.matchScore >= 60
                            ? 'text-amber-700'
                            : 'text-rose-700'
                      }`}
                    >
                      {analysis.matchScore}%
                    </span>
                    <span className="text-sm font-medium text-slate-700">
                      {analysis.fitLabel}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-4 border-t border-slate-100 pt-3 text-xs">
                    <div>
                      <span className="text-slate-500">Keywords</span>
                      <p className="font-mono font-semibold text-slate-900 tabular-nums">
                        {analysis.atsBreakdown.keywordMatch}%
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Experience</span>
                      <p className="font-mono font-semibold text-slate-900 tabular-nums">
                        {analysis.atsBreakdown.experienceAlignment}%
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Role Fit</span>
                      <p className="font-mono font-semibold text-slate-900 tabular-nums">
                        {analysis.atsBreakdown.roleRelevance}%
                      </p>
                    </div>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-slate-700">{analysis.matchSummary}</p>

                {/* Human-in-the-Loop Skill Approval Gate */}
                {analysis.skillApprovals.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-amber-900">
                          Human Approval Required ({analysis.skillApprovals.length} Missing Skills)
                        </h3>
                        <p className="text-xs text-amber-800">
                          Excluded from AI bullets by default. Confirm only skills you truly possess or send a free alert.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={whatsappHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          <span>WhatsApp</span>
                        </a>
                        <a
                          href={emailHref}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          <span>Email</span>
                        </a>
                      </div>
                    </div>

                    <div className="divide-y divide-amber-200/70">
                      {analysis.skillApprovals.map((item) => (
                        <div
                          key={item.skill}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-0"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-900">{item.skill}</p>
                            <p className="text-xs text-slate-600">{item.reason}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setApprovalDecision(item.skill, 'approved')}
                              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium border ${
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
                              onClick={() => setApprovalDecision(item.skill, 'declined')}
                              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium border ${
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

                <div className="grid grid-cols-1 gap-6 border-t border-slate-100 pt-5 sm:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                      Matched Evidence
                    </h3>
                    <ul className="space-y-2 text-sm text-slate-800">
                      {analysis.matchedSkills.map((skill) => (
                        <li key={skill} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <span>{skill}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                      Missing / Unverified
                    </h3>
                    {analysis.missingSkills.length === 0 ? (
                      <p className="text-sm text-slate-500">No gaps detected.</p>
                    ) : (
                      <ul className="space-y-2 text-sm text-slate-800">
                        {analysis.missingSkills.map((gap) => (
                          <li key={gap} className="flex items-start gap-2">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <span>{gap}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                    Verified Tailored Bullets (Zero Fabrication)
                  </h3>
                  <div className="divide-y divide-slate-100">
                    {analysis.tailoredBullets.map((bullet, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <p className="text-sm leading-relaxed text-slate-800">{bullet}</p>
                        <button
                          type="button"
                          onClick={() => copyText(bullet, idx)}
                          className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Copy bullet"
                        >
                          {copiedIndex === idx ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Tailored Outreach Note
                    </h3>
                    <button
                      type="button"
                      onClick={() => copyText(analysis.coverNote, 'note')}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      {copiedIndex === 'note' ? 'Copied' : 'Copy Note'}
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">{analysis.coverNote}</p>
                </div>
              </div>
            )
          )}
        </section>
      </div>
    </div>
  );
}
