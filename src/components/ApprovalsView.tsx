import { useMemo, useState } from 'react';
import { Check, X, Mail, MessageCircle, ArrowUpRight, ShieldAlert } from 'lucide-react';
import type {
  ApprovalDecision,
  JobApplication,
  NotificationSettings,
  ResumeProfile,
} from '../types';
import { buildApplicationAlertLinks } from '../utils/notifications';

interface ApprovalsViewProps {
  applications: JobApplication[];
  resumes: ResumeProfile[];
  settings: NotificationSettings;
  onDecision: (applicationId: string, skill: string, decision: ApprovalDecision) => Promise<void>;
  onSaveSettings: (patch: Partial<NotificationSettings>) => Promise<void>;
  onSelectApplication: (id: string) => void;
}

export function ApprovalsView({
  applications,
  resumes,
  settings,
  onDecision,
  onSaveSettings,
  onSelectApplication,
}: ApprovalsViewProps) {
  const [email, setEmail] = useState(settings.email);
  const [whatsappNumber, setWhatsappNumber] = useState(settings.whatsappNumber);
  const [notifyOnMissingSkills, setNotifyOnMissingSkills] = useState(settings.notifyOnMissingSkills);
  const [minAtsThreshold, setMinAtsThreshold] = useState(settings.minAtsThreshold);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [filterMode, setFilterMode] = useState<'pending' | 'all'>('pending');

  const resumeMap = useMemo(() => new Map(resumes.map((r) => [r.id, r.title])), [resumes]);

  const queueApps = useMemo(() => {
    return applications.filter((app) => {
      if (app.status === 'Archived') return false;
      const approvals = app.skillApprovals || [];
      if (filterMode === 'pending') {
        return approvals.some((a) => a.decision === 'pending');
      }
      return approvals.length > 0;
    });
  }, [applications, filterMode]);

  const handleSavePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSavedNotice(false);
    try {
      await onSaveSettings({
        email: email.trim(),
        whatsappNumber: whatsappNumber.trim(),
        notifyOnMissingSkills,
        minAtsThreshold: Number(minAtsThreshold) || 75,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
          Human Approval Gate & Free Notifications
        </h1>
        <p className="text-sm text-slate-500">
          AI never adds missing or irrelevant skills to your applications without explicit confirmation. Review flagged gaps or send free WhatsApp / Email alerts.
        </p>
      </div>

      {/* Free Notification Preferences */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Free Notification Channels (Zero API Cost)
            </h2>
            <p className="text-xs text-slate-500">
              Uses direct mailto email drafts and WhatsApp Click-to-Chat links with zero paid gateway fees.
            </p>
          </div>
          {savedNotice && (
            <span className="text-xs font-medium text-emerald-700">Preferences saved</span>
          )}
        </div>

        <form onSubmit={handleSavePrefs} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Notification Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              WhatsApp Number (with country code)
            </label>
            <input
              type="text"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              placeholder="e.g., 14155550199"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Minimum ATS Alert Threshold (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={minAtsThreshold}
              onChange={(e) => setMinAtsThreshold(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOnMissingSkills}
                onChange={(e) => setNotifyOnMissingSkills(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span>Flag missing skills</span>
            </label>
            <button
              type="submit"
              disabled={savingSettings}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {savingSettings ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </section>

      {/* Queue Filter */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Skill Verification Queue
            </h2>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setFilterMode('pending')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                filterMode === 'pending' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Pending Review
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                filterMode === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              All Flagged Roles
            </button>
          </div>
        </div>

        {queueApps.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-900">
              No pending missing-skill approvals right now
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Whenever AI detects a job requirement not backed by your resume, it will pause here for your decision.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {queueApps.map((app) => {
              const resumeTitle = resumeMap.get(app.resumeId) || 'Unlinked Resume';
              const links = buildApplicationAlertLinks(app, resumeTitle, settings);
              return (
                <div key={app.id} className="p-6 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <button
                        type="button"
                        onClick={() => onSelectApplication(app.id)}
                        className="inline-flex items-center gap-1.5 text-left font-display text-base font-semibold text-slate-900 hover:text-blue-700"
                      >
                        <span>
                          {app.company} — {app.roleTitle}
                        </span>
                        <ArrowUpRight className="h-4 w-4 text-slate-400" />
                      </button>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Resume: {resumeTitle} · ATS Score:{' '}
                        <span className="font-mono font-semibold text-slate-800 tabular-nums">
                          {app.matchScore}%
                        </span>{' '}
                        · Stage: {app.status}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <a
                        href={links.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 whitespace-nowrap"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span>Notify WhatsApp (Free)</span>
                      </a>
                      <a
                        href={links.emailUrl}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        <span>Notify Email (Free)</span>
                      </a>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {(app.skillApprovals || []).map((item) => (
                      <div
                        key={item.skill}
                        className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">
                            {item.skill}
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              ·{' '}
                              {item.decision === 'approved'
                                ? 'Approved by human'
                                : item.decision === 'declined'
                                  ? 'Excluded from resume'
                                  : 'Awaiting decision'}
                            </span>
                          </p>
                          <p className="text-xs text-slate-500">{item.reason}</p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onDecision(app.id, item.skill, 'approved')}
                            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                              item.decision === 'approved'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Approve (I have this)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onDecision(app.id, item.skill, 'declined')}
                            className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
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
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
