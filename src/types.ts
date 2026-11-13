export type ApplicationStatus = 'Saved' | 'Applied' | 'Interviewing' | 'Offer' | 'Archived';

export type SkillCategory =
  | 'Languages & Frameworks'
  | 'Infrastructure & Data'
  | 'AI & ML'
  | 'Architecture & Product';

export type SkillProficiency = 'Core' | 'Proficient' | 'Familiar';

export interface ExtractedSkill {
  name: string;
  category: SkillCategory;
  proficiency: SkillProficiency;
  yearsEstimated: number;
}

export interface ResumeProfile {
  id: string;
  title: string;
  candidateName: string;
  targetRole: string;
  experienceYears: number;
  summary: string;
  rawText: string;
  extractedSkills: ExtractedSkill[];
  createdAt: string;
  updatedAt: string;
}

export type ApprovalDecision = 'pending' | 'approved' | 'declined';

export interface SkillApprovalItem {
  skill: string;
  reason: string;
  decision: ApprovalDecision;
  decidedAt?: string;
}

export interface AtsBreakdown {
  keywordMatch: number;
  experienceAlignment: number;
  roleRelevance: number;
}

export interface JobApplication {
  id: string;
  company: string;
  roleTitle: string;
  location: string;
  compensation: string;
  jobUrl: string;
  jobDescription: string;
  resumeId: string;
  status: ApplicationStatus;
  matchScore: number;
  atsBreakdown?: AtsBreakdown;
  fitLabel: 'Strong Fit' | 'Moderate Fit' | 'Stretch Role';
  matchSummary: string;
  matchedSkills: string[];
  missingSkills: string[];
  skillApprovals: SkillApprovalItem[];
  tailoredBullets: string[];
  coverNote: string;
  appliedAt: string | null;
  nextFollowUp: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrepQuestion {
  id: string;
  category: 'Technical' | 'System Design' | 'Behavioral';
  question: string;
  whyAsked: string;
  starOutline: string;
  practiced: boolean;
}

export interface InterviewPrepPlan {
  id: string;
  applicationId: string;
  companyResearch: string;
  technicalTopics: string[];
  questions: PrepQuestion[];
  questionsToAsk: string[];
  generatedAt: string;
}

export interface ResumePerformanceStat {
  resumeId: string;
  resumeTitle: string;
  applicationCount: number;
  avgAtsScore: number;
  interviewRate: number;
}

export interface TopSkillGap {
  skill: string;
  count: number;
}

export interface NotificationSettings {
  email: string;
  whatsappNumber: string;
  notifyOnMissingSkills: boolean;
  minAtsThreshold: number;
}

export interface DashboardMetrics {
  totalApplications: number;
  activePipeline: number;
  interviewRate: number;
  averageMatchScore: number;
  upcomingFollowUps: number;
  pendingApprovalsCount: number;
  staleApplicationsCount: number;
  statusBreakdown: Record<ApplicationStatus, number>;
  resumePerformance: ResumePerformanceStat[];
  topMissingSkills: TopSkillGap[];
}

export interface DashboardPayload {
  metrics: DashboardMetrics;
  applications: JobApplication[];
  resumes: ResumeProfile[];
  settings: NotificationSettings;
}

export interface MatchAnalysisResult {
  matchScore: number;
  atsBreakdown: AtsBreakdown;
  fitLabel: 'Strong Fit' | 'Moderate Fit' | 'Stretch Role';
  matchSummary: string;
  matchedSkills: string[];
  missingSkills: string[];
  skillApprovals: SkillApprovalItem[];
  tailoredBullets: string[];
  coverNote: string;
}

export interface SkillExtractionResult {
  candidateName: string;
  targetRole: string;
  experienceYears: number;
  summary: string;
  extractedSkills: ExtractedSkill[];
}

export interface ChatApplicationRef {
  id: string;
  company: string;
  roleTitle: string;
  status: ApplicationStatus;
  matchScore: number;
  resumeTitle: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  references?: ChatApplicationRef[];
  suggestedFollowUps?: string[];
  createdAt: string;
}

export type JobSourceName = 'Remotive' | 'Himalayas' | 'Arbeitnow' | 'Web Search';

export interface DiscoveredJobCandidate {
  id: string;
  source: JobSourceName;
  company: string;
  roleTitle: string;
  location: string;
  compensation: string;
  jobUrl: string;
  publishedAt: string;
  jobDescription: string;
  matchScore: number;
  atsBreakdown: AtsBreakdown;
  fitLabel: 'Strong Fit' | 'Moderate Fit' | 'Stretch Role';
  matchSummary: string;
  matchedSkills: string[];
  missingSkills: string[];
  skillApprovals: SkillApprovalItem[];
  tailoredBullets: string[];
  coverNote: string;
  alreadyInPipeline: boolean;
}

export interface DiscoverySearchResponse {
  jobs: DiscoveredJobCandidate[];
  sourcesChecked: Array<{
    source: JobSourceName;
    fetchedCount: number;
    status: 'ok' | 'unavailable';
  }>;
  groundingUrls: Array<{ title: string; uri: string }>;
}
