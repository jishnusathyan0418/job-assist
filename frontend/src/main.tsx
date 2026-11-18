import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { api, downloadExport, formatDate, checkedTime, label, statuses } from "./api";
import type { Application, History, Job, Page, Session, Stats } from "./api";
import "./styles.css";
import "./product.css";
import {AuthScreen,Profile,Discover,ApplyActions,ResumeTailor,SubmissionPanel} from "./features";

type Context = {
  session: Session;
  revision: number;
  refresh: () => void;
  notify: (s: string) => void;
  signIn: () => void;
};
const AppContext = createContext<Context>(null!);
const useApp = () => useContext(AppContext);

function useData<T>(path: string) {
  const { revision } = useApp();
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision, retry]);
  return { data, error, loading, retry: () => setRetry((v) => v + 1) };
}

function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const el = ref.current;
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <CircleHelp size={19} />
      <span>{message}</span>
      {retry && <button onClick={retry}>Try again</button>}
    </div>
  );
}
function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Loading your workspace…
    </div>
  );
}
function Empty({
  title = "Nothing here yet",
  text = "Try changing your filters or add your first job.",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <div className="empty">
      <BriefcaseBusiness size={32} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={"badge " + status}>
      <i />
      {label(status)}
    </span>
  );
}
function CompanyMark({ name }: { name: string }) {
  let n = 0;
  for (const c of name) n += c.charCodeAt(0);
  return (
    <span className={"company-mark tone-" + (n % 5)}>
      {name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}

function Layout() {
  const [session, setSession] = useState<Session>({
      authenticated: false,
      csrf_token: null,
    }),
    [checking, setChecking] = useState(true),
    [revision, setRevision] = useState(0),
    [toast, setToast] = useState(""),
    [authError, setAuthError] = useState("");
  const navigate = useNavigate();
  useEffect(()=>{const expire=()=>setSession({authenticated:false,csrf_token:null}); window.addEventListener("jobspace:session-expired",expire);return()=>window.removeEventListener("jobspace:session-expired",expire)},[]);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    api<Session>("/auth/session")
      .then(setSession)
      .catch((e) => setAuthError(e.message)).finally(()=>setChecking(false));
  }, [revision]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" }, session.csrf_token);
      setSession({ authenticated: false, csrf_token: null });
      setToast(""); navigate("/");
    } catch (e) {
      setToast((e as Error).message);
      refresh();
    }
  }
  if(checking) return <Loading/>;
  if(!session.authenticated) return <AuthScreen initialError={authError} onLogin={(next,isNew)=>{setSession(next);refresh();navigate(isNew?"/profile":"/")}}/>;
  const featureProps={session,refresh,notify:setToast};
  return (
    <AppContext.Provider
      value={{
        session,
        revision,
        refresh,
        notify: setToast,
        signIn: () => setSession({authenticated:false,csrf_token:null}),
      }}
    >
      <div className="shell">
        <aside className="sidebar">
          <Link className="brand" to="/">
            <span className="brand-icon">
              <BriefcaseBusiness size={22} />
            </span>
            jobspace<span className="brand-dot">.</span>
          </Link>
          <div className="workspace-label">YOUR WORKSPACE</div>
          <nav>
            <NavLink to="/profile"><FileText size={19}/>Resume & profile</NavLink>
            <NavLink to="/discover"><Search size={19}/>Find live jobs</NavLink>
            <NavLink end to="/">
              <LayoutDashboard size={19} />
              Overview
            </NavLink>
            <NavLink to="/jobs">
              <BriefcaseBusiness size={19} />
              Job board
            </NavLink>
            <NavLink to="/applications">
              <FileText size={19} />
              Applications
            </NavLink>
          </nav>
          <div className="sidebar-note">
            <span className="mini-icon">
              <Target size={21} />
            </span>
            <h3>A little progress, daily.</h3>
            <p>
              Keep your opportunities organized and your next step in sight.
            </p>
            <Link to="/jobs">
              Explore your job board <ArrowRight size={15} />
            </Link>
          </div>
          <div className="sidebar-bottom">
            <div className="version">
              <span className="live-dot" />
              Version 0.1 <span>V0</span>
            </div>
            <p>Job Automation System</p>
          </div>
        </aside>
        <div className="main-area">
          <header className="topbar">
            <div className="breadcrumb">
              Workspace <ChevronRight size={14} />
              <span>Career tracker</span>
            </div>
            <div className="top-actions">
              <span className="demo-pill">
                <span className="live-dot" />
                Private workspace
              </span>
              <button className="button subtle" onClick={logout}><LogOut size={16}/>Sign out</button>
              <span className="avatar">
                {session.user?.full_name.slice(0,2).toUpperCase() || "ME"}
              </span>
            </div>
          </header>
          <main>
            <div className="sample-notice">
              <ShieldCheck size={16} />
              <span>
                Your private workspace. Only you can access your resume, saved jobs, and applications.
              </span>
            </div>
            {authError && (
              <div className="auth-note">
                Sign-in status could not be checked.{" "}
                <button
                  onClick={() => {
                    setAuthError("");
                    refresh();
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            <Routes key={session.user?.id}>
              <Route path="/profile" element={<Profile {...featureProps}/>} />
              <Route path="/discover" element={<Discover {...featureProps}/>} />
              <Route path="/" element={<Dashboard />} />
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/applications" element={<Applications />} />
              <Route path="/applications/:id" element={<ApplicationDetail />} />
              <Route
                path="*"
                element={
                  <Empty
                    title="Page not found"
                    text="Use the navigation to return to your workspace."
                  />
                }
              />
            </Routes>
            <footer>
              Built for a more intentional job search.
              <span>Jobspace V0</span>
            </footer>
          </main>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={18} />
          {toast}
        </div>
      )}
    </AppContext.Provider>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}

function Dashboard() {
  const { session, signIn, notify } = useApp();
  const [adding, setAdding] = useState(false),
    [period, setPeriod] = useState("all");
  const params = new URLSearchParams();
  if (period !== "all") {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - Number(period) + 1);
    params.set("date_from", d.toISOString().slice(0, 10));
  }
  const stats = useData<Stats>("/statistics?" + params),
    recent = useData<Page<Application>>("/applications?limit=5&" + params);
  const data = stats.data;
  const cards = [
    {
      name: "Applications",
      value: data?.total,
      icon: FileText,
      className: "teal",
      caption: "Total opportunities tracked",
    },
    {
      name: "Applied",
      value: data?.by_status.applied,
      icon: ArrowUpRight,
      className: "blue",
      caption: "Awaiting the next step",
    },
    {
      name: "Interviews",
      value: data?.by_status.interview,
      icon: Users,
      className: "purple",
      caption: "Conversations in progress",
    },
    {
      name: "Offers",
      value: data?.by_status.offer,
      icon: Sparkles,
      className: "green",
      caption: "New possibilities",
    },
    {
      name: "Rejections",
      value: data?.by_status.rejected,
      icon: BriefcaseBusiness,
      className: "slate",
      caption: "Part of the process",
    },
    {
      name: "Action needed",
      value: data?.by_status.manual_action_required,
      icon: Clock3,
      className: "amber",
      caption: "Waiting for your attention",
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="YOUR NEXT CHAPTER"
        title="A clearer view of your job search."
        description="Every opportunity, every update. All in one place."
      >
        <button
          className="button primary"
          onClick={() => (session.authenticated ? setAdding(true) : signIn())}
        >
          <Plus size={18} />
          Add a job
        </button>
      </PageHeading>
      <section className="onboarding-strip"><Link to="/profile">1. Upload & review resume</Link><ArrowRight size={15}/><Link to="/discover">2. Find live jobs</Link><ArrowRight size={15}/><Link to="/applications">3. Apply & track</Link></section>
      <section className="overview-banner">
        <div>
          <span className="banner-label">
            <span className="live-dot" />
            YOUR SEARCH, IN FOCUS
          </span>
          <h2>Small steps. New possibilities.</h2>
          <p>Save the roles that interest you. Track what happens next.</p>
          <Link to="/jobs">
            Explore job board <ArrowRight size={17} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="art-card art-main">
            <BriefcaseBusiness size={29} />
            <span>
              Your next opportunity<small>One step closer</small>
            </span>
            <span className="art-check">
              <Check size={18} />
            </span>
          </span>
          <span className="art-float">
            <Sparkles size={17} />
            Make room for what’s next
          </span>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <h2>Your search at a glance</h2>
          <p>Current statuses · filtered by date first tracked</p>
        </div>
        <label className="inline-label">
          Period
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="all">All time</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </label>
      </div>
      {stats.error ? (
        <ErrorBox message={stats.error} retry={stats.retry} />
      ) : (
        <div className="stats-grid">
          {cards.map((c) => (
            <article className="stat-card" key={c.name}>
              <div className="stat-top">
                <span>{c.name}</span>
                <span className={"stat-icon " + c.className}>
                  <c.icon size={18} />
                </span>
              </div>
              <strong>{stats.loading ? "—" : (c.value ?? 0)}</strong>
              <p>{c.caption}</p>
            </article>
          ))}
        </div>
      )}
      <div className="dashboard-lower">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent applications</h2>
              <p>The latest moves in your search</p>
            </div>
            <Link className="text-link" to="/applications">
              View all <ArrowRight size={15} />
            </Link>
          </div>
          {recent.loading ? (
            <Loading />
          ) : recent.error ? (
            <ErrorBox message={recent.error} retry={recent.retry} />
          ) : (
            <ApplicationTable items={recent.data?.items ?? []} compact />
          )}
        </section>
        <section className="panel pipeline">
          <div className="panel-heading">
            <div>
              <h2>Your pipeline</h2>
              <p>Where things stand right now</p>
            </div>
            <ChartNoAxesCombined size={19} />
          </div>
          {stats.error ? (
            <p className="muted padded">Statistics unavailable.</p>
          ) : (
            <>
              <div className="pipeline-total">
                <strong>{stats.loading ? "—" : (data?.total ?? 0)}</strong>
                <span>tracked applications</span>
              </div>
              <div
                className="stacked-bar"
                aria-label="Application status distribution"
              >
                {Object.entries(data?.by_status ?? {})
                  .filter(([, v]) => v > 0)
                  .map(([s, v]) => (
                    <div
                      key={s}
                      className={"segment " + s}
                      style={{ flex: v }}
                      title={`${label(s)}: ${v}`}
                    />
                  ))}
              </div>
              <div className="pipeline-legend">
                {Object.entries(data?.by_status ?? {})
                  .filter(([, v]) => v > 0)
                  .map(([s, v]) => (
                    <Link to={"/applications?status=" + s} key={s}>
                      <span>
                        <i className={"legend-dot " + s} />
                        {label(s)}
                      </span>
                      <strong>{v}</strong>
                    </Link>
                  ))}
              </div>
            </>
          )}
          <button
            className="button subtle wide export-button"
            onClick={() =>
              downloadExport(params).catch((e) => notify(e.message))
            }
          >
            <ArrowDownToLine size={16} />
            Export this view
          </button>
        </section>
      </div>
      {adding && <JobForm close={() => setAdding(false)} />}
    </>
  );
}

function ApplicationTable({
  items,
  compact = false,
}: {
  items: Application[];
  compact?: boolean;
}) {
  if (!items.length)
    return (
      <Empty
        title="No applications found"
        text="Track a job to start building your application timeline."
      />
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Opportunity</th>
            <th>Status</th>
            {!compact && <th>Platform</th>}
            <th>Tracked</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.id}>
              <td>
                <div className="opportunity">
                  <CompanyMark name={a.job.company} />
                  <div>
                    <Link to={"/applications/" + a.id}>{a.job.title}</Link>
                    <span>
                      {a.job.company}
                      {!compact && a.job.location ? " · " + a.job.location : ""}
                    </span>
                  </div>
                </div>
              </td>
              <td>
                <Badge status={a.status} />
              </td>
              {!compact && <td className="muted">{label(a.job.platform)}</td>}
              <td className="date-cell">{formatDate(a.created_at)}</td>
              <td>
                <Link
                  className="row-link"
                  aria-label={"Open " + a.job.title}
                  to={"/applications/" + a.id}
                >
                  <ChevronRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Filters({ applications = false }: { applications?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState(params.get("q") || "");
  const update = (key: string, value: string) => {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete("offset");
        value ? next.set(key, value) : next.delete(key);
        return next;
      },
      { replace: true },
    );
  };
  useEffect(() => {
    const id = setTimeout(() => {
      if (query !== (params.get("q") || "")) update("q", query);
    }, 250);
    return () => clearTimeout(id);
  }, [query]);
  return (
    <div className="filters">
      <div className="filter-main">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Search jobs and companies"
            placeholder="Search roles, companies, or locations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {applications && (
          <select
            aria-label="Filter by status"
            value={params.get("status") || ""}
            onChange={(e) => update("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        )}
        <button
          className={"button " + (expanded ? "active-filter" : "subtle")}
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          <SlidersHorizontal size={16} />
          Filters
        </button>
        {params.size > 0 && (
          <button
            className="text-link"
            onClick={() => {
              setQuery("");
              setParams({});
            }}
          >
            Clear
          </button>
        )}
      </div>
      {expanded && (
        <div className="expanded-filters">
          {["company", "role", "platform", "location"].map((key) => (
            <label key={key}>
              {label(key)}
              <input
                value={params.get(key) || ""}
                onChange={(e) => update(key, e.target.value)}
                placeholder={"Any " + key}
              />
            </label>
          ))}
          {applications && (
            <>
              <label>
                Tracked from (UTC)
                <input
                  type="date"
                  value={params.get("date_from") || ""}
                  onChange={(e) => update("date_from", e.target.value)}
                />
              </label>
              <label>
                Tracked through (UTC)
                <input
                  type="date"
                  value={params.get("date_to") || ""}
                  onChange={(e) => update("date_to", e.target.value)}
                />
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Pagination({
  total,
  limit,
  offset,
}: {
  total: number;
  limit: number;
  offset: number;
}) {
  const [, setParams] = useSearchParams();
  const go = (n: number) =>
    setParams((p) => {
      const q = new URLSearchParams(p);
      q.set("offset", String(n));
      return q;
    });
  return (
    <div className="pagination">
      <span>
        {total
          ? `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`
          : "0 results"}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Previous page"
          disabled={offset === 0}
          onClick={() => go(Math.max(0, offset - limit))}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="icon-button"
          aria-label="Next page"
          disabled={offset + limit >= total}
          onClick={() => go(offset + limit)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

function Jobs() {
  const { session, signIn } = useApp();
  const [adding, setAdding] = useState(false),
    [params] = useSearchParams();
  const result = useData<Page<Job>>("/jobs?limit=9&" + params);
  return (
    <>
      <PageHeading
        eyebrow="FIND YOUR NEXT STEP"
        title="Your job board"
        description="A home for opportunities worth exploring."
      >
        <button
          className="button primary"
          onClick={() => (session.authenticated ? setAdding(true) : signIn())}
        >
          <Plus size={18} />
          Add a job
        </button>
      </PageHeading>
      <Filters />
      {result.loading ? (
        <Loading />
      ) : result.error ? (
        <ErrorBox message={result.error} retry={result.retry} />
      ) : !result.data?.items.length ? (
        <Empty title="No jobs found" />
      ) : (
        <>
          <div className="results-heading">
            <span>{result.data.total} opportunities</span>
            <span>Newest first</span>
          </div>
          <div className="job-grid">
            {result.data.items.map((j) => (
              <article className="job-card" key={j.id}>
                <div className="job-card-top">
                  <CompanyMark name={j.company} />
                  <span className="platform-tag">{label(j.platform)}</span>
                </div>
                <p className="company-name">{j.company}</p>
                <h2>
                  <Link to={"/jobs/" + j.id}>{j.title}</Link>
                </h2>
                <p className="location">
                  <MapPin size={14} />
                  {j.location || "Location not specified"}
                </p>
                <p className="job-preview">
                  {j.description_raw || "No description added yet."}
                </p>
                <div className="job-card-bottom">
                  <span>Added {formatDate(j.discovered_at)}</span>
                  <Link to={"/jobs/" + j.id} aria-label={"View " + j.title}>
                    <ArrowUpRight size={18} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <Pagination {...result.data} />
        </>
      )}
      {adding && <JobForm close={() => setAdding(false)} />}
    </>
  );
}

function Applications() {
  const { notify } = useApp();
  const [params] = useSearchParams();
  const result = useData<Page<Application>>("/applications?limit=10&" + params);
  const [exporting, setExporting] = useState(false);
  async function exportRows() {
    setExporting(true);
    try {
      await downloadExport(params);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="KEEP THE MOMENTUM"
        title="Your applications"
        description="From first interest to the next chapter. Keep every step in view."
      >
        <button
          className="button subtle"
          disabled={exporting}
          onClick={exportRows}
        >
          <ArrowDownToLine size={17} />
          {exporting ? "Exporting…" : "Export Excel"}
        </button>
        <Link className="button primary" to="/jobs">
          <Plus size={17} />
          Track a job
        </Link>
      </PageHeading>
      <Filters applications />
      <section className="panel">
        {result.loading ? (
          <Loading />
        ) : result.error ? (
          <ErrorBox message={result.error} retry={result.retry} />
        ) : (
          <>
            <ApplicationTable items={result.data?.items ?? []} />
            {result.data && <Pagination {...result.data} />}
          </>
        )}
      </section>
    </>
  );
}

function JobForm({ close, job }: { close: () => void; job?: Job }) {
  const { session, refresh, notify } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const result = await api<Job>(
        job ? "/jobs/" + job.id : "/jobs",
        { method: job ? "PUT" : "POST", body: JSON.stringify(values) },
        session.csrf_token,
      );
      refresh();
      close();
      navigate("/jobs/" + result.id);
      notify(job ? "Job updated." : "Job added to your board.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={job ? "Edit job" : "Add a job"} close={close}>
      <p className="muted">
        Save a job to your private board. Paste the real employer posting URL.
      </p>
      <form onSubmit={submit}>
        {error && <ErrorBox message={error} />}
        <div className="form-grid">
          <label>
            Job title
            <input
              name="title"
              required
              maxLength={255}
              defaultValue={job?.title}
              placeholder="e.g. Junior Python Developer"
              autoFocus
            />
          </label>
          <label>
            Company
            <input
              name="company"
              required
              maxLength={255}
              defaultValue={job?.company}
              placeholder="e.g. Orbit Labs"
            />
          </label>
          <label>
            Location
            <input
              name="location"
              maxLength={255}
              defaultValue={job?.location ?? ""}
              placeholder="e.g. Remote"
            />
          </label>
          <label>
            Platform
            <input
              name="platform"
              required
              maxLength={100}
              defaultValue={job?.platform}
              placeholder="e.g. Company careers"
            />
          </label>
          <label className="full-width">
            Job URL
            <input
              name="job_url"
              type="url"
              required
              maxLength={2048}
              defaultValue={job?.job_url}
              placeholder="https://company.example/careers/job"
            />
          </label>
          <label className="full-width">
            Platform job ID <span className="optional">(optional)</span>
            <input
              name="platform_job_id"
              maxLength={255}
              defaultValue={job?.platform_job_id ?? ""}
            />
          </label>
          <label className="full-width">
            Job description
            <textarea
              name="description_raw"
              rows={5}
              maxLength={30000}
              defaultValue={job?.description_raw ?? ""}
              placeholder="Responsibilities, requirements, and useful details…"
            />
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="button subtle" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : job ? "Save changes" : "Add job"}
            <Check size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ApplicationForm({
  close,
  job,
  application,
}: {
  close: () => void;
  job: Job;
  application?: Application;
}) {
  const { session, refresh, notify } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const values = {
      status: f.get("status"),
      notes: f.get("notes"),
      applied_at: f.get("applied_at")
        ? f.get("applied_at") + "T00:00:00Z"
        : null,
      ...(!application ? { job_id: job.id } : {}),
    };
    try {
      const result = await api<Application>(
        application ? "/applications/" + application.id : "/applications",
        {
          method: application ? "PATCH" : "POST",
          body: JSON.stringify(values),
        },
        session.csrf_token,
      );
      refresh();
      close();
      navigate("/applications/" + result.id);
      notify(
        application
          ? "Application updated."
          : "Application added to your tracker.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={application ? "Update application" : "Track this opportunity"}
      close={close}
    >
      <div className="modal-opportunity">
        <CompanyMark name={job.company} />
        <div>
          <strong>{job.title}</strong>
          <p>{job.company}</p>
        </div>
      </div>
      <form onSubmit={submit}>
        {error && <ErrorBox message={error} />}
        <label>
          Status
          <select
            name="status"
            defaultValue={application?.status || "discovered"}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date applied (UTC)
          <input
            name="applied_at"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={application?.applied_at?.slice(0, 10) || ""}
          />
          <small>
            Optional. Selecting Applied sets today if no date is entered.
          </small>
        </label>
        <label>
          Notes
          <textarea
            name="notes"
            rows={5}
            maxLength={10000}
            defaultValue={application?.notes ?? ""}
            placeholder="Add a reminder, recruiter update, or next step."
          />
        </label>
        <p className="form-hint">
          This updates your records. Mark Applied only after submitting to the employer.
        </p>
        <div className="form-actions">
          <button type="button" className="button subtle" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : application ? "Save update" : "Start tracking"}
            <Check size={17} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function JobDetail() {
  const { id } = useParams();
  const result = useData<Job>("/jobs/" + id);
  const { session, signIn, notify:useAppNotify } = useApp();
  const [edit, setEdit] = useState(false),
    [track, setTrack] = useState(false);
  if (result.loading) return <Loading />;
  if (result.error)
    return <ErrorBox message={result.error} retry={result.retry} />;
  const job = result.data!;
  return (
    <>
      <Link className="back-link" to="/jobs">
        <ArrowLeft size={16} />
        Back to job board
      </Link>
      <PageHeading
        eyebrow={job.company}
        title={job.title}
        description={job.location || "Location not specified"}
      >
        <button
          className="button subtle"
          disabled={job.editable === false}
          onClick={() => (session.authenticated ? setEdit(true) : signIn())}
        >
          Edit job
        </button>
        <button
          className="button primary"
          onClick={() => (session.authenticated ? setTrack(true) : signIn())}
        >
          <Plus size={17} />
          Track application
        </button>
      </PageHeading>
      <section className="apply-strip"><ApplyActions job={job} session={session} notify={useAppNotify}/><span>Complete the employer form, then confirm submission in your tracker.</span></section>
      {session.authenticated&&<ResumeTailor job={job} session={session}/>}
      {job.match_details?.explanation && <section className="panel detail-panel match-panel"><h2>Why this job appeared</h2>{job.match_is_current===false&&<p className="source-warning">This is an older saved match, not a recommendation for your current profile. Run Find live jobs to reassess your preferences.</p>}<p><strong>{job.match_details.classification==='recommended'?'Recommended':'Needs review'}</strong> ? Match at the time of your saved search</p><p>{job.match_details.explanation}</p><p><strong>Your matching skills:</strong> {job.match_details.matched_skills.join(", ") || "No recognized matches"}</p><p><strong>Other skills mentioned:</strong> {job.match_details.other_mentioned_skills.join(", ") || "None recognized"}</p><p>{job.match_details.location_reason}</p>{job.match_details.review_flags?.map(flag=><p key={flag}>{flag}</p>)}{!!job.match_details.requirement_evidence?.length&&<details><summary>Requirement evidence from the posting</summary>{job.match_details.requirement_evidence.map((e,i)=><blockquote key={i}>{e.text}</blockquote>)}</details>}<p>Last checked: {checkedTime(job.last_verified_at)}</p></section>}
      <div className="detail-grid">
        <section className="panel detail-panel">
          <h2>About this opportunity</h2>
          <div className="description">
            {job.description_raw || "No description has been added."}
          </div>
        </section>
        <aside className="panel detail-panel">
          <h2>Job details</h2>
          <dl>
            <dt>Company</dt>
            <dd>{job.company}</dd>
            <dt>Platform</dt>
            <dd>{label(job.platform)}</dd>
            <dt>Posting ID</dt>
            <dd>{job.platform_job_id || "Not provided"}</dd>
            <dt>Discovered</dt>
            <dd>{formatDate(job.discovered_at)}</dd>
          </dl>
          <a
            className="button subtle wide"
            href={job.job_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Original posting <ExternalLink size={15} />
          </a>
          <p className="form-hint">
            Complete your application on the original employer page. Check that the posting is still open.
          </p>
        </aside>
      </div>
      {edit && <JobForm job={job} close={() => setEdit(false)} />}{" "}
      {track && <ApplicationForm job={job} close={() => setTrack(false)} />}
    </>
  );
}

function ApplicationDetail() {
  const { id } = useParams();
  const result = useData<Application>("/applications/" + id),
    history = useData<History[]>("/applications/" + id + "/history");
  const { session, signIn, refresh } = useApp();
  const [edit, setEdit] = useState(false);
  if (result.loading) return <Loading />;
  if (result.error)
    return <ErrorBox message={result.error} retry={result.retry} />;
  const a = result.data!;
  return (
    <>
      <Link className="back-link" to="/applications">
        <ArrowLeft size={16} />
        Back to applications
      </Link>
      <PageHeading
        eyebrow={a.job.company}
        title={a.job.title}
        description={a.job.location || "Location not specified"}
      >
        <Badge status={a.status} />
        <button
          className="button primary"
          onClick={() => (session.authenticated ? setEdit(true) : signIn())}
        >
          Update application
          <ArrowRight size={17} />
        </button>
      </PageHeading>
      {a.status === "application_started" && <SubmissionPanel application={a} session={session} refresh={refresh}/>}
      <div className="detail-grid">
        <div>
          <section className="panel detail-panel">
            <h2>Application overview</h2>
            <div className="detail-facts">
              <div>
                <span>Date applied</span>
                <strong>{formatDate(a.applied_at)}</strong>
              </div>
              <div>
                <span>First tracked</span>
                <strong>{formatDate(a.created_at)}</strong>
              </div>
              <div>
                <span>Last updated</span>
                <strong>{formatDate(a.updated_at)}</strong>
              </div>
            </div>
            <h3>Your notes</h3>
            <p className="description">
              {a.notes ||
                "No notes yet. Add a reminder or next step when you update this application."}
            </p>
            <Link className="text-link" to={"/jobs/" + a.job_id}>
              View job description
              <ArrowUpRight size={16} />
            </Link>
          </section>
          <div className="tracking-note">
            <ShieldCheck size={20} />
            <div>
              <strong>You stay in control.</strong>
              <p>
                Statuses are recorded by you. Update them when an employer responds; employer messages do not sync automatically.
              </p>
            </div>
          </div>
        </div>
        <section className="panel detail-panel">
          <h2>Application timeline</h2>
          <p className="muted">Every step, in order.</p>
          {history.loading ? (
            <Loading />
          ) : history.error ? (
            <ErrorBox message={history.error} retry={history.retry} />
          ) : (
            <ol className="timeline">
              {history.data?.map((h) => (
                <li key={h.id}>
                  <span className="timeline-dot">
                    <Check size={12} />
                  </span>
                  <strong>
                    {h.previous_status
                      ? label(h.status)
                      : "Application tracked"}
                  </strong>
                  <p>
                    {h.previous_status
                      ? `${label(h.previous_status)} → ${label(h.status)}`
                      : `Started as ${label(h.status)}`}
                  </p>
                  <time>
                    {formatDate(h.changed_at)} ·{" "}
                    {new Date(h.changed_at + "Z").toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      {edit && (
        <ApplicationForm
          job={a.job}
          application={a}
          close={() => setEdit(false)}
        />
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/app">
      <Layout />
    </BrowserRouter>
  </React.StrictMode>,
);
