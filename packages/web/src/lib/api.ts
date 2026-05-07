// Hand-rolled, typed thin wrapper around the @claude-cron/server REST contract.
// Types are erased at runtime — `import type` keeps server code from leaking
// into the client bundle. A future iteration may swap this for a generated
// client off the contract registry.
import type {
  DashboardDTO,
  ProjectDashboardDTO,
  JobStatsDTO,
  FavoritesDTO,
  RunDTO,
  RunWithEventsDTO,
  PaginatedRunsDTO,
  ProjectDTO,
  JobSummaryDTO,
  JobDetailDTO,
  Since,
} from "@claude-cron/server/contract/schemas";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  // Some POSTs (run-now) return JSON, others return a plain `{ ok: true }`.
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

async function plain(url: string, init?: RequestInit): Promise<{ ok: true }> {
  const res = await fetch(url, init);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return { ok: true };
}

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`HTTP ${status}: ${body}`);
  }
}

export const api = {
  dashboard: {
    global: (since: Since = "24h") => getJson<DashboardDTO>(`/api/dashboard?since=${since}`),
    project: (project: string, since: Since = "24h") =>
      getJson<ProjectDashboardDTO>(`/api/projects/${encodeURIComponent(project)}/dashboard?since=${since}`),
    jobStats: (project: string, job: string, since: Since = "24h") =>
      getJson<JobStatsDTO>(
        `/api/projects/${encodeURIComponent(project)}/jobs/${encodeURIComponent(job)}/stats?since=${since}`,
      ),
  },
  favorites: {
    list: () => getJson<FavoritesDTO>("/api/favorites"),
    set: (project: string) =>
      plain(`/api/favorites/${encodeURIComponent(project)}`, { method: "PUT" }),
    unset: (project: string) =>
      plain(`/api/favorites/${encodeURIComponent(project)}`, { method: "DELETE" }),
  },
  runs: {
    list: (
      params: Record<string, string | number | string[] | undefined> = {},
    ) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) {
          if (v.length > 0) q.set(k, v.join(","));
        } else if (v !== "") {
          q.set(k, String(v));
        }
      }
      const qs = q.toString();
      return getJson<PaginatedRunsDTO>(`/api/runs${qs ? `?${qs}` : ""}`);
    },
    get: (id: number) => getJson<RunWithEventsDTO>(`/api/runs/${id}`),
    /** URL for `new EventSource(api.runs.streamUrl(id))`. Goes through the vite proxy in dev. */
    streamUrl: (id: number) => `/api/runs/${id}/stream`,
    stop: (id: number) => plain(`/api/runs/${id}/stop`, { method: "POST" }),
  },
  projects: {
    list: () => getJson<ProjectDTO[]>("/api/projects"),
    get: (project: string) => getJson<ProjectDTO>(`/api/projects/${encodeURIComponent(project)}`),
    listJobs: (project: string) =>
      getJson<JobSummaryDTO[]>(`/api/projects/${encodeURIComponent(project)}/jobs`),
    getJob: (project: string, job: string) =>
      getJson<JobDetailDTO>(
        `/api/projects/${encodeURIComponent(project)}/jobs/${encodeURIComponent(job)}`,
      ),
    enableJob: (project: string, job: string) =>
      postJson<{ ok: true }>(
        `/api/projects/${encodeURIComponent(project)}/jobs/${encodeURIComponent(job)}/enable`,
      ),
    disableJob: (project: string, job: string) =>
      postJson<{ ok: true }>(
        `/api/projects/${encodeURIComponent(project)}/jobs/${encodeURIComponent(job)}/disable`,
      ),
    runJob: (project: string, job: string) =>
      postJson<{ run_id: number }>(
        `/api/projects/${encodeURIComponent(project)}/jobs/${encodeURIComponent(job)}/run`,
      ),
  },
};

export type Api = typeof api;

// Re-export the DTO types so consumers can `import type { RunDTO } from "$lib/api"`.
export type {
  DashboardDTO,
  ProjectDashboardDTO,
  JobStatsDTO,
  FavoritesDTO,
  RunDTO,
  RunWithEventsDTO,
  PaginatedRunsDTO,
  ProjectDTO,
  JobSummaryDTO,
  JobDetailDTO,
  Since,
};
