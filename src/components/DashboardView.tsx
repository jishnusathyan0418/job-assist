import { useMemo, useState } from 'react';
import { ArrowUpRight, Search, Trash2, Calendar, Download, ShieldAlert } from 'lucide-react';
import type {
  ApplicationStatus,
  DashboardMetrics,
  JobApplication,
  ResumeProfile,
} from '../types';

interface DashboardViewProps {
  metrics: DashboardMetrics;
  applications: JobApplication[];
  resumes: ResumeProfile[];
  loading: boolean;
  onSelectApplication: (id: string) => void;
  onUpdateStatus: (id: string, status: ApplicationStatus) => Promise<void>;
  onDeleteApplication: (id: string) => Promise<void>;
  onOpenMatcher: () => void;
  onOpenApprovals: () => void;
}

const STATUS_OPTIONS: ApplicationStatus[] = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Archived'];

const STATUS_TEXT_COLOR: Record<ApplicationStatus, string> = {
  Offer: 'text-emerald-700 font-semibold',
  Interviewing: 'text-amber-700 font-medium',
  Applied: 'text-blue-700 font-medium',
  Saved: 'text-slate-700 font-medium',
  Archived: 'text-slate-400 font-normal',
};

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-700';
  if (score >= 60) return 'text-amber-700';
  return 'text-rose-700';
}

export function DashboardView({
  metrics,
  applications,
  resumes,
  loading,
  onSelectApplication,
  onUpdateStatus,
  onDeleteApplication,
  onOpenMatcher,
  onOpenApprovals,
}: DashboardViewProps) {
  const [statusFilter, setStatusFilter] = useState<'All' | ApplicationStatus>('All');
  const [resumeFilter, setResumeFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'score' | 'company'>('updated');
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const resumeMap = useMemo(() => new Map(resumes.map((r) => [r.id, r.title])), [resumes]);

  const filteredApplications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return applications
      .filter((app) => {
        if (statusFilter !== 'All' && app.status !== statusFilter) return false;
        if (resumeFilter !== 'All' && app.resumeId !== resumeFilter) return false;
        if (!q) return true;
        const resumeTitle = (resumeMap.get(app.resumeId) || '').toLowerCase();
        return (
          app.company.toLowerCase().includes(q) ||
          app.roleTitle.toLowerCase().includes(q) ||
          app.location.toLowerCase().includes(q) ||
          resumeTitle.includes(q) ||
          app.matchedSkills.some((s) => s.toLowerCase().includes(q)) ||
          app.missingSkills.some((s) => s.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'score') return b.matchScore - a.matchScore;
        if (sortBy === 'company') return a.company.localeCompare(b.company);
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [applications, statusFilter, resumeFilter, searchQuery, sortBy, resumeMap]);

  const totalPages = Math.max(1, Math.ceil(filteredApplications.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleApplications = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredApplications.slice(start, start + pageSize);
  }, [filteredApplications, currentPage, pageSize]);

  const upcomingFollowUps = useMemo(() => {
    return applications
      .filter((a) => a.nextFollowUp && a.status !== 'Archived')
      .sort((a, b) => (a.nextFollowUp || '').localeCompare(b.nextFollowUp || ''))
      .slice(0, 5);
  }, [applications]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-xl bg-white divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="p-5 space-y-2">
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="h-7 w-16 rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 rounded bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 text-balance">
            Application Pipeline
          </h1>
          <p className="text-sm text-slate-500">
            Track roles, exact resume versions used, ATS scores, and human skill approval gates at scale.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {metrics.pendingApprovalsCount > 0 && (
            <button
              type="button"
              onClick={onOpenApprovals}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 whitespace-nowrap"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">{metrics.pendingApprovalsCount}</span>
              <span>Skill Approvals</span>
            </button>
          )}
          <a
            href="/api/applications/export.csv"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <section
        aria-label="Pipeline metrics"
        className="grid grid-cols-2 lg:grid-cols-4 rounded-xl border border-slate-200 bg-white divide-y lg:divide-y-0 lg:divide-x divide-slate-200"
      >
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Active Pipeline</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.activePipeline}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {metrics.totalApplications} total · {metrics.staleApplicationsCount} need follow-up
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Interview Conversion</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.interviewRate}%
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {metrics.statusBreakdown.Interviewing} interviewing · {metrics.statusBreakdown.Offer} offers
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Average ATS Score</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.averageMatchScore}%
          </p>
          <p className="mt-1 text-xs text-slate-500">Across {resumes.length} resume versions</p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Pending Skill Approvals</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {metrics.pendingApprovalsCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {metrics.upcomingFollowUps} follow-ups queued
          </p>
        </div>
      </section>

      {/* Main Applications Table Surface */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(['All', ...STATUS_OPTIONS] as const).map((tab) => {
                const active = statusFilter === tab;
                const count = tab === 'All' ? applications.length : metrics.statusBreakdown[tab] || 0;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setStatusFilter(tab);
                      setPage(1);
                    }}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab} <span className="ml-1 font-mono text-slate-400 tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search company, role, skill..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <select
                aria-label="Filter by resume used"
                value={resumeFilter}
                onChange={(e) => {
                  setResumeFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-600 focus:outline-none"
              >
                <option value="All">All Resumes</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>

              <select
                aria-label="Sort applications"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'updated' | 'score' | 'company')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-blue-600 focus:outline-none"
              >
                <option value="updated">Sort: Recent</option>
                <option value="score">Sort: ATS Score</option>
                <option value="company">Sort: Company A–Z</option>
              </select>
            </div>
          </div>
        </div>

        {applications.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <h2 className="font-display text-base font-semibold text-slate-900">
              No applications tracked yet
            </h2>
            <p className="mt-1 max-w-md text-sm text-slate-500">
              Run an AI match analysis against a job description to score your ATS fit and log your first role.
            </p>
            <button
              type="button"
              onClick={onOpenMatcher}
              className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Analyze First Role
            </button>
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-900">No applications match your filter</p>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('All');
                setResumeFilter('All');
                setSearchQuery('');
              }}
              className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                    <th className="py-3 pl-5 pr-3">Company & Role</th>
                    <th className="px-3 py-3 hidden lg:table-cell">Resume Used</th>
                    <th className="px-3 py-3">Stage</th>
                    <th className="px-3 py-3 text-right">ATS Score</th>
                    <th className="px-3 py-3 text-right hidden sm:table-cell">Follow-up</th>
                    <th className="py-3 pl-3 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {visibleApplications.map((app) => {
                    const resumeTitle = resumeMap.get(app.resumeId) || 'Unlinked Resume';
                    const pendingCount = (app.skillApprovals || []).filter(
                      (s) => s.decision === 'pending',
                    ).length;

                    return (
                      <tr key={app.id} className="group transition-colors hover:bg-slate-50/80">
                        <td className="py-3.5 pl-5 pr-3">
                          <button
                            type="button"
                            onClick={() => onSelectApplication(app.id)}
                            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                          >
                            <div className="font-medium text-slate-900 group-hover:text-blue-700 transition-colors">
                              {app.company}
                            </div>
                            <div className="text-xs text-slate-500">
                              <span>{app.roleTitle}</span>
                              {pendingCount > 0 && app.status !== 'Archived' && (
                                <span className="ml-2 text-amber-700 font-medium">
                                  · {pendingCount} skill approval needed
                                </span>
                              )}
                            </div>
                          </button>
                        </td>

                        <td className="px-3 py-3.5 hidden lg:table-cell">
                          <div className="max-w-[230px] truncate text-xs font-medium text-slate-700">
                            {resumeTitle}
                          </div>
                          <div className="text-xs text-slate-400 font-mono tabular-nums">
                            {app.appliedAt ? `Applied ${app.appliedAt}` : 'Not submitted yet'}
                          </div>
                        </td>

                        <td className="px-3 py-3.5">
                          <select
                            aria-label={`Stage for ${app.company}`}
                            value={app.status}
                            onChange={(e) => onUpdateStatus(app.id, e.target.value as ApplicationStatus)}
                            className={`rounded border border-transparent bg-transparent py-1 pr-2 text-xs hover:border-slate-200 focus:border-blue-600 focus:bg-white focus:outline-none ${STATUS_TEXT_COLOR[app.status]}`}
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s} className="text-slate-900 font-normal">
                                {s}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-3 py-3.5 text-right">
                          <div
                            className={`font-mono text-sm font-semibold tabular-nums ${getScoreColor(app.matchScore)}`}
                          >
                            {app.matchScore}%
                          </div>
                          <div className="text-xs text-slate-400 font-mono tabular-nums">
                            {app.matchedSkills.length} match · {app.missingSkills.length} gap
                          </div>
                        </td>

                        <td className="px-3 py-3.5 text-right hidden sm:table-cell">
                          <span className="font-mono text-xs text-slate-500 tabular-nums">
                            {app.nextFollowUp || '—'}
                          </span>
                        </td>

                        <td className="py-3.5 pl-3 pr-5 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => onSelectApplication(app.id)}
                              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
                            >
                              <span>Open</span>
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </button>

                            {confirmDeleteId === app.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteApplication(app.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="rounded-md px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 whitespace-nowrap"
                              >
                                Confirm
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(app.id)}
                                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                                aria-label={`Delete ${app.company} application`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer for 100+ Applications */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
              <div className="font-mono tabular-nums">
                Showing {(currentPage - 1) * pageSize + 1}–
                {Math.min(currentPage * pageSize, filteredApplications.length)} of{' '}
                {filteredApplications.length} applications
              </div>
              <div className="flex items-center gap-3">
                <select
                  aria-label="Rows per page"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                >
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="px-2 font-mono tabular-nums">
                    {currentPage}/{totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Strategic Intelligence Row: Resume ATS Performance, Top Missing Skills, Follow-ups */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Resume ATS Performance
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Compare which resume version produces higher ATS scores and interviews.
          </p>
          <div className="mt-4 divide-y divide-slate-100">
            {metrics.resumePerformance.map((stat) => (
              <div key={stat.resumeId} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResumeFilter(stat.resumeId);
                      setPage(1);
                    }}
                    className="truncate text-left text-xs font-medium text-slate-900 hover:text-blue-700"
                  >
                    {stat.resumeTitle}
                  </button>
                  <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums shrink-0">
                    {stat.avgAtsScore}% ATS
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                  {stat.applicationCount} apps · {stat.interviewRate}% interview rate
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Recurring Skill Gaps
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Most frequent requirements missing across your target roles.
          </p>
          {metrics.topMissingSkills.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">No recurring skill gaps detected yet.</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {metrics.topMissingSkills.map((item) => (
                <div
                  key={item.skill}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 text-xs"
                >
                  <span className="font-medium text-slate-800">{item.skill}</span>
                  <span className="font-mono text-slate-500 tabular-nums">
                    {item.count} {item.count === 1 ? 'role' : 'roles'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-sm font-semibold text-slate-900">Upcoming Follow-ups</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Next scheduled recruiter touchpoints and interview deadlines.
          </p>
          {upcomingFollowUps.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500">No upcoming follow-ups scheduled.</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {upcomingFollowUps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => onSelectApplication(app.id)}
                  className="flex w-full items-center justify-between py-2.5 first:pt-0 last:pb-0 text-left transition-colors hover:bg-slate-50/70"
                >
                  <div className="min-w-0 pr-3">
                    <p className="truncate text-xs font-medium text-slate-900">
                      {app.company} — {app.roleTitle}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {app.status} · {app.matchScore}% ATS
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 font-mono text-xs font-medium text-slate-700 tabular-nums shrink-0">
                    <Calendar className="h-3 w-3 text-slate-400" />
                    {app.nextFollowUp}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
