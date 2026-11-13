import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Sidebar, type ActiveRoute } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardView } from './components/DashboardView';
import { ResumesView } from './components/ResumesView';
import { MatcherView } from './components/MatcherView';
import { ApplicationDetailView } from './components/ApplicationDetailView';
import { ArchitectureView } from './components/ArchitectureView';
import { CopilotPanel } from './components/CopilotPanel';
import { ApprovalsView } from './components/ApprovalsView';
import { JobScoutView } from './components/JobScoutView';
import type {
  ApplicationStatus,
  ApprovalDecision,
  ChatMessage,
  DashboardMetrics,
  JobApplication,
  NotificationSettings,
  ResumeProfile,
} from './types';

const EMPTY_METRICS: DashboardMetrics = {
  totalApplications: 0,
  activePipeline: 0,
  interviewRate: 0,
  averageMatchScore: 0,
  upcomingFollowUps: 0,
  pendingApprovalsCount: 0,
  staleApplicationsCount: 0,
  statusBreakdown: {
    Saved: 0,
    Applied: 0,
    Interviewing: 0,
    Offer: 0,
    Archived: 0,
  },
  resumePerformance: [],
  topMissingSkills: [],
};

const DEFAULT_SETTINGS: NotificationSettings = {
  email: 'jishnusathyanarayanan@gmail.com',
  whatsappNumber: '',
  notifyOnMissingSkills: true,
  minAtsThreshold: 75,
};

export default function App() {
  const [activeRoute, setActiveRoute] = useState<ActiveRoute>('dashboard');
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copilotDrawerOpen, setCopilotDrawerOpen] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [resumes, setResumes] = useState<ResumeProfile[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load workspace data.');
      setMetrics(data.metrics);
      setApplications(data.applications);
      setResumes(data.resumes);
      if (data.settings) setSettings(data.settings);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to reach backend API.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDashboard();
  }, [refreshDashboard]);

  const handleSelectApplication = (id: string) => {
    setSelectedApplicationId(id);
    setActiveRoute('detail');
    setCopilotDrawerOpen(false);
  };

  const handleUpdateStatus = async (id: string, status: ApplicationStatus) => {
    const res = await fetch(`/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      await refreshDashboard();
    }
  };

  const handleDeleteApplication = async (id: string) => {
    const res = await fetch(`/api/applications/${id}`, { method: 'DELETE' });
    if (res.ok) {
      if (selectedApplicationId === id) {
        setSelectedApplicationId(null);
        setActiveRoute('dashboard');
      }
      await refreshDashboard();
    }
  };

  const handleApprovalDecision = async (
    applicationId: string,
    skill: string,
    decision: ApprovalDecision,
  ) => {
    const res = await fetch(`/api/applications/${applicationId}/approvals`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill, decision }),
    });
    if (res.ok) {
      await refreshDashboard();
    }
  };

  const handleSaveSettings = async (patch: Partial<NotificationSettings>) => {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (res.ok && data.settings) {
      setSettings(data.settings);
    }
  };

  const selectedApplication = applications.find((a) => a.id === selectedApplicationId);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        activeRoute={activeRoute}
        onNavigate={(route) => {
          setActiveRoute(route);
          if (route !== 'dashboard') setSelectedApplicationId(null);
        }}
        applicationCount={applications.length}
        resumeCount={resumes.length}
        pendingApprovalsCount={metrics.pendingApprovalsCount}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          activeRoute={activeRoute}
          detailLabel={
            selectedApplication
              ? `${selectedApplication.company} — ${selectedApplication.roleTitle}`
              : undefined
          }
          onNavigateDashboard={() => {
            setActiveRoute('dashboard');
            setSelectedApplicationId(null);
          }}
          onNewApplication={() => setActiveRoute('matcher')}
          onToggleCopilotDrawer={() => setCopilotDrawerOpen((prev) => !prev)}
          onOpenMobileMenu={() => setMobileOpen(true)}
        />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">
          {errorMessage && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          {activeRoute === 'dashboard' && (
            <DashboardView
              metrics={metrics}
              applications={applications}
              resumes={resumes}
              loading={loading}
              onSelectApplication={handleSelectApplication}
              onUpdateStatus={handleUpdateStatus}
              onDeleteApplication={handleDeleteApplication}
              onOpenMatcher={() => setActiveRoute('matcher')}
              onOpenApprovals={() => setActiveRoute('approvals')}
            />
          )}

          {activeRoute === 'discover' && (
            <JobScoutView
              resumes={resumes}
              settings={settings}
              onRefresh={refreshDashboard}
              onOpenDashboard={() => setActiveRoute('dashboard')}
            />
          )}

          {activeRoute === 'copilot' && (
            <CopilotPanel
              messages={chatMessages}
              onMessagesChange={setChatMessages}
              onSelectApplication={handleSelectApplication}
              totalApplications={applications.length}
            />
          )}

          {activeRoute === 'resumes' && (
            <ResumesView resumes={resumes} onRefresh={refreshDashboard} />
          )}

          {activeRoute === 'matcher' && (
            <MatcherView
              resumes={resumes}
              settings={settings}
              onSaved={async (newId) => {
                await refreshDashboard();
                setSelectedApplicationId(newId);
                setActiveRoute('detail');
              }}
            />
          )}

          {activeRoute === 'approvals' && (
            <ApprovalsView
              applications={applications}
              resumes={resumes}
              settings={settings}
              onDecision={handleApprovalDecision}
              onSaveSettings={handleSaveSettings}
              onSelectApplication={handleSelectApplication}
            />
          )}

          {activeRoute === 'detail' && selectedApplicationId && (
            <ApplicationDetailView
              applicationId={selectedApplicationId}
              settings={settings}
              onBack={() => {
                setSelectedApplicationId(null);
                setActiveRoute('dashboard');
              }}
              onApplicationUpdated={refreshDashboard}
            />
          )}

          {activeRoute === 'architecture' && <ArchitectureView />}
        </main>
      </div>

      {/* Quick Slide-over Pipeline Copilot Drawer */}
      {copilotDrawerOpen && activeRoute !== 'copilot' && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/25">
          <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Pipeline Copilot
                </h2>
                <p className="text-xs text-slate-500">
                  Instant search across {applications.length} applications
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCopilotDrawerOpen(false)}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close Copilot"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <CopilotPanel
                messages={chatMessages}
                onMessagesChange={setChatMessages}
                onSelectApplication={handleSelectApplication}
                totalApplications={applications.length}
                compact
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
