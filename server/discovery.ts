import type { JobSourceName } from '../src/types.ts';

export interface RawFetchedJob {
  id: string;
  source: JobSourceName;
  company: string;
  roleTitle: string;
  location: string;
  compensation: string;
  jobUrl: string;
  publishedAt: string;
  jobDescription: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|li|h1|h2|h3|h4|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchWithTimeout(url: string, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'JobPulse-Career-Agent/1.0',
        Accept: 'application/json',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRemotiveJobs(query: string): Promise<RawFetchedJob[]> {
  const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=15`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Remotive HTTP ${res.status}`);
  const data = (await res.json()) as {
    jobs?: Array<{
      id: number;
      url: string;
      title: string;
      company_name: string;
      candidate_required_location?: string;
      salary?: string;
      publication_date?: string;
      description?: string;
    }>;
  };

  return (data.jobs || []).map((j) => ({
    id: `remotive_${j.id}`,
    source: 'Remotive',
    company: j.company_name || 'Unknown Company',
    roleTitle: j.title || 'Open Role',
    location: j.candidate_required_location || 'Remote',
    compensation: j.salary?.trim() || 'Not listed',
    jobUrl: j.url,
    publishedAt: (j.publication_date || '').slice(0, 10) || 'Recent',
    jobDescription: stripHtml(j.description || '').slice(0, 3500),
  }));
}

export async function fetchHimalayasJobs(): Promise<RawFetchedJob[]> {
  const url = 'https://himalayas.app/jobs/api?limit=30';
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Himalayas HTTP ${res.status}`);
  const data = (await res.json()) as {
    jobs?: Array<{
      guid?: string;
      title: string;
      companyName: string;
      locationRestrictions?: string[];
      minSalary?: number | null;
      maxSalary?: number | null;
      currency?: string | null;
      applicationLink?: string;
      pubDate?: number;
      description?: string;
      excerpt?: string;
    }>;
  };

  return (data.jobs || []).map((j, idx) => {
    const hasComp = j.minSalary || j.maxSalary;
    const comp = hasComp
      ? `${j.currency || 'USD'} ${j.minSalary ? Math.round(j.minSalary / 1000) + 'k' : ''}${
          j.minSalary && j.maxSalary ? ' – ' : ''
        }${j.maxSalary ? Math.round(j.maxSalary / 1000) + 'k' : ''}`
      : 'Not listed';

    return {
      id: `himalayas_${idx}_${Date.now()}`,
      source: 'Himalayas',
      company: j.companyName || 'Unknown Company',
      roleTitle: j.title || 'Open Role',
      location: j.locationRestrictions?.length ? j.locationRestrictions.join(', ') : 'Remote (Worldwide)',
      compensation: comp,
      jobUrl: j.applicationLink || j.guid || 'https://himalayas.app/jobs',
      publishedAt: j.pubDate ? new Date(j.pubDate * 1000).toISOString().slice(0, 10) : 'Recent',
      jobDescription: stripHtml(j.description || j.excerpt || '').slice(0, 3500),
    };
  });
}

export async function fetchArbeitnowJobs(): Promise<RawFetchedJob[]> {
  const url = 'https://www.arbeitnow.com/api/job-board-api';
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Arbeitnow HTTP ${res.status}`);
  const data = (await res.json()) as {
    data?: Array<{
      slug: string;
      company_name: string;
      title: string;
      description: string;
      remote: boolean;
      url: string;
      location: string;
      created_at?: number;
    }>;
  };

  return (data.data || []).slice(0, 40).map((j) => ({
    id: `arbeitnow_${j.slug}`,
    source: 'Arbeitnow',
    company: j.company_name || 'Unknown Company',
    roleTitle: j.title || 'Open Role',
    location: j.remote ? `Remote (${j.location || 'EU/Global'})` : j.location || 'Onsite',
    compensation: 'Not listed',
    jobUrl: j.url,
    publishedAt: j.created_at ? new Date(j.created_at * 1000).toISOString().slice(0, 10) : 'Recent',
    jobDescription: stripHtml(j.description || '').slice(0, 3500),
  }));
}

export function scoreKeywordRelevance(
  job: RawFetchedJob,
  targetRole: string,
  skills: string[],
  locationPref: string,
): number {
  const hay = `${job.roleTitle} ${job.company} ${job.location} ${job.jobDescription}`.toLowerCase();
  const titleLower = job.roleTitle.toLowerCase();

  let score = 0;
  const roleTokens = targetRole
    .toLowerCase()
    .split(/[\s,/+-]+/)
    .filter((t) => t.length >= 2);

  for (const token of roleTokens) {
    if (titleLower.includes(token)) score += 18;
    else if (hay.includes(token)) score += 6;
  }

  for (const skill of skills) {
    const clean = skill.toLowerCase().split(/[/(]/)[0].trim();
    if (clean.length >= 2 && hay.includes(clean)) {
      score += 8;
    }
  }

  if (locationPref.trim()) {
    const locTokens = locationPref
      .toLowerCase()
      .split(/[\s,/]+/)
      .filter((t) => t.length >= 3);
    for (const loc of locTokens) {
      if (job.location.toLowerCase().includes(loc)) score += 10;
    }
  }

  return score;
}
