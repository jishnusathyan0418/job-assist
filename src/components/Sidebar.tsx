import { useState } from 'react';
import {
  Briefcase,
  FileText,
  Sparkles,
  Database,
  MessageSquare,
  ShieldAlert,
  Globe,
  X,
} from 'lucide-react';

export type ActiveRoute =
  | 'dashboard'
  | 'discover'
  | 'copilot'
  | 'resumes'
  | 'matcher'
  | 'approvals'
  | 'detail'
  | 'architecture';

interface SidebarProps {
  activeRoute: ActiveRoute;
  onNavigate: (route: Exclude<ActiveRoute, 'detail'>) => void;
  applicationCount: number;
  resumeCount: number;
  pendingApprovalsCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeRoute,
  onNavigate,
  applicationCount,
  resumeCount,
  pendingApprovalsCount,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);

  const navItems: Array<{
    id: Exclude<ActiveRoute, 'detail'>;
    label: string;
    count?: number;
    icon: typeof Briefcase;
  }> = [
    { id: 'dashboard', label: 'Applications', count: applicationCount, icon: Briefcase },
    { id: 'discover', label: 'Discover Jobs', icon: Globe },
    { id: 'copilot', label: 'Pipeline Copilot', icon: MessageSquare },
    { id: 'resumes', label: 'Resumes & Skills', count: resumeCount, icon: FileText },
    { id: 'matcher', label: 'AI Matcher', icon: Sparkles },
    { id: 'approvals', label: 'Skill Approvals', count: pendingApprovalsCount, icon: ShieldAlert },
    { id: 'architecture', label: 'Schema & API', icon: Database },
  ];

  const isRouteActive = (id: Exclude<ActiveRoute, 'detail'>) => {
    if (id === 'dashboard' && (activeRoute === 'dashboard' || activeRoute === 'detail')) return true;
    return activeRoute === id;
  };

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-out lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-6">
          <button
            type="button"
            onClick={() => {
              onNavigate('dashboard');
              onCloseMobile();
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
          >
            JobPulse
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isRouteActive(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile();
                }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.count === 'number' && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active
                        ? 'text-blue-700'
                        : item.id === 'approvals' && item.count > 0
                          ? 'font-semibold text-amber-700'
                          : 'text-slate-400'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-3">
            {!avatarFailed ? (
              <img
                src="/src/assets/images/avatar_jobpulse_user_1794569304152.jpg"
                alt="Alex Mercer"
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="h-9 w-9 shrink-0 rounded-lg object-cover border border-slate-200"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-semibold text-white">
                AM
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">Alex Mercer</p>
              <p className="truncate text-xs text-slate-500">Staff Product Track</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
