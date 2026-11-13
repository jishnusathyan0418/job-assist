import { Menu, Plus, MessageSquare } from 'lucide-react';
import type { ActiveRoute } from './Sidebar';

interface TopBarProps {
  activeRoute: ActiveRoute;
  detailLabel?: string;
  onNavigateDashboard: () => void;
  onNewApplication: () => void;
  onToggleCopilotDrawer: () => void;
  onOpenMobileMenu: () => void;
}

const ROUTE_TITLES: Record<ActiveRoute, string> = {
  dashboard: 'Applications & ATS Metrics',
  discover: 'Live Job Discovery & Guided Apply',
  copilot: 'Pipeline Copilot',
  resumes: 'Resumes & AI Skill Extraction',
  matcher: 'New Application & AI Matcher',
  approvals: 'Skill Approvals & Notifications',
  detail: 'Application Detail & Interview Prep',
  architecture: 'Database Schema & API Routes',
};

export function TopBar({
  activeRoute,
  detailLabel,
  onNavigateDashboard,
  onNewApplication,
  onToggleCopilotDrawer,
  onOpenMobileMenu,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-6 border-b border-slate-200 bg-white px-4 sm:px-8">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <button
            type="button"
            onClick={onNavigateDashboard}
            className="text-slate-500 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            JobPulse
          </button>
          <span className="text-slate-300" aria-hidden="true">
            /
          </span>
          {activeRoute === 'detail' && detailLabel ? (
            <>
              <button
                type="button"
                onClick={onNavigateDashboard}
                className="hidden sm:inline text-slate-500 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                Applications
              </button>
              <span className="hidden sm:inline text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="truncate font-medium text-slate-900">{detailLabel}</span>
            </>
          ) : (
            <span className="truncate font-medium text-slate-900">
              {ROUTE_TITLES[activeRoute]}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {activeRoute !== 'copilot' && (
          <button
            type="button"
            onClick={onToggleCopilotDrawer}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <MessageSquare className="h-4 w-4 text-blue-600" />
            <span className="hidden sm:inline">Ask Copilot</span>
          </button>
        )}

        {activeRoute !== 'matcher' && (
          <button
            type="button"
            onClick={onNewApplication}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-700 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            <span>New Application</span>
          </button>
        )}
      </div>
    </header>
  );
}
