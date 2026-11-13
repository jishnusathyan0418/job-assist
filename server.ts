import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeDashboardMetrics,
  createApplicationRecord,
  deleteApplicationById,
  deleteResumeById,
  getDatabase,
  getPrepForApplication,
  savePrepPlan,
  updateApplicationRecord,
  updateNotificationSettings,
  upsertResume,
} from './server/db.ts';
import {
  fetchArbeitnowJobs,
  fetchHimalayasJobs,
  fetchRemotiveJobs,
  scoreKeywordRelevance,
  type RawFetchedJob,
} from './server/discovery.ts';
import {
  analyzeMatchWithGemini,
  batchEvaluateDiscoveredJobs,
  chatWithPipelineCopilot,
  draftFollowUpWithGemini,
  extractSkillsWithGemini,
  generateInterviewPrepWithGemini,
  searchWebJobsWithGemini,
} from './server/gemini.ts';
import type {
  ApplicationStatus,
  ApprovalDecision,
  DiscoveredJobCandidate,
  JobApplication,
  JobSourceName,
  NotificationSettings,
  ResumeProfile,
} from './src/types.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '2mb' }));

function formatErrorMessage(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : 'Unexpected server error';
  if (raw.includes('GEMINI_API_KEY is not configured') || raw.includes('API_KEY_INVALID') || raw.includes('400')) {
    return { status: 400, message: raw };
  }
  if (raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return { status: 403, message: 'Gemini API permission denied. Check GEMINI_API_KEY in Settings > Secrets.' };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return { status: 429, message: 'Rate limit reached on Gemini API. Please retry in a moment.' };
  }
  return { status: 500, message: raw };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: 'gemini-4-hydrogen', timestamp: new Date().toISOString() });
});

app.get('/api/dashboard', (_req, res) => {
  const db = getDatabase();
  const metrics = computeDashboardMetrics(db.applications, db.resumes);
  res.json({
    metrics,
    applications: db.applications,
    resumes: db.resumes,
    settings: db.settings,
  });
});

app.get('/api/settings', (_req, res) => {
  const db = getDatabase();
  res.json({ settings: db.settings });
});

app.patch('/api/settings', (req, res) => {
  const patch = req.body as Partial<NotificationSettings>;
  const updated = updateNotificationSettings(patch);
  res.json({ settings: updated });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body as {
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };
    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }
    const db = getDatabase();
    const result = await chatWithPipelineCopilot({
      message: message.trim(),
      history: Array.isArray(history) ? history : [],
      applications: db.applications,
      resumes: db.resumes,
    });
    res.json(result);
  } catch (err) {
    const formatted = formatErrorMessage(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.get('/api/resumes', (_req, res) => {
  const db = getDatabase();
  res.json({ resumes: db.resumes });
});

app.post('/api/resumes', (req, res) => {
  const body = req.body as Partial<ResumeProfile>;
  if (!body.title?.trim() || !body.rawText?.trim()) {
    res.status(400).json({ error: 'Resume title and rawText are required.' });
    return;
  }
  const now = new Date().toISOString();
  const existing = body.id ? getDatabase().resumes.find((r) => r.id === body.id) : undefined;
  const record: ResumeProfile = {
    id: body.id || `res_${Date.now()}`,
    title: body.title.trim(),
    candidateName: body.candidateName?.trim() || 'Candidate',
    targetRole: body.targetRole?.trim() || 'Software Engineer',
    experienceYears: Number(body.experienceYears) || 0,
    summary: body.summary?.trim() || '',
    rawText: body.rawText,
    extractedSkills: Array.isArray(body.extractedSkills) ? body.extractedSkills : [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  res.status(existing ? 200 : 201).json({ resume: upsertResume(record) });
});

app.delete('/api/resumes/:id', (req, res) => {
  const deleted = deleteResumeById(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Resume not found.' });
    return;
  }
  res.json({ deleted: true });
});

app.post('/api/resumes/extract', async (req, res) => {
  try {
    const { rawText, title } = req.body as { rawText?: string; title?: string };
    if (!rawText || rawText.trim().length < 20) {
      res.status(400).json({ error: 'Provide at least 20 characters of resume text for skill extraction.' });
      return;
    }
    const extraction = await extractSkillsWithGemini(rawText, title);
    res.json({ extraction });
  } catch (err) {
    const formatted = formatErrorMessage(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.get('/api/applications', (_req, res) => {
  const db = getDatabase();
  res.json({ applications: db.applications });
});

app.get('/api/applications/export.csv', (_req, res) => {
  const db = getDatabase();
  const resumeMap = new Map(db.resumes.map((r) => [r.id, r.title]));
  const escape = (val: string | number | null | undefined) => {
    const s = String(val ?? '').replace(/"/g, '""');
    return `"${s}"`;
  };
  const header = [
    'Company',
    'Role',
    'Stage',
    'ATS Score (%)',
    'Fit',
    'Resume Used',
    'Applied Date',
    'Next Follow-up',
    'Matched Skills',
    'Missing Skills',
    'Compensation',
    'Location',
  ].join(',');

  const rows = db.applications.map((app) =>
    [
      escape(app.company),
      escape(app.roleTitle),
      escape(app.status),
      escape(app.matchScore),
      escape(app.fitLabel),
      escape(resumeMap.get(app.resumeId) || 'Unlinked Resume'),
      escape(app.appliedAt || ''),
      escape(app.nextFollowUp || ''),
      escape(app.matchedSkills.join('; ')),
      escape(app.missingSkills.join('; ')),
      escape(app.compensation),
      escape(app.location),
    ].join(','),
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="jobpulse-applications.csv"');
  res.send([header, ...rows].join('\n'));
});

app.get('/api/applications/:id', (req, res) => {
  const db = getDatabase();
  const application = db.applications.find((a) => a.id === req.params.id);
  if (!application) {
    res.status(404).json({ error: 'Application not found.' });
    return;
  }
  const prep = getPrepForApplication(application.id);
  const resume = db.resumes.find((r) => r.id === application.resumeId) || null;
  res.json({ application, prep, resume, settings: db.settings });
});

app.post('/api/applications/match', async (req, res) => {
  try {
    const { resumeId, company, roleTitle, jobDescription } = req.body as {
      resumeId?: string;
      company?: string;
      roleTitle?: string;
      jobDescription?: string;
    };

    if (!resumeId || !company?.trim() || !roleTitle?.trim() || !jobDescription?.trim()) {
      res.status(400).json({ error: 'resumeId, company, roleTitle, and jobDescription are required.' });
      return;
    }

    const db = getDatabase();
    const resume = db.resumes.find((r) => r.id === resumeId);
    if (!resume) {
      res.status(404).json({ error: 'Selected resume profile was not found.' });
      return;
    }

    const analysis = await analyzeMatchWithGemini({
      resume,
      company: company.trim(),
      roleTitle: roleTitle.trim(),
      jobDescription: jobDescription.trim(),
    });
    res.json({ analysis });
  } catch (err) {
    const formatted = formatErrorMessage(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/applications', (req, res) => {
  const body = req.body as Partial<JobApplication>;
  if (!body.company?.trim() || !body.roleTitle?.trim() || !body.jobDescription?.trim()) {
    res.status(400).json({ error: 'company, roleTitle, and jobDescription are required.' });
    return;
  }

  const now = new Date().toISOString();
  const status: ApplicationStatus = body.status || 'Saved';
  const missingSkills = Array.isArray(body.missingSkills) ? body.missingSkills : [];
  const skillApprovals = Array.isArray(body.skillApprovals)
    ? body.skillApprovals
    : missingSkills.map((skill) => ({
        skill,
        reason: 'Flagged during match analysis; human confirmation required before referencing.',
        decision: 'pending' as const,
      }));

  const record: JobApplication = {
    id: `app_${Date.now()}`,
    company: body.company.trim(),
    roleTitle: body.roleTitle.trim(),
    location: body.location?.trim() || 'Remote',
    compensation: body.compensation?.trim() || 'Undisclosed',
    jobUrl: body.jobUrl?.trim() || '',
    jobDescription: body.jobDescription.trim(),
    resumeId: body.resumeId || '',
    status,
    matchScore: Number(body.matchScore) || 0,
    atsBreakdown: body.atsBreakdown,
    fitLabel: body.fitLabel || 'Moderate Fit',
    matchSummary: body.matchSummary?.trim() || '',
    matchedSkills: Array.isArray(body.matchedSkills) ? body.matchedSkills : [],
    missingSkills,
    skillApprovals,
    tailoredBullets: Array.isArray(body.tailoredBullets) ? body.tailoredBullets : [],
    coverNote: body.coverNote?.trim() || '',
    appliedAt: status === 'Applied' ? now.slice(0, 10) : body.appliedAt || null,
    nextFollowUp: body.nextFollowUp || null,
    notes: body.notes?.trim() || '',
    createdAt: now,
    updatedAt: now,
  };

  res.status(201).json({ application: createApplicationRecord(record) });
});

app.patch('/api/applications/:id', (req, res) => {
  const patch = req.body as Partial<JobApplication>;
  const db = getDatabase();
  const current = db.applications.find((a) => a.id === req.params.id);
  if (!current) {
    res.status(404).json({ error: 'Application not found.' });
    return;
  }

  const nextPatch: Partial<JobApplication> = { ...patch };
  if (patch.status === 'Applied' && !current.appliedAt && !patch.appliedAt) {
    nextPatch.appliedAt = new Date().toISOString().slice(0, 10);
  }

  const updated = updateApplicationRecord(req.params.id, nextPatch);
  res.json({ application: updated });
});

app.patch('/api/applications/:id/approvals', (req, res) => {
  const { skill, decision } = req.body as { skill?: string; decision?: ApprovalDecision };
  if (!skill || (decision !== 'approved' && decision !== 'declined' && decision !== 'pending')) {
    res.status(400).json({ error: 'skill and valid decision (approved, declined, pending) are required.' });
    return;
  }

  const db = getDatabase();
  const current = db.applications.find((a) => a.id === req.params.id);
  if (!current) {
    res.status(404).json({ error: 'Application not found.' });
    return;
  }

  const updatedApprovals = (current.skillApprovals || []).map((item) =>
    item.skill === skill
      ? { ...item, decision, decidedAt: new Date().toISOString() }
      : item,
  );

  const updated = updateApplicationRecord(req.params.id, { skillApprovals: updatedApprovals });
  res.json({ application: updated });
});

app.post('/api/applications/:id/followup-draft', async (req, res) => {
  try {
    const db = getDatabase();
    const application = db.applications.find((a) => a.id === req.params.id);
    if (!application) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    const resume = db.resumes.find((r) => r.id === application.resumeId) || null;
    const draft = await draftFollowUpWithGemini({ application, resume });
    res.json({ draft });
  } catch (err) {
    const formatted = formatErrorMessage(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.delete('/api/applications/:id', (req, res) => {
  const deleted = deleteApplicationById(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Application not found.' });
    return;
  }
  res.json({ deleted: true });
});

app.post('/api/applications/:id/prep', async (req, res) => {
  try {
    const db = getDatabase();
    const application = db.applications.find((a) => a.id === req.params.id);
    if (!application) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    const resume = db.resumes.find((r) => r.id === application.resumeId) || null;
    const plan = await generateInterviewPrepWithGemini({ application, resume });
    savePrepPlan(plan);
    res.json({ prep: plan });
  } catch (err) {
    const formatted = formatErrorMessage(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.patch('/api/applications/:id/prep/question', (req, res) => {
  const { questionId, practiced } = req.body as { questionId?: string; practiced?: boolean };
  const plan = getPrepForApplication(req.params.id);
  if (!plan) {
    res.status(404).json({ error: 'Interview prep plan not found.' });
    return;
  }
  const updatedPlan = {
    ...plan,
    questions: plan.questions.map((q) =>
      q.id === questionId ? { ...q, practiced: Boolean(practiced) } : q,
    ),
  };
  savePrepPlan(updatedPlan);
  res.json({ prep: updatedPlan });
});

app.post('/api/jobs/discover', async (req, res) => {
  try {
    const {
      resumeId,
      targetRole,
      location,
      skills,
      useWebSearch = true,
    } = req.body as {
      resumeId?: string;
      targetRole?: string;
      location?: string;
      skills?: string[];
      useWebSearch?: boolean;
    };

    const db = getDatabase();
    const resume = db.resumes.find((r) => r.id === resumeId) || db.resumes[0];
    if (!resume) {
      res.status(400).json({ error: 'Create a resume profile first before discovering jobs.' });
      return;
    }

    const queryRole = (targetRole || resume.targetRole || 'Software Engineer').trim();
    const querySkills =
      Array.isArray(skills) && skills.length > 0
        ? skills
        : resume.extractedSkills.map((s) => s.name);
    const queryLocation = (location || 'Remote').trim();

    const sourcesChecked: Array<{
      source: JobSourceName;
      fetchedCount: number;
      status: 'ok' | 'unavailable';
    }> = [];

    const [remotiveRes, himalayasRes, arbeitnowRes, webRes] = await Promise.allSettled([
      fetchRemotiveJobs(queryRole),
      fetchHimalayasJobs(),
      fetchArbeitnowJobs(),
      useWebSearch
        ? searchWebJobsWithGemini({
            targetRole: queryRole,
            skills: querySkills,
            location: queryLocation,
          })
        : Promise.resolve({ jobs: [] as RawFetchedJob[], groundingUrls: [] }),
    ]);

    const pool: RawFetchedJob[] = [];
    let groundingUrls: Array<{ title: string; uri: string }> = [];

    if (remotiveRes.status === 'fulfilled') {
      sourcesChecked.push({ source: 'Remotive', fetchedCount: remotiveRes.value.length, status: 'ok' });
      pool.push(...remotiveRes.value);
    } else {
      sourcesChecked.push({ source: 'Remotive', fetchedCount: 0, status: 'unavailable' });
    }

    if (himalayasRes.status === 'fulfilled') {
      sourcesChecked.push({ source: 'Himalayas', fetchedCount: himalayasRes.value.length, status: 'ok' });
      pool.push(...himalayasRes.value);
    } else {
      sourcesChecked.push({ source: 'Himalayas', fetchedCount: 0, status: 'unavailable' });
    }

    if (arbeitnowRes.status === 'fulfilled') {
      sourcesChecked.push({ source: 'Arbeitnow', fetchedCount: arbeitnowRes.value.length, status: 'ok' });
      pool.push(...arbeitnowRes.value);
    } else {
      sourcesChecked.push({ source: 'Arbeitnow', fetchedCount: 0, status: 'unavailable' });
    }

    if (useWebSearch) {
      if (webRes.status === 'fulfilled') {
        sourcesChecked.push({ source: 'Web Search', fetchedCount: webRes.value.jobs.length, status: 'ok' });
        pool.push(...webRes.value.jobs);
        groundingUrls = webRes.value.groundingUrls;
      } else {
        sourcesChecked.push({ source: 'Web Search', fetchedCount: 0, status: 'unavailable' });
      }
    }

    // Deduplicate by normalized company + roleTitle
    const seen = new Set<string>();
    const uniquePool: RawFetchedJob[] = [];
    for (const item of pool) {
      const key = `${item.company.toLowerCase().trim()}::${item.roleTitle.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePool.push(item);
      }
    }

    // Pre-rank by keyword relevance and evaluate top 8 with Gemini ATS engine
    const ranked = uniquePool
      .map((job) => ({
        job,
        relevance:
          scoreKeywordRelevance(job, queryRole, querySkills, queryLocation) +
          (job.source === 'Web Search' ? 12 : 0),
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 8)
      .map((r) => r.job);

    const existingSet = new Set<string>();
    for (const appRecord of db.applications) {
      if (appRecord.jobUrl) existingSet.add(appRecord.jobUrl.toLowerCase());
      existingSet.add(`${appRecord.company.toLowerCase()}::${appRecord.roleTitle.toLowerCase()}`);
    }

    const evaluated = await batchEvaluateDiscoveredJobs({
      resume,
      jobs: ranked,
      existingUrlsAndTitles: existingSet,
    });

    res.json({
      jobs: evaluated,
      sourcesChecked,
      groundingUrls,
    });
  } catch (err) {
    const formatted = formatErrorMessage(err);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

app.post('/api/jobs/batch-queue', (req, res) => {
  const { jobs, resumeId, status = 'Saved' } = req.body as {
    jobs?: DiscoveredJobCandidate[];
    resumeId?: string;
    status?: ApplicationStatus;
  };

  if (!Array.isArray(jobs) || jobs.length === 0) {
    res.status(400).json({ error: 'Select at least one job to add to pipeline.' });
    return;
  }

  const now = new Date().toISOString();
  const created: JobApplication[] = [];

  for (const job of jobs) {
    const record: JobApplication = {
      id: `app_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      company: job.company,
      roleTitle: job.roleTitle,
      location: job.location || 'Remote',
      compensation: job.compensation || 'Not listed',
      jobUrl: job.jobUrl,
      jobDescription: job.jobDescription,
      resumeId: resumeId || '',
      status,
      matchScore: job.matchScore,
      atsBreakdown: job.atsBreakdown,
      fitLabel: job.fitLabel,
      matchSummary: job.matchSummary,
      matchedSkills: job.matchedSkills || [],
      missingSkills: job.missingSkills || [],
      skillApprovals: job.skillApprovals || [],
      tailoredBullets: job.tailoredBullets || [],
      coverNote: job.coverNote || '',
      appliedAt: status === 'Applied' ? now.slice(0, 10) : null,
      nextFollowUp: null,
      notes: `Discovered via ${job.source} (${job.publishedAt}).`,
      createdAt: now,
      updatedAt: now,
    };
    created.push(createApplicationRecord(record));
  }

  res.status(201).json({ createdCount: created.length, applications: created });
});

app.get('/api/architecture', (_req, res) => {
  const db = getDatabase();
  res.json({
    storageEngine: 'Persistent JSON Store (data/jobpulse.json)',
    aiModel: 'gemini-4-hydrogen',
    counts: {
      resumes: db.resumes.length,
      applications: db.applications.length,
      interviewPreps: db.interviewPreps.length,
    },
    schemas: [
      {
        entity: 'ResumeProfile',
        primaryKey: 'id',
        fields: [
          'id: string',
          'title: string',
          'candidateName: string',
          'targetRole: string',
          'experienceYears: number',
          'summary: string',
          'rawText: string',
          'extractedSkills: ExtractedSkill[]',
          'createdAt / updatedAt: ISO8601',
        ],
      },
      {
        entity: 'JobApplication',
        primaryKey: 'id',
        foreignKey: 'resumeId -> ResumeProfile.id',
        fields: [
          'id: string',
          'company / roleTitle / location / compensation',
          'status: Saved | Applied | Interviewing | Offer | Archived',
          'matchScore: integer (0-100) + atsBreakdown',
          'fitLabel: Strong Fit | Moderate Fit | Stretch Role',
          'matchedSkills / missingSkills / skillApprovals: SkillApprovalItem[]',
          'tailoredBullets / coverNote / notes / appliedAt / nextFollowUp',
        ],
      },
      {
        entity: 'InterviewPrepPlan',
        primaryKey: 'id',
        foreignKey: 'applicationId -> JobApplication.id',
        fields: [
          'id: string',
          'applicationId: string',
          'companyResearch: string',
          'technicalTopics: string[]',
          'questions: PrepQuestion[] (category, question, whyAsked, starOutline, practiced)',
          'questionsToAsk: string[]',
        ],
      },
    ],
    endpoints: [
      { method: 'GET', path: '/api/dashboard', purpose: 'Aggregated KPIs, resume performance, and applications' },
      { method: 'POST', path: '/api/jobs/discover', purpose: 'Legal multi-source internet job discovery + Gemini ATS batch scoring' },
      { method: 'POST', path: '/api/jobs/batch-queue', purpose: 'Queue or mark discovered jobs into application pipeline' },
      { method: 'POST', path: '/api/chat', purpose: 'Pipeline Copilot grounded across all applications and resumes' },
      { method: 'POST', path: '/api/resumes/extract', purpose: 'Gemini structured skill extraction from resume text' },
      { method: 'POST', path: '/api/applications/match', purpose: 'Gemini ATS score, breakdown, and skill gap approval flags' },
      { method: 'PATCH', path: '/api/applications/:id/approvals', purpose: 'Record human approval/exclusion for flagged skill gaps' },
      { method: 'POST', path: '/api/applications/:id/followup-draft', purpose: 'Generate concise follow-up email draft' },
      { method: 'GET', path: '/api/applications/export.csv', purpose: 'Export full application pipeline with ATS scores & resumes' },
      { method: 'POST', path: '/api/applications/:id/prep', purpose: 'Generate tailored interview prep & STAR outlines' },
    ],
  });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JobPulse Agent Platform listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
