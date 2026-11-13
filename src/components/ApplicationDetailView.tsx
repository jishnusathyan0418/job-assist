import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  AlertCircle,
  ExternalLink,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Mail,
  MessageCircle,
  X,
} from 'lucide-react';
import type {
  ApplicationStatus,
  ApprovalDecision,
  InterviewPrepPlan,
  JobApplication,
  NotificationSettings,
  ResumeProfile,
} from '../types';
import {
  buildApplicationAlertLinks,
  buildMailtoLink,
  buildWhatsAppLink,
} from '../utils/notifications';

interface ApplicationDetailViewProps {
  applicationId: string;
  settings: NotificationSettings;
  onBack: () => void;
  onApplicationUpdated: () => Promise<void>;
}

const STATUS_OPTIONS: ApplicationStatus[] = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Archived'];

export function ApplicationDetailView({
  applicationId,
  settings,
  onBack,
  onApplicationUpdated,
}: ApplicationDetailViewProps) {
  const [application, setApplication] = useState<JobApplication | null>(null);
  const [prep, setPrep] = useState<InterviewPrepPlan | null>(null);
  const [resume, setResume] = useState<ResumeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPrep, setGeneratingPrep] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  const [followUpDraft, setFollowUpDraft] = useState<{ subject: string; body: string } | null>(null);
  const [draftingFollowUp, setDraftingFollowUp] = useState(false);

  const [notesDraft, setNotesDraft] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [questionFilter, setQuestionFilter] = useState<'All' | 'Technical' | 'System Design' | 'Behavioral'>('All');
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);
  const [showJd, setShowJd] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      setLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch(`/api/applications/${applicationId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Unable to load application.');
        if (cancelled) return;
        setApplication(data.application);
        setPrep(data.prep);
        setResume(data.resume);
        setNotesDraft(data.application.notes || '');
        setNextFollowUpDate(data.application.nextFollowUp || '');
        if (data.prep?.questions?.[0]) {
          setExpandedQuestionId(data.prep.questions[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err instanceof Error ? err.message : 'Failed to load detail.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const patchApplication = async (patch: Partial<JobApplication>) => {
    if (!application) return;
    setErrorMessage(null);
    const res = await fetch(`/api/applications/${application.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMessage(data.error || 'Update failed.');
      return;
    }
    setApplication(data.application);
    await onApplicationUpdated();
  };

  const handleApprovalDecision = async (skill: string, decision: ApprovalDecision) => {
    if (!application) return;
    const res = await fetch(`/api/applications/${application.id}/approvals`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill, decision }),
    });
    const data = await res.json();
    if (res.ok && data.application) {
      setApplication(data.application);
      await onApplicationUpdated();
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await patchApplication({
        notes: notesDraft,
        nextFollowUp: nextFollowUpDate || null,
      });
    } finally {
      setSavingNotes(false);
    }
  };

  const handleGeneratePrep = async () => {
    if (!application) return;
    setErrorMessage(null);
    setGeneratingPrep(true);
    try {
      const res = await fetch(`/api/applications/${application.id}/prep`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate interview prep.');
      setPrep(data.prep);
      if (data.prep?.questions?.[0]) {
        setExpandedQuestionId(data.prep.questions[0].id);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate prep plan.');
    } finally {
      setGeneratingPrep(false);
    }
  };

  const handleDraftFollowUp = async () => {
    if (!application) return;
    setErrorMessage(null);
    setDraftingFollowUp(true);
    try {
      const res = await fetch(`/api/applications/${application.id}/followup-draft`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to draft follow-up.');
      setFollowUpDraft(data.draft);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to draft follow-up.');
    } finally {
      setDraftingFollowUp(false);
    }
  };

  const togglePracticed = async (questionId: string, practiced: boolean) => {
    if (!application || !prep) return;
    const res = await fetch(`/api/applications/${application.id}/prep/question`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId, practiced }),
    });
    const data = await res.json();
    if (res.ok && data.prep) {
      setPrep(data.prep);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8 h-96 rounded-xl bg-white border border-slate-200" />
          <div className="lg:col-span-4 h-96 rounded-xl bg-white border border-slate-200" />
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-slate-900">{errorMessage || 'Application not found.'}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const resumeTitle = resume?.title || 'Unlinked Resume';
  const alertLinks = buildApplicationAlertLinks(application, resumeTitle, settings);
  const filteredQuestions =
    prep?.questions.filter((q) => questionFilter === 'All' || q.category === questionFilter) || [];
  const practicedCount = prep?.questions.filter((q) => q.practiced).length || 0;

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Applications</span>
          </button>

          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            {application.company} — {application.roleTitle}
          </h1>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{application.location}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-700 tabular-nums">{application.compensation}</span>
            {application.appliedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">Applied {application.appliedAt}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-medium text-slate-800">Resume Used: {resumeTitle}</span>
            {application.jobUrl && (
              <>
                <span aria-hidden="true">·</span>
                <a
                  href={application.jobUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                >
                  <span>Posting</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <select
            aria-label="Application Stage"
            value={application.status}
            onChange={(e) => patchApplication({ status: e.target.value as ApplicationStatus })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                Stage: {s}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={generatingPrep}
            onClick={handleGeneratePrep}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            <Sparkles className="h-4 w-4" />
            <span>
              {generatingPrep
                ? 'Generating Prep...'
                : prep
                  ? 'Regenerate Prep Plan'
                  : 'Generate Prep Plan'}
            </span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          {errorMessage}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Main Column */}
        <div className="lg:col-span-8 space-y-6">
          {/* Human Skill Approval Gate Card */}
          {(application.skillApprovals || []).length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Skill Gap Verification (Human-in-the-Loop)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Missing skills are excluded from tailored outputs unless explicitly confirmed by you.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={alertLinks.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>WhatsApp Alert</span>
                  </a>
                  <a
                    href={alertLinks.emailUrl}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>Email Alert</span>
                  </a>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {application.skillApprovals.map((item) => (
                  <div
                    key={item.skill}
                    className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {item.skill}
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          ·{' '}
                          {item.decision === 'approved'
                            ? 'Approved'
                            : item.decision === 'declined'
                              ? 'Excluded'
                              : 'Pending'}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">{item.reason}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleApprovalDecision(item.skill, 'approved')}
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                          item.decision === 'approved'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Approve</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprovalDecision(item.skill, 'declined')}
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                          item.decision === 'declined'
                            ? 'border-rose-300 bg-rose-50 text-rose-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Do Not Add</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Interview Prep Studio */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Interview Prep Studio
                </h2>
                <p className="text-xs text-slate-500">
                  Targeted technical, architecture, and STAR behavioral drills grounded in your verified resume.
                </p>
              </div>
              {prep && (
                <span className="font-mono text-xs text-slate-600 tabular-nums">
                  {practicedCount} / {prep.questions.length} practiced
                </span>
              )}
            </div>

            {!prep && !generatingPrep ? (
              <div className="py-12 text-center">
                <p className="text-sm font-medium text-slate-900">
                  No interview prep plan generated for {application.company} yet
                </p>
                <p className="mt-1 mx-auto max-w-md text-xs text-slate-500">
                  Generate tailored technical questions, STAR response outlines, and interviewer questions.
                </p>
                <button
                  type="button"
                  onClick={handleGeneratePrep}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Generate Prep Plan</span>
                </button>
              </div>
            ) : generatingPrep ? (
              <div className="space-y-4 py-6">
                <div className="h-16 rounded bg-slate-100" />
                <div className="h-24 rounded bg-slate-100" />
                <div className="h-24 rounded bg-slate-100" />
              </div>
            ) : (
              prep && (
                <div className="mt-5 space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Role & Company Context
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-700">{prep.companyResearch}</p>
                  </div>

                  <div className="border-t border-slate-100 pt-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                      Core Review Topics
                    </h3>
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm text-slate-800">
                      {prep.technicalTopics.map((topic, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="font-mono text-xs text-slate-400 mt-0.5 tabular-nums">
                            0{idx + 1}.
                          </span>
                          <span>{topic}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="border-t border-slate-100 pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Practice Questions
                      </h3>
                      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                        {(['All', 'Technical', 'System Design', 'Behavioral'] as const).map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setQuestionFilter(cat)}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                              questionFilter === cat
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="divide-y divide-slate-200 border-t border-b border-slate-200">
                      {filteredQuestions.map((q) => {
                        const expanded = expandedQuestionId === q.id;
                        return (
                          <div key={q.id} className="py-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                                  <span className="font-medium text-slate-700">{q.category}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{q.practiced ? 'Practiced' : 'Unpracticed'}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setExpandedQuestionId(expanded ? null : q.id)}
                                  className="text-left text-sm font-medium text-slate-900 hover:text-blue-700"
                                >
                                  {q.question}
                                </button>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => togglePracticed(q.id, !q.practiced)}
                                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                                    q.practiced
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  {q.practiced ? 'Practiced' : 'Mark Practiced'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setExpandedQuestionId(expanded ? null : q.id)}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  aria-label={expanded ? 'Collapse answer outline' : 'Expand answer outline'}
                                >
                                  {expanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {expanded && (
                              <div className="mt-3 space-y-2.5 text-sm text-slate-700">
                                <p className="text-xs text-slate-500">
                                  <strong className="font-medium text-slate-700">Signal tested:</strong>{' '}
                                  {q.whyAsked}
                                </p>
                                <div className="rounded-lg bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-800">
                                  <p className="text-xs font-medium text-slate-500 mb-1">
                                    STAR / Architecture Outline
                                  </p>
                                  <p>{q.starOutline}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-1">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                      Questions to Ask the Panel
                    </h3>
                    <ul className="space-y-2 text-sm text-slate-700">
                      {prep.questionsToAsk.map((q, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="font-mono text-xs text-slate-400 mt-0.5 tabular-nums">
                            {idx + 1}.
                          </span>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            )}
          </section>

          {/* Follow-up Drafter */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Follow-up Message Drafter
                </h2>
                <p className="text-xs text-slate-500">
                  Generate a concise check-in note grounded in your verified highlights and send via Email or WhatsApp.
                </p>
              </div>
              <button
                type="button"
                disabled={draftingFollowUp}
                onClick={handleDraftFollowUp}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                <span>{draftingFollowUp ? 'Drafting...' : 'Draft Follow-up'}</span>
              </button>
            </div>

            {followUpDraft && (
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">Subject</p>
                  <p className="text-sm font-medium text-slate-900">{followUpDraft.subject}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-1">Body</p>
                  <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3.5 font-sans text-sm leading-relaxed text-slate-800">
                    {followUpDraft.body}
                  </pre>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={buildMailtoLink('', followUpDraft.subject, followUpDraft.body)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>Open in Email App (Free)</span>
                  </a>
                  <a
                    href={buildWhatsAppLink('', `${followUpDraft.subject}\n\n${followUpDraft.body}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>Send via WhatsApp (Free)</span>
                  </a>
                </div>
              </div>
            )}
          </section>

          {/* Job Description Accordion */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <button
              type="button"
              onClick={() => setShowJd((prev) => !prev)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Saved Job Description
                </h2>
                <p className="text-xs text-slate-500">
                  Original role specification used for ATS scoring
                </p>
              </div>
              {showJd ? (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {showJd && (
              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700 border-t border-slate-100 pt-4">
                {application.jobDescription}
              </pre>
            )}
          </section>
        </div>

        {/* Right Sidebar: ATS Alignment & Notes */}
        <aside className="lg:col-span-4 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-sm font-semibold text-slate-900">ATS Match Score</h2>
              <span
                className={`font-mono text-2xl font-semibold tabular-nums ${
                  application.matchScore >= 80
                    ? 'text-emerald-700'
                    : application.matchScore >= 60
                      ? 'text-amber-700'
                      : 'text-rose-700'
                }`}
              >
                {application.matchScore}%
              </span>
            </div>

            {application.atsBreakdown && (
              <div className="grid grid-cols-3 gap-2 border-t border-b border-slate-100 py-3 text-xs">
                <div>
                  <span className="text-slate-500">Keywords</span>
                  <p className="font-mono font-semibold text-slate-900 tabular-nums">
                    {application.atsBreakdown.keywordMatch}%
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Experience</span>
                  <p className="font-mono font-semibold text-slate-900 tabular-nums">
                    {application.atsBreakdown.experienceAlignment}%
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Role Fit</span>
                  <p className="font-mono font-semibold text-slate-900 tabular-nums">
                    {application.atsBreakdown.roleRelevance}%
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs leading-relaxed text-slate-600">{application.matchSummary}</p>

            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div>
                <h3 className="text-xs font-medium text-slate-500 mb-1.5">Matched Skills</h3>
                <ul className="space-y-1 text-xs text-slate-800">
                  {application.matchedSkills.map((s) => (
                    <li key={s} className="flex items-center gap-1.5">
                      <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {application.missingSkills.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-slate-500 mb-1.5">Gaps Flagged</h3>
                  <ul className="space-y-1 text-xs text-slate-800">
                    {application.missingSkills.map((g) => (
                      <li key={g} className="flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {application.tailoredBullets.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-xs font-medium text-slate-500 mb-2">Verified Talking Points</h3>
                <ul className="space-y-2 text-xs leading-relaxed text-slate-700">
                  {application.tailoredBullets.map((b, i) => (
                    <li key={i}>• {b}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Follow-up & Interview Notes
            </h2>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">
                Next Follow-up Date
              </label>
              <input
                type="date"
                value={nextFollowUpDate}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
              <textarea
                rows={5}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Recruiter contacts, panel names, compensation details..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs leading-relaxed text-slate-800 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <button
              type="button"
              disabled={savingNotes}
              onClick={handleSaveNotes}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-50"
            >
              {savingNotes ? 'Saving...' : 'Save Notes & Follow-up'}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
