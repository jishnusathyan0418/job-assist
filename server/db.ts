import fs from 'node:fs';
import path from 'node:path';
import type {
  ApplicationStatus,
  DashboardMetrics,
  InterviewPrepPlan,
  JobApplication,
  NotificationSettings,
  ResumePerformanceStat,
  ResumeProfile,
  SkillApprovalItem,
} from '../src/types.ts';

export interface DatabaseState {
  resumes: ResumeProfile[];
  applications: JobApplication[];
  interviewPreps: InterviewPrepPlan[];
  settings: NotificationSettings;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'jobpulse.json');

const DEFAULT_SETTINGS: NotificationSettings = {
  email: 'jishnusathyanarayanan@gmail.com',
  whatsappNumber: '',
  notifyOnMissingSkills: true,
  minAtsThreshold: 75,
};

function buildApprovalsFromMissing(missingSkills: string[]): SkillApprovalItem[] {
  return (missingSkills || []).map((skill) => ({
    skill,
    reason: `Required or preferred in the job posting, but not found on the selected resume.`,
    decision: 'pending',
  }));
}

function createSeedData(): DatabaseState {
  const resumes: ResumeProfile[] = [
    {
      id: 'res_fullstack_2026',
      title: 'Senior Full-Stack & AI Platform Engineer',
      candidateName: 'Alex Mercer',
      targetRole: 'Staff / Senior Product Engineer',
      experienceYears: 7,
      summary:
        'Full-stack systems engineer specializing in TypeScript, React, distributed Node.js APIs, PostgreSQL query optimization, and production LLM orchestration.',
      rawText: `ALEX MERCER — Senior Full-Stack & AI Platform Engineer
San Francisco, CA · 7+ years building high-throughput SaaS and developer infrastructure

EXPERIENCE
Staff Software Engineer, TelemetryCloud (2023–Present)
- Architected real-time observability ingestion pipelines in TypeScript, Node.js, and PostgreSQL handling 45k events/sec with p99 latency under 110ms.
- Led frontend platform migration to React 19, Tailwind CSS, and streaming Server-Sent Events for live query diagnostics.
- Built multi-step LLM agent evaluation workflows using structured JSON schemas, reducing prompt regression defects by 42%.

Senior Software Engineer, LedgerFlow (2020–2023)
- Designed multi-tenant billing and ledger reconciliation services on AWS ECS, Redis, and Docker.
- Implemented role-based access control, audit logging, and GraphQL/REST API gateways serving 180 enterprise accounts.

SKILLS
TypeScript, JavaScript, React, Next.js, Node.js, Express, Python, PostgreSQL, Redis, GraphQL, Docker, AWS, Kubernetes, Tailwind CSS, LLM Evaluation, Structured Prompting, CI/CD, System Design`,
      extractedSkills: [
        { name: 'TypeScript', category: 'Languages & Frameworks', proficiency: 'Core', yearsEstimated: 7 },
        { name: 'React / Next.js', category: 'Languages & Frameworks', proficiency: 'Core', yearsEstimated: 6 },
        { name: 'Node.js & Express', category: 'Languages & Frameworks', proficiency: 'Core', yearsEstimated: 7 },
        { name: 'Python', category: 'Languages & Frameworks', proficiency: 'Proficient', yearsEstimated: 4 },
        { name: 'PostgreSQL', category: 'Infrastructure & Data', proficiency: 'Core', yearsEstimated: 6 },
        { name: 'Redis & Caching', category: 'Infrastructure & Data', proficiency: 'Proficient', yearsEstimated: 5 },
        { name: 'AWS & Docker', category: 'Infrastructure & Data', proficiency: 'Proficient', yearsEstimated: 5 },
        { name: 'LLM Agent Workflows', category: 'AI & ML', proficiency: 'Core', yearsEstimated: 3 },
        { name: 'Structured JSON Prompting', category: 'AI & ML', proficiency: 'Core', yearsEstimated: 3 },
        { name: 'System Design & RBAC', category: 'Architecture & Product', proficiency: 'Core', yearsEstimated: 6 },
      ],
      createdAt: '2026-10-12T09:00:00.000Z',
      updatedAt: '2026-11-08T14:20:00.000Z',
    },
    {
      id: 'res_frontend_arch',
      title: 'Principal Frontend & Design Systems',
      candidateName: 'Alex Mercer',
      targetRole: 'Lead Frontend Architect',
      experienceYears: 7,
      summary:
        'Design-minded frontend architect focused on high-density SaaS dashboards, WCAG AA accessibility, TypeScript state machines, and zero-jank data visualization.',
      rawText: `ALEX MERCER — Principal Frontend & Design Systems
EXPERIENCE
Led component library governance, React performance profiling, virtualized tables for 100k+ rows, and end-to-end Playwright test harnesses.`,
      extractedSkills: [
        { name: 'TypeScript', category: 'Languages & Frameworks', proficiency: 'Core', yearsEstimated: 7 },
        { name: 'React 19', category: 'Languages & Frameworks', proficiency: 'Core', yearsEstimated: 6 },
        { name: 'Tailwind CSS', category: 'Languages & Frameworks', proficiency: 'Core', yearsEstimated: 4 },
        { name: 'Accessibility (WCAG AA)', category: 'Architecture & Product', proficiency: 'Core', yearsEstimated: 5 },
        { name: 'Performance Profiling', category: 'Architecture & Product', proficiency: 'Proficient', yearsEstimated: 5 },
      ],
      createdAt: '2026-10-20T11:30:00.000Z',
      updatedAt: '2026-11-01T16:10:00.000Z',
    },
  ];

  const applications: JobApplication[] = [
    {
      id: 'app_linear_infra',
      company: 'Vektor Labs',
      roleTitle: 'Senior Product Engineer, AI Workflows',
      location: 'San Francisco / Hybrid',
      compensation: '$210k – $245k + equity',
      jobUrl: 'https://jobs.example.com/vektor-labs/ai-workflows',
      jobDescription:
        'Build low-latency agent orchestration interfaces, streaming telemetry views, TypeScript APIs, and PostgreSQL-backed workflow persistence for enterprise engineering teams.',
      resumeId: 'res_fullstack_2026',
      status: 'Interviewing',
      matchScore: 93,
      atsBreakdown: { keywordMatch: 95, experienceAlignment: 92, roleRelevance: 92 },
      fitLabel: 'Strong Fit',
      matchSummary:
        'Direct alignment across TypeScript, React streaming UIs, PostgreSQL telemetry pipelines, and structured LLM agent evaluation.',
      matchedSkills: ['TypeScript', 'React / Next.js', 'PostgreSQL', 'LLM Agent Workflows', 'SSE Streaming'],
      missingSkills: ['Temporal Workflow Engine'],
      skillApprovals: [
        {
          skill: 'Temporal Workflow Engine',
          reason: 'Mentioned in durable orchestration requirements; not present on Senior Full-Stack resume.',
          decision: 'pending',
        },
      ],
      tailoredBullets: [
        'Architected TypeScript and PostgreSQL event ingestion processing 45k events/sec at sub-110ms p99 latency.',
        'Shipped streaming SSE diagnostics in React 19 paired with deterministic JSON schema LLM evaluations.',
        'Reduced prompt regression defects by 42% through automated multi-step agent test suites.',
      ],
      coverNote:
        'My background building sub-110ms observability pipelines and structured LLM evaluation harnesses maps directly to Vektor Labs’ agent workflow roadmap.',
      appliedAt: '2026-11-02',
      nextFollowUp: '2026-11-15',
      notes: 'System design round scheduled with platform lead. Focus on idempotent workflow retries and SSE backpressure.',
      createdAt: '2026-11-02T10:15:00.000Z',
      updatedAt: '2026-11-11T17:40:00.000Z',
    },
    {
      id: 'app_meridian_data',
      company: 'Meridian Data',
      roleTitle: 'Staff Full-Stack Engineer',
      location: 'Remote (US)',
      compensation: '$225k – $260k',
      jobUrl: 'https://jobs.example.com/meridian/staff-fullstack',
      jobDescription:
        'Own end-to-end architecture for high-density analytics workspaces, SQL query builders, multi-tenant RBAC, and Redis caching tiers.',
      resumeId: 'res_fullstack_2026',
      status: 'Offer',
      matchScore: 91,
      atsBreakdown: { keywordMatch: 92, experienceAlignment: 90, roleRelevance: 91 },
      fitLabel: 'Strong Fit',
      matchSummary:
        'Strong match on multi-tenant RBAC, Redis caching, PostgreSQL tuning, and enterprise React workspace architecture.',
      matchedSkills: ['TypeScript', 'PostgreSQL', 'Redis & Caching', 'System Design & RBAC', 'React / Next.js'],
      missingSkills: ['ClickHouse'],
      skillApprovals: [
        {
          skill: 'ClickHouse',
          reason: 'Listed as preferred OLAP store; candidate has PostgreSQL/Redis but not ClickHouse.',
          decision: 'declined',
          decidedAt: '2026-10-19T09:00:00.000Z',
        },
      ],
      tailoredBullets: [
        'Delivered multi-tenant RBAC and API gateways supporting 180 enterprise organizations with zero cross-tenant leakage.',
        'Optimized PostgreSQL and Redis caching layers to sustain high-concurrency SaaS analytics queries.',
      ],
      coverNote:
        'Having scaled multi-tenant SaaS workspaces and PostgreSQL/Redis data tiers for 180+ enterprise teams, I can accelerate Meridian’s enterprise analytics roadmap.',
      appliedAt: '2026-10-19',
      nextFollowUp: '2026-11-16',
      notes: 'Written offer received. Comparing equity vesting schedule and signing bonus before Monday response.',
      createdAt: '2026-10-19T08:45:00.000Z',
      updatedAt: '2026-11-12T15:05:00.000Z',
    },
    {
      id: 'app_northstar_cloud',
      company: 'Northstar Cloud',
      roleTitle: 'Lead Frontend Architect',
      location: 'New York / Hybrid',
      compensation: '$205k – $235k',
      jobUrl: 'https://jobs.example.com/northstar/frontend-architect',
      jobDescription:
        'Lead design systems, WCAG AA compliance, complex data grids, and developer console ergonomics across 6 product squads.',
      resumeId: 'res_frontend_arch',
      status: 'Interviewing',
      matchScore: 88,
      atsBreakdown: { keywordMatch: 90, experienceAlignment: 86, roleRelevance: 88 },
      fitLabel: 'Strong Fit',
      matchSummary:
        'High overlap in React 19, Tailwind CSS design systems, WCAG AA accessibility, and performance profiling.',
      matchedSkills: ['TypeScript', 'React 19', 'Tailwind CSS', 'Accessibility (WCAG AA)', 'Performance Profiling'],
      missingSkills: ['WebAssembly Data Grid'],
      skillApprovals: [
        {
          skill: 'WebAssembly Data Grid',
          reason: 'Bonus requirement in JD; omitted from resume bullets pending human review.',
          decision: 'pending',
        },
      ],
      tailoredBullets: [
        'Governed multi-squad React and Tailwind CSS component libraries with strict WCAG AA keyboard and contrast compliance.',
        'Built virtualized high-density tables handling 100k+ live rows without main-thread frame drops.',
      ],
      coverNote:
        'I specialize in translating dense developer telemetry into fast, accessible React workspaces across multi-squad organizations.',
      appliedAt: '2026-11-04',
      nextFollowUp: '2026-11-14',
      notes: 'Final architecture walkthrough tomorrow morning; prepare case study on token architecture and table virtualization.',
      createdAt: '2026-11-04T13:20:00.000Z',
      updatedAt: '2026-11-12T09:10:00.000Z',
    },
    {
      id: 'app_kestrel_ai',
      company: 'Kestrel AI',
      roleTitle: 'Applied AI Engineer',
      location: 'San Francisco',
      compensation: '$195k – $230k',
      jobUrl: 'https://jobs.example.com/kestrel/applied-ai',
      jobDescription:
        'Design retrieval pipelines, structured JSON extraction agents, Python microservices, and evaluation benchmarks for legal document review.',
      resumeId: 'res_fullstack_2026',
      status: 'Applied',
      matchScore: 79,
      atsBreakdown: { keywordMatch: 81, experienceAlignment: 78, roleRelevance: 78 },
      fitLabel: 'Moderate Fit',
      matchSummary:
        'Solid LLM workflow and structured extraction foundation; Python backend depth and vector index tuning are growth areas.',
      matchedSkills: ['LLM Agent Workflows', 'Structured JSON Prompting', 'Python', 'TypeScript'],
      missingSkills: ['PyTorch Fine-Tuning', 'pgvector HNSW Tuning'],
      skillApprovals: [
        {
          skill: 'PyTorch Fine-Tuning',
          reason: 'Listed in JD requirements; not evidenced on resume.',
          decision: 'pending',
        },
        {
          skill: 'pgvector HNSW Tuning',
          reason: 'PostgreSQL listed, but vector index tuning is not explicitly confirmed.',
          decision: 'pending',
        },
      ],
      tailoredBullets: [
        'Designed deterministic structured-JSON extraction pipelines reducing model regression defects by 42%.',
        'Built full-stack evaluation harnesses enabling rapid prompt and schema iteration across product teams.',
      ],
      coverNote:
        'My practical experience shipping reliable structured-output LLM workflows and eval harnesses translates cleanly to Kestrel’s legal review agents.',
      appliedAt: '2026-11-01',
      nextFollowUp: '2026-11-12',
      notes: 'Submitted via direct referral from Priya S. Follow up if recruiter screen is not scheduled within 7 business days.',
      createdAt: '2026-11-01T16:00:00.000Z',
      updatedAt: '2026-11-01T16:00:00.000Z',
    },
    {
      id: 'app_covalent_pay',
      company: 'Covalent Pay',
      roleTitle: 'Senior Backend Engineer, Ledger',
      location: 'Seattle / Remote',
      compensation: '$190k – $220k',
      jobUrl: 'https://jobs.example.com/covalent/ledger-backend',
      jobDescription:
        'Maintain double-entry financial ledgers in Go and PostgreSQL with strict idempotency, distributed locking, and high-availability guarantees.',
      resumeId: 'res_fullstack_2026',
      status: 'Saved',
      matchScore: 72,
      atsBreakdown: { keywordMatch: 68, experienceAlignment: 76, roleRelevance: 72 },
      fitLabel: 'Moderate Fit',
      matchSummary:
        'Strong ledger reconciliation and PostgreSQL experience from LedgerFlow; role prefers production Go over Node.js/TypeScript.',
      matchedSkills: ['PostgreSQL', 'Redis & Caching', 'System Design & RBAC', 'AWS & Docker'],
      missingSkills: ['Go (Golang)', 'Kafka Streams'],
      skillApprovals: [
        {
          skill: 'Go (Golang)',
          reason: 'Primary backend language in JD; candidate resume shows TypeScript/Node.js and Python.',
          decision: 'pending',
        },
        {
          skill: 'Kafka Streams',
          reason: 'Event streaming requirement not found on resume.',
          decision: 'pending',
        },
      ],
      tailoredBullets: [
        'Built multi-tenant billing and ledger reconciliation services for 180 enterprise customers with strict audit trails.',
      ],
      coverNote:
        'While my recent production services run on TypeScript and Node.js, my domain depth in double-entry ledger reconciliation and PostgreSQL locking carries over directly.',
      appliedAt: null,
      nextFollowUp: '2026-11-17',
      notes: 'Reviewing whether to tailor resume toward distributed systems and Go side project before submitting.',
      createdAt: '2026-11-10T11:25:00.000Z',
      updatedAt: '2026-11-10T11:25:00.000Z',
    },
    {
      id: 'app_stratum_sec',
      company: 'Stratum Security',
      roleTitle: 'Principal Platform Engineer',
      location: 'Remote',
      compensation: '$215k – $250k',
      jobUrl: 'https://jobs.example.com/stratum/principal-platform',
      jobDescription:
        'Lead Kubernetes multi-region control plane, Rust telemetry collectors, and zero-trust service mesh automation.',
      resumeId: 'res_fullstack_2026',
      status: 'Archived',
      matchScore: 61,
      atsBreakdown: { keywordMatch: 55, experienceAlignment: 68, roleRelevance: 60 },
      fitLabel: 'Stretch Role',
      matchSummary:
        'Good Kubernetes and telemetry background, but heavy Rust kernel/eBPF and service-mesh ownership falls outside core stack.',
      matchedSkills: ['Kubernetes', 'AWS & Docker', 'System Design & RBAC'],
      missingSkills: ['Rust', 'eBPF', 'Envoy Service Mesh'],
      skillApprovals: [
        { skill: 'Rust', reason: 'Required systems language not on resume.', decision: 'declined' },
        { skill: 'eBPF', reason: 'Kernel telemetry requirement not on resume.', decision: 'declined' },
      ],
      tailoredBullets: [
        'Operated high-volume telemetry ingestion pipelines across containerized AWS environments.',
      ],
      coverNote: '',
      appliedAt: '2026-10-14',
      nextFollowUp: null,
      notes: 'Closed out after mutual stack mismatch on Rust/eBPF systems programming.',
      createdAt: '2026-10-14T14:00:00.000Z',
      updatedAt: '2026-10-28T18:30:00.000Z',
    },
  ];

  const interviewPreps: InterviewPrepPlan[] = [
    {
      id: 'prep_linear_infra',
      applicationId: 'app_linear_infra',
      companyResearch:
        'Vektor Labs builds developer-facing AI agent orchestration workflows where deterministic observability, resumable execution traces, and low-latency streaming UIs differentiate them from generic wrappers.',
      technicalTopics: [
        'Server-Sent Events (SSE) connection lifecycle, heartbeats, and client reconnection',
        'Idempotent agent step persistence in PostgreSQL with optimistic concurrency',
        'Structured JSON schema validation and fallback recovery for LLM outputs',
        'Backpressure handling between Node.js worker queues and React state',
      ],
      questions: [
        {
          id: 'q_vektor_1',
          category: 'System Design',
          question:
            'Design a resumable streaming execution log for a multi-step AI agent where clients may disconnect mid-run and reconnect on another device.',
          whyAsked: 'Directly tests your TelemetryCloud streaming diagnostics and PostgreSQL event ingestion experience.',
          starOutline:
            'Situation: Enterprise users need live step visibility without losing trace history on refresh. Task: Guarantee ordered, gap-free event delivery. Action: Persist monotonic sequence IDs per run in PostgreSQL, stream deltas via SSE with Last-Event-ID replay cursor. Result: Zero missed frames and sub-110ms resume latency.',
          practiced: true,
        },
        {
          id: 'q_vektor_2',
          category: 'Technical',
          question:
            'How do you prevent silent schema drift or hallucinated fields when chaining structured-output LLM calls in production?',
          whyAsked: 'Probes your 42% prompt regression reduction claim and structured JSON prompting rigor.',
          starOutline:
            'Define strict response schemas, validate at runtime with Zod/JSON Schema, log failure modes into golden eval datasets, and run CI regression gates before prompt updates ship.',
          practiced: false,
        },
        {
          id: 'q_vektor_3',
          category: 'Behavioral',
          question:
            'Tell me about a time you had to push back on product scope to protect system latency or reliability.',
          whyAsked: 'Evaluates staff-level product engineering judgment and cross-functional communication.',
          starOutline:
            'Situation: Requested synchronous multi-join analytics inside the ingestion path. Task: Keep p99 under 110ms. Action: Proposed pre-aggregated async rollups with progressive UI loading. Result: Met feature launch date while keeping p99 at 98ms.',
          practiced: false,
        },
      ],
      questionsToAsk: [
        'How does the team currently measure and gate prompt or tool-schema regressions before deploying agent updates?',
        'Where are the largest latency bottlenecks today between LLM token streaming and frontend state reconciliation?',
        'What does success in the first 90 days look like for this role on the workflow runtime squad?',
      ],
      generatedAt: '2026-11-11T17:45:00.000Z',
    },
  ];

  return {
    resumes,
    applications,
    interviewPreps,
    settings: { ...DEFAULT_SETTINGS },
  };
}

function normalizeStore(rawState: Partial<DatabaseState>): DatabaseState {
  const seed = createSeedData();
  const resumes = Array.isArray(rawState.resumes) ? rawState.resumes : seed.resumes;
  const applications = (Array.isArray(rawState.applications) ? rawState.applications : seed.applications).map(
    (app) => ({
      ...app,
      skillApprovals: Array.isArray(app.skillApprovals)
        ? app.skillApprovals
        : buildApprovalsFromMissing(app.missingSkills || []),
      atsBreakdown: app.atsBreakdown || {
        keywordMatch: app.matchScore,
        experienceAlignment: app.matchScore,
        roleRelevance: app.matchScore,
      },
    }),
  );
  const interviewPreps = Array.isArray(rawState.interviewPreps)
    ? rawState.interviewPreps
    : seed.interviewPreps;
  const settings: NotificationSettings = {
    ...DEFAULT_SETTINGS,
    ...(rawState.settings || {}),
  };
  return { resumes, applications, interviewPreps, settings };
}

function ensureStore(): DatabaseState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = createSeedData();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  return normalizeStore(JSON.parse(raw) as Partial<DatabaseState>);
}

function saveStore(state: DatabaseState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
}

export function getDatabase(): DatabaseState {
  return ensureStore();
}

export function updateNotificationSettings(patch: Partial<NotificationSettings>): NotificationSettings {
  const db = ensureStore();
  db.settings = {
    ...db.settings,
    ...patch,
  };
  saveStore(db);
  return db.settings;
}

export function computeDashboardMetrics(
  applications: JobApplication[],
  resumes: ResumeProfile[] = [],
): DashboardMetrics {
  const statusBreakdown: Record<ApplicationStatus, number> = {
    Saved: 0,
    Applied: 0,
    Interviewing: 0,
    Offer: 0,
    Archived: 0,
  };

  let scoreSum = 0;
  let scoreCount = 0;
  let upcomingFollowUps = 0;
  let pendingApprovalsCount = 0;
  let staleApplicationsCount = 0;

  const missingCounter = new Map<string, number>();
  const todayIso = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const app of applications) {
    statusBreakdown[app.status] = (statusBreakdown[app.status] || 0) + 1;
    if (app.matchScore > 0) {
      scoreSum += app.matchScore;
      scoreCount += 1;
    }
    if (app.nextFollowUp && app.status !== 'Archived') {
      upcomingFollowUps += 1;
    }
    if (app.status !== 'Archived') {
      pendingApprovalsCount += (app.skillApprovals || []).filter((a) => a.decision === 'pending').length;
    }

    const updatedMs = new Date(app.updatedAt).getTime();
    const isOverdueFollowUp = Boolean(app.nextFollowUp && app.nextFollowUp < todayIso && app.status !== 'Archived');
    if (app.status === 'Applied' && (updatedMs < sevenDaysAgo || isOverdueFollowUp)) {
      staleApplicationsCount += 1;
    }

    for (const skill of app.missingSkills || []) {
      const normalized = skill.trim();
      if (normalized) {
        missingCounter.set(normalized, (missingCounter.get(normalized) || 0) + 1);
      }
    }
  }

  const submittedCount =
    statusBreakdown.Applied + statusBreakdown.Interviewing + statusBreakdown.Offer + statusBreakdown.Archived;
  const progressedCount = statusBreakdown.Interviewing + statusBreakdown.Offer;

  const resumePerformance: ResumePerformanceStat[] = resumes.map((res) => {
    const appsForResume = applications.filter((a) => a.resumeId === res.id);
    const avgAtsScore =
      appsForResume.length > 0
        ? Math.round(appsForResume.reduce((acc, a) => acc + (a.matchScore || 0), 0) / appsForResume.length)
        : 0;
    const submittedForResume = appsForResume.filter((a) => a.status !== 'Saved');
    const progressedForResume = appsForResume.filter(
      (a) => a.status === 'Interviewing' || a.status === 'Offer',
    );
    const interviewRate =
      submittedForResume.length > 0
        ? Math.round((progressedForResume.length / submittedForResume.length) * 100)
        : 0;
    return {
      resumeId: res.id,
      resumeTitle: res.title,
      applicationCount: appsForResume.length,
      avgAtsScore,
      interviewRate,
    };
  });

  const topMissingSkills = Array.from(missingCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([skill, count]) => ({ skill, count }));

  return {
    totalApplications: applications.length,
    activePipeline: statusBreakdown.Saved + statusBreakdown.Applied + statusBreakdown.Interviewing + statusBreakdown.Offer,
    interviewRate: submittedCount > 0 ? Math.round((progressedCount / submittedCount) * 100) : 0,
    averageMatchScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
    upcomingFollowUps,
    pendingApprovalsCount,
    staleApplicationsCount,
    statusBreakdown,
    resumePerformance,
    topMissingSkills,
  };
}

export function upsertResume(resume: ResumeProfile): ResumeProfile {
  const db = ensureStore();
  const idx = db.resumes.findIndex((r) => r.id === resume.id);
  if (idx >= 0) {
    db.resumes[idx] = resume;
  } else {
    db.resumes.unshift(resume);
  }
  saveStore(db);
  return resume;
}

export function deleteResumeById(id: string): boolean {
  const db = ensureStore();
  const prevLen = db.resumes.length;
  db.resumes = db.resumes.filter((r) => r.id !== id);
  if (db.resumes.length === prevLen) return false;
  saveStore(db);
  return true;
}

export function createApplicationRecord(app: JobApplication): JobApplication {
  const db = ensureStore();
  db.applications.unshift(app);
  saveStore(db);
  return app;
}

export function updateApplicationRecord(id: string, patch: Partial<JobApplication>): JobApplication | null {
  const db = ensureStore();
  const idx = db.applications.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  const updated: JobApplication = {
    ...db.applications[idx],
    ...patch,
    id: db.applications[idx].id,
    updatedAt: new Date().toISOString(),
  };
  db.applications[idx] = updated;
  saveStore(db);
  return updated;
}

export function deleteApplicationById(id: string): boolean {
  const db = ensureStore();
  const prevLen = db.applications.length;
  db.applications = db.applications.filter((a) => a.id !== id);
  db.interviewPreps = db.interviewPreps.filter((p) => p.applicationId !== id);
  if (db.applications.length === prevLen) return false;
  saveStore(db);
  return true;
}

export function getPrepForApplication(applicationId: string): InterviewPrepPlan | null {
  const db = ensureStore();
  return db.interviewPreps.find((p) => p.applicationId === applicationId) ?? null;
}

export function savePrepPlan(plan: InterviewPrepPlan): InterviewPrepPlan {
  const db = ensureStore();
  const idx = db.interviewPreps.findIndex((p) => p.applicationId === plan.applicationId);
  if (idx >= 0) {
    db.interviewPreps[idx] = plan;
  } else {
    db.interviewPreps.unshift(plan);
  }
  saveStore(db);
  return plan;
}
