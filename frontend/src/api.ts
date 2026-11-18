export type Job = {
  id: string;
  source_kind?: string;
  last_verified_at?: string|null;
  editable?: boolean;
  match_score?: number;
  match_is_current?:boolean;
  match_details?: {internship_pay?:string|null;experience_status?:string;pay_evidence?:string[];matched_skills:string[];matched_priority_skills?:string[];missing_priority_skills?:string[];priority_skill_total?:number;priority_skill_coverage?:number|null;missing_required_skills?:string[];missing_required_alternatives?:string[][];other_mentioned_skills:string[];matching_roles:string[];explanation:string;resume_id:string;role_evidence?:{requested_role:string;job_title:string;text:string}[];classification?:"recommended"|"needs_review";required_skills?:string[];preferred_skills?:string[];missing_preferred_skills?:string[];requirement_evidence?:{kind:string;text:string}[];rank_score?:number;location_reason?:string;review_flags?:string[]};
  platform: string;
  platform_job_id: string | null;
  company: string;
  title: string;
  location: string | null;
  job_url: string;
  description_raw: string | null;
  discovered_at: string | null;
};
export type Application = {
  id: string;
  job_id: string;
  resume_version_id?:string|null;
  status: string;
  notes: string | null;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  job: Job;
};
export type History = {
  id: string;
  previous_status: string | null;
  status: string;
  changed_at: string;
};
export type Page<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};
export type Session = { authenticated: boolean; csrf_token: string | null; user?: {id:string;email:string;full_name:string}|null };
export type Stats = {
  total: number;
  jobs: number;
  by_status: Record<string, number>;
};
export const statuses = [
  "discovered",
  "matched",
  "ready_for_review",
  "application_started",
  "applied",
  "assessment",
  "interview",
  "rejected",
  "withdrawn",
  "offer",
  "manual_action_required",
  "failed",
];
export const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const formatDate = (value: string | null) =>
  value
    ? new Date(value.endsWith("Z") ? value : value + "Z").toLocaleDateString(
        undefined,
        { month: "short", day: "numeric", year: "numeric" },
      )
    : "Not applied yet";

export async function api<T>(
  path: string,
  options: RequestInit = {},
  csrf?: string | null,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      ...options,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new Error(
      "Cannot reach the server. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("jobspace:session-expired"));
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "The request could not be completed. Please try again.",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export async function downloadExport(params: URLSearchParams) {
  const response = await fetch("/api/applications/export?" + params);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Export failed. Please try again.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = "job-applications.xlsx";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const checkedTime=(value:string|null|undefined)=>value?new Date(value.endsWith("Z")?value:value+"Z").toLocaleString():"Not checked";
