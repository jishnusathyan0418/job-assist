import { GoogleGenAI, Type } from '@google/genai';
import type {
  ChatApplicationRef,
  DiscoveredJobCandidate,
  InterviewPrepPlan,
  JobApplication,
  MatchAnalysisResult,
  ResumeProfile,
  SkillExtractionResult,
} from '../src/types.ts';
import type { RawFetchedJob } from './discovery.ts';

const MODEL_NAME = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Add a valid key in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(operation: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isTransient = msg.includes('503') || msg.includes('429') || msg.includes('UNAVAILABLE');
      if (!isTransient || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }
  throw lastError;
}

export async function extractSkillsWithGemini(rawText: string, titleHint?: string): Promise<SkillExtractionResult> {
  const ai = getGeminiClient();

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Analyze the following candidate resume and extract structured profile metadata and technical/domain skills.
Resume Title Hint: ${titleHint || 'General Engineering Resume'}

RESUME TEXT:
${rawText}`,
      config: {
        systemInstruction:
          'You are an expert technical recruiter and career parser. Extract concise, accurate skills without inventing experience that is not present in the text. Keep summary to 1-2 crisp sentences. Restrict category strictly to one of: "Languages & Frameworks", "Infrastructure & Data", "AI & ML", "Architecture & Product". Restrict proficiency strictly to one of: "Core", "Proficient", "Familiar".',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            candidateName: { type: Type.STRING },
            targetRole: { type: Type.STRING },
            experienceYears: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            extractedSkills: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  category: { type: Type.STRING },
                  proficiency: { type: Type.STRING },
                  yearsEstimated: { type: Type.NUMBER },
                },
                required: ['name', 'category', 'proficiency', 'yearsEstimated'],
              },
            },
          },
          required: ['candidateName', 'targetRole', 'experienceYears', 'summary', 'extractedSkills'],
        },
      },
    }),
  );

  return JSON.parse((response.text ?? '{}').trim()) as SkillExtractionResult;
}

export async function analyzeMatchWithGemini(params: {
  resume: ResumeProfile;
  company: string;
  roleTitle: string;
  jobDescription: string;
}): Promise<MatchAnalysisResult> {
  const ai = getGeminiClient();
  const { resume, company, roleTitle, jobDescription } = params;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Compare the candidate's resume against the target job description.

TARGET COMPANY: ${company}
TARGET ROLE: ${roleTitle}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE RESUME (${resume.title}):
Summary: ${resume.summary}
Extracted Skills: ${resume.extractedSkills.map((s) => `${s.name} (${s.proficiency})`).join(', ')}
Full Resume Text:
${resume.rawText}`,
      config: {
        systemInstruction: `You are an executive technical career strategist and strict ATS evaluator.
CRITICAL TRUTHFULNESS & NO-FABRICATION RULE:
1. NEVER insert, imply, or fabricate any missing or unverified skill inside tailoredBullets or coverNote.
2. Every bullet in tailoredBullets MUST be 100% grounded in verified experience from the candidate's resume text.
3. For every required or preferred skill in the JD that is missing or unverified on the resume, list it in missingSkills AND return an item in skillApprovals explaining briefly why human confirmation is needed before referencing it.
4. Compute matchScore (0-100) and atsBreakdown (keywordMatch, experienceAlignment, roleRelevance from 0-100). fitLabel must be "Strong Fit" (>=80), "Moderate Fit" (60-79), or "Stretch Role" (<60).`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matchScore: { type: Type.INTEGER },
            atsBreakdown: {
              type: Type.OBJECT,
              properties: {
                keywordMatch: { type: Type.INTEGER },
                experienceAlignment: { type: Type.INTEGER },
                roleRelevance: { type: Type.INTEGER },
              },
              required: ['keywordMatch', 'experienceAlignment', 'roleRelevance'],
            },
            fitLabel: { type: Type.STRING },
            matchSummary: { type: Type.STRING },
            matchedSkills: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            missingSkills: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            skillApprovals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  skill: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['skill', 'reason'],
              },
            },
            tailoredBullets: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            coverNote: { type: Type.STRING },
          },
          required: [
            'matchScore',
            'atsBreakdown',
            'fitLabel',
            'matchSummary',
            'matchedSkills',
            'missingSkills',
            'skillApprovals',
            'tailoredBullets',
            'coverNote',
          ],
        },
      },
    }),
  );

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Omit<MatchAnalysisResult, 'skillApprovals'> & {
    skillApprovals: Array<{ skill: string; reason: string }>;
  };
  const clampedScore = Math.max(0, Math.min(100, Math.round(parsed.matchScore || 0)));
  const fitLabel: MatchAnalysisResult['fitLabel'] =
    clampedScore >= 80 ? 'Strong Fit' : clampedScore >= 60 ? 'Moderate Fit' : 'Stretch Role';

  const approvals = (parsed.skillApprovals?.length ? parsed.skillApprovals : (parsed.missingSkills || []).map((s) => ({
    skill: s,
    reason: 'Listed in job posting but not verified on the selected resume.',
  }))).map((item) => ({
    skill: item.skill,
    reason: item.reason,
    decision: 'pending' as const,
  }));

  return {
    matchScore: clampedScore,
    atsBreakdown: {
      keywordMatch: Math.max(0, Math.min(100, Math.round(parsed.atsBreakdown?.keywordMatch ?? clampedScore))),
      experienceAlignment: Math.max(0, Math.min(100, Math.round(parsed.atsBreakdown?.experienceAlignment ?? clampedScore))),
      roleRelevance: Math.max(0, Math.min(100, Math.round(parsed.atsBreakdown?.roleRelevance ?? clampedScore))),
    },
    fitLabel,
    matchSummary: parsed.matchSummary,
    matchedSkills: parsed.matchedSkills || [],
    missingSkills: parsed.missingSkills || [],
    skillApprovals: approvals,
    tailoredBullets: parsed.tailoredBullets || [],
    coverNote: parsed.coverNote || '',
  };
}

export async function generateInterviewPrepWithGemini(params: {
  application: JobApplication;
  resume: ResumeProfile | null;
}): Promise<InterviewPrepPlan> {
  const ai = getGeminiClient();
  const { application, resume } = params;

  const approvedExtras = (application.skillApprovals || [])
    .filter((a) => a.decision === 'approved')
    .map((a) => a.skill);

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Generate a tailored interview preparation plan for this job application.

COMPANY: ${application.company}
ROLE: ${application.roleTitle}
MATCH SCORE: ${application.matchScore}% (${application.fitLabel})
MATCHED SKILLS: ${application.matchedSkills.join(', ')}
HUMAN-CONFIRMED ADDITIONAL SKILLS: ${approvedExtras.length ? approvedExtras.join(', ') : 'None'}
UNCONFIRMED SKILL GAPS (DO NOT FABRICATE EXPERIENCE FOR THESE): ${application.missingSkills.filter((s) => !approvedExtras.includes(s)).join(', ')}
JOB DESCRIPTION:
${application.jobDescription}

CANDIDATE CONTEXT:
${resume ? `${resume.summary}\n${resume.rawText.slice(0, 1800)}` : 'No resume attached; tailor solely to job description.'}`,
      config: {
        systemInstruction:
          'You are a principal engineering interviewer and career coach. Generate 4 high-signal interview questions mixing "Technical", "System Design", and "Behavioral" categories. Each question must include whyAsked and a concrete starOutline grounded ONLY in verified candidate experience (never invent experience for unconfirmed skill gaps). Include 4 focused technicalTopics to review and 3 sharp questionsToAsk the hiring team.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            companyResearch: { type: Type.STRING },
            technicalTopics: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  question: { type: Type.STRING },
                  whyAsked: { type: Type.STRING },
                  starOutline: { type: Type.STRING },
                },
                required: ['category', 'question', 'whyAsked', 'starOutline'],
              },
            },
            questionsToAsk: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['companyResearch', 'technicalTopics', 'questions', 'questionsToAsk'],
        },
      },
    }),
  );

  const raw = JSON.parse((response.text ?? '{}').trim()) as {
    companyResearch: string;
    technicalTopics: string[];
    questions: Array<{
      category: 'Technical' | 'System Design' | 'Behavioral';
      question: string;
      whyAsked: string;
      starOutline: string;
    }>;
    questionsToAsk: string[];
  };

  return {
    id: `prep_${application.id}_${Date.now()}`,
    applicationId: application.id,
    companyResearch: raw.companyResearch,
    technicalTopics: raw.technicalTopics || [],
    questions: (raw.questions || []).map((q, idx) => ({
      id: `q_${Date.now()}_${idx}`,
      category:
        q.category === 'System Design' || q.category === 'Behavioral' ? q.category : 'Technical',
      question: q.question,
      whyAsked: q.whyAsked,
      starOutline: q.starOutline,
      practiced: false,
    })),
    questionsToAsk: raw.questionsToAsk || [],
    generatedAt: new Date().toISOString(),
  };
}

export async function draftFollowUpWithGemini(params: {
  application: JobApplication;
  resume: ResumeProfile | null;
}): Promise<{ subject: string; body: string }> {
  const ai = getGeminiClient();
  const { application, resume } = params;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Draft a polite, concise, high-signal follow-up email for this job application.
Company: ${application.company}
Role: ${application.roleTitle}
Current Stage: ${application.status}
Applied Date: ${application.appliedAt || 'Not yet submitted'}
ATS Match Score: ${application.matchScore}%
Resume Used: ${resume?.title || 'Standard Resume'}
Verified Highlights: ${application.tailoredBullets.slice(0, 2).join(' | ')}
Candidate Name: ${resume?.candidateName || 'Candidate'}`,
      config: {
        systemInstruction:
          'Write a brief, natural 3-4 sentence follow-up email (under 110 words) referencing only verified highlights. No fluff, no buzzwords, no fabricated skills.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            body: { type: Type.STRING },
          },
          required: ['subject', 'body'],
        },
      },
    }),
  );

  return JSON.parse((response.text ?? '{}').trim()) as { subject: string; body: string };
}

export async function chatWithPipelineCopilot(params: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  applications: JobApplication[];
  resumes: ResumeProfile[];
}): Promise<{
  reply: string;
  references: ChatApplicationRef[];
  suggestedFollowUps: string[];
}> {
  const ai = getGeminiClient();
  const { message, history, applications, resumes } = params;

  const resumeMap = new Map(resumes.map((r) => [r.id, r]));

  const compactApps = applications.map((app) => {
    const res = resumeMap.get(app.resumeId);
    const pendingGaps = (app.skillApprovals || [])
      .filter((a) => a.decision === 'pending')
      .map((a) => a.skill);
    return {
      id: app.id,
      company: app.company,
      roleTitle: app.roleTitle,
      status: app.status,
      atsScore: app.matchScore,
      atsBreakdown: app.atsBreakdown,
      fitLabel: app.fitLabel,
      resumeId: app.resumeId,
      resumeTitle: res?.title || 'Unlinked Resume',
      appliedAt: app.appliedAt,
      nextFollowUp: app.nextFollowUp,
      matchedSkills: app.matchedSkills,
      missingSkills: app.missingSkills,
      pendingSkillApprovals: pendingGaps,
      notes: app.notes,
    };
  });

  const compactResumes = resumes.map((r) => ({
    id: r.id,
    title: r.title,
    targetRole: r.targetRole,
    experienceYears: r.experienceYears,
    skills: r.extractedSkills.map((s) => s.name),
  }));

  const recentHistory = history
    .slice(-6)
    .map((h) => `${h.role.toUpperCase()}: ${h.content}`)
    .join('\n');

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: `PIPELINE INDEX (${compactApps.length} applications, ${compactResumes.length} resumes):
RESUMES:
${JSON.stringify(compactResumes)}

APPLICATIONS:
${JSON.stringify(compactApps)}

RECENT CONVERSATION:
${recentHistory || 'None'}

USER QUESTION:
${message}`,
      config: {
        systemInstruction: `You are the JobPulse Pipeline Copilot helping a candidate manage dozens or hundreds of job applications effortlessly.
Rules:
1. Answer strictly using the PIPELINE INDEX provided. Never invent applications, ATS scores, or resume names.
2. When asked about an application, ALWAYS state the exact resume used (resumeTitle), ATS score (atsScore%), current stage, and any pending human skill approvals if relevant.
3. Return referencedIds containing the exact application id strings relevant to your answer (up to 6).
4. Return 2-3 helpful short suggestedFollowUps questions the user might ask next.
5. Keep reply clear, structured, scannable, and concise.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            referencedIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            suggestedFollowUps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['reply', 'referencedIds', 'suggestedFollowUps'],
        },
      },
    }),
  );

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    reply: string;
    referencedIds: string[];
    suggestedFollowUps: string[];
  };

  const appMap = new Map(applications.map((a) => [a.id, a]));
  const references: ChatApplicationRef[] = (parsed.referencedIds || [])
    .map((id) => appMap.get(id))
    .filter((a): a is JobApplication => Boolean(a))
    .slice(0, 6)
    .map((app) => ({
      id: app.id,
      company: app.company,
      roleTitle: app.roleTitle,
      status: app.status,
      matchScore: app.matchScore,
      resumeTitle: resumeMap.get(app.resumeId)?.title || 'Unlinked Resume',
    }));

  return {
    reply: parsed.reply || 'No matching records found.',
    references,
    suggestedFollowUps: parsed.suggestedFollowUps || [],
  };
}

export async function searchWebJobsWithGemini(params: {
  targetRole: string;
  skills: string[];
  location: string;
}): Promise<{
  jobs: RawFetchedJob[];
  groundingUrls: Array<{ title: string; uri: string }>;
}> {
  const ai = getGeminiClient();
  const { targetRole, skills, location } = params;

  const querySkills = skills.slice(0, 6).join(', ');
  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Find 5 real, currently open job postings from official company career pages or public job boards (Greenhouse, Lever, Ashby, RemoteOK, Remotive, WeWorkRemotely, company careers pages) matching:
Role: ${targetRole}
Key Skills: ${querySkills}
Preferred Location / Mode: ${location || 'Remote or Hybrid'}

Return ONLY a JSON array inside a \`\`\`json code block with objects containing:
- company (string)
- roleTitle (string)
- location (string)
- compensation (string, or "Not listed")
- jobUrl (exact verified URL from search results)
- summary (2-3 sentences describing responsibilities and required skills)`,
      config: {
        tools: [{ googleSearch: {} }],
      },
    }),
  );

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const groundingUrls = chunks
    .map((c) => c.web)
    .filter((w): w is { uri: string; title: string } => Boolean(w?.uri))
    .map((w) => ({
      title: w.title || w.uri,
      uri: w.uri,
    }));

  const text = response.text ?? '';
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/(\[\s*\{[\s\S]*\}\s*\])/);

  let parsedJobs: Array<{
    company?: string;
    roleTitle?: string;
    location?: string;
    compensation?: string;
    jobUrl?: string;
    summary?: string;
  }> = [];

  if (jsonMatch?.[1]) {
    try {
      const candidate = JSON.parse(jsonMatch[1].trim());
      if (Array.isArray(candidate)) {
        parsedJobs = candidate;
      }
    } catch {
      parsedJobs = [];
    }
  }

  const jobs: RawFetchedJob[] = parsedJobs
    .filter((j) => j.company && j.roleTitle && j.jobUrl)
    .slice(0, 6)
    .map((j, idx) => ({
      id: `web_${Date.now()}_${idx}`,
      source: 'Web Search',
      company: String(j.company).trim(),
      roleTitle: String(j.roleTitle).trim(),
      location: String(j.location || location || 'Remote').trim(),
      compensation: String(j.compensation || 'Not listed').trim(),
      jobUrl: String(j.jobUrl).trim(),
      publishedAt: new Date().toISOString().slice(0, 10),
      jobDescription: String(j.summary || `${j.roleTitle} at ${j.company}`).trim(),
    }));

  return { jobs, groundingUrls };
}

export async function batchEvaluateDiscoveredJobs(params: {
  resume: ResumeProfile;
  jobs: RawFetchedJob[];
  existingUrlsAndTitles: Set<string>;
}): Promise<DiscoveredJobCandidate[]> {
  const ai = getGeminiClient();
  const { resume, jobs, existingUrlsAndTitles } = params;

  if (jobs.length === 0) return [];

  const compactJobs = jobs.map((j) => ({
    id: j.id,
    company: j.company,
    roleTitle: j.roleTitle,
    location: j.location,
    description: j.jobDescription.slice(0, 1200),
  }));

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL_NAME,
      contents: `Evaluate each candidate job posting against the user's resume.

CANDIDATE RESUME (${resume.title}):
Summary: ${resume.summary}
Extracted Skills: ${resume.extractedSkills.map((s) => `${s.name} (${s.proficiency})`).join(', ')}
Resume Highlights:
${resume.rawText.slice(0, 2000)}

DISCOVERED JOBS:
${JSON.stringify(compactJobs)}`,
      config: {
        systemInstruction: `You are an executive ATS evaluator with strict truthfulness guardrails.
For EACH job in DISCOVERED JOBS (match by exact jobId):
1. Compute matchScore (0-100) and atsBreakdown (keywordMatch, experienceAlignment, roleRelevance).
2. List matchedSkills (skills present on BOTH the resume and JD) and missingSkills (required/preferred skills in the JD NOT confirmed on the resume).
3. CRITICAL NO-FABRICATION RULE: NEVER mention or claim any skill from missingSkills inside tailoredBullets or coverNote. Ground bullets strictly in verified resume text.
4. Provide 2 crisp tailoredBullets and a 2-sentence coverNote.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              jobId: { type: Type.STRING },
              matchScore: { type: Type.INTEGER },
              keywordMatch: { type: Type.INTEGER },
              experienceAlignment: { type: Type.INTEGER },
              roleRelevance: { type: Type.INTEGER },
              matchSummary: { type: Type.STRING },
              matchedSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              missingSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              tailoredBullets: { type: Type.ARRAY, items: { type: Type.STRING } },
              coverNote: { type: Type.STRING },
            },
            required: [
              'jobId',
              'matchScore',
              'keywordMatch',
              'experienceAlignment',
              'roleRelevance',
              'matchSummary',
              'matchedSkills',
              'missingSkills',
              'tailoredBullets',
              'coverNote',
            ],
          },
        },
      },
    }),
  );

  const evaluations = JSON.parse((response.text ?? '[]').trim()) as Array<{
    jobId: string;
    matchScore: number;
    keywordMatch: number;
    experienceAlignment: number;
    roleRelevance: number;
    matchSummary: string;
    matchedSkills: string[];
    missingSkills: string[];
    tailoredBullets: string[];
    coverNote: string;
  }>;

  const evalMap = new Map(evaluations.map((e) => [e.jobId, e]));

  return jobs
    .map((job) => {
      const ev = evalMap.get(job.id);
      const score = Math.max(0, Math.min(100, Math.round(ev?.matchScore ?? 55)));
      const fitLabel: DiscoveredJobCandidate['fitLabel'] =
        score >= 80 ? 'Strong Fit' : score >= 60 ? 'Moderate Fit' : 'Stretch Role';
      const missing = ev?.missingSkills || [];
      const key = `${job.company.toLowerCase()}::${job.roleTitle.toLowerCase()}`;
      const alreadyInPipeline =
        existingUrlsAndTitles.has(job.jobUrl.toLowerCase()) || existingUrlsAndTitles.has(key);

      return {
        ...job,
        matchScore: score,
        atsBreakdown: {
          keywordMatch: Math.max(0, Math.min(100, Math.round(ev?.keywordMatch ?? score))),
          experienceAlignment: Math.max(0, Math.min(100, Math.round(ev?.experienceAlignment ?? score))),
          roleRelevance: Math.max(0, Math.min(100, Math.round(ev?.roleRelevance ?? score))),
        },
        fitLabel,
        matchSummary: ev?.matchSummary || 'Evaluated against selected resume.',
        matchedSkills: ev?.matchedSkills || [],
        missingSkills: missing,
        skillApprovals: missing.map((skill) => ({
          skill,
          reason: `Listed in ${job.company} posting; not confirmed on ${resume.title}.`,
          decision: 'pending' as const,
        })),
        tailoredBullets: ev?.tailoredBullets || [],
        coverNote: ev?.coverNote || '',
        alreadyInPipeline,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}
