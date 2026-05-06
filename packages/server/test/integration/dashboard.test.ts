import { expect, test, beforeEach, afterEach } from "bun:test";
import { startTestServer, type TestServer } from "../helpers/server";
import { seedProject, seedRun } from "../fixtures/seed";

let s: TestServer;

beforeEach(() => { s = startTestServer(); });
afterEach(() => { s.close(); });

test("GET /api/dashboard returns the four sections", async () => {
  const now = Date.now();
  // Seed activity within the 24h window.
  seedRun(s.db, { project: "a", job: "j1", started_at: now - 1_000 }, { status: "success" });
  seedRun(s.db, { project: "a", job: "j1", started_at: now - 2_000 }, { status: "failure" });
  seedRun(s.db, { project: "b", job: "k1", started_at: now - 3_000 }, { status: "success" });
  // Skip-only project — must not appear in top_projects.
  seedRun(s.db, { project: "c", job: "z" }, { status: "skipped_preflight" });

  const r = await fetch(`${s.url}/api/dashboard?since=24h`);
  expect(r.status).toBe(200);
  const body = await r.json() as {
    counts: Record<string, number>;
    running: unknown[];
    top_projects: Array<{ project: string }>;
    top_jobs: Array<{ project: string; job: string }>;
  };

  expect(body.counts).toBeDefined();
  expect(body.counts.success).toBe(2);
  expect(body.counts.failure).toBe(1);
  expect(body.counts.skipped_preflight).toBe(1);

  expect(Array.isArray(body.running)).toBe(true);
  expect(Array.isArray(body.top_projects)).toBe(true);
  expect(Array.isArray(body.top_jobs)).toBe(true);

  const projectNames = body.top_projects.map((p) => p.project);
  expect(projectNames).toContain("a");
  expect(projectNames).toContain("b");
  expect(projectNames).not.toContain("c"); // skip-only
});

test("GET /api/dashboard defaults since=24h", async () => {
  const r = await fetch(`${s.url}/api/dashboard`);
  expect(r.status).toBe(200);
  const body = await r.json() as { counts: { success: number } };
  expect(body.counts.success).toBe(0);
});

test("GET /api/projects/:project/dashboard scopes counts and omits top_projects", async () => {
  seedProject(s.registryPath, { name: "alpha", path: s.projectsDir });
  const now = Date.now();
  seedRun(s.db, { project: "alpha", job: "j", started_at: now - 1000 }, { status: "success" });
  seedRun(s.db, { project: "other", job: "j", started_at: now - 1000 }, { status: "success" });

  const r = await fetch(`${s.url}/api/projects/alpha/dashboard?since=24h`);
  expect(r.status).toBe(200);
  const body = await r.json() as {
    counts: { success: number };
    running: unknown[];
    top_jobs: unknown[];
    top_projects?: unknown;
  };
  expect(body.counts.success).toBe(1); // not 2 — scoped to alpha
  expect(body.top_projects).toBeUndefined();
  expect(Array.isArray(body.top_jobs)).toBe(true);
});

test("GET /api/projects/:project/dashboard 404s for unknown project", async () => {
  const r = await fetch(`${s.url}/api/projects/nope/dashboard`);
  expect(r.status).toBe(404);
});

test("GET /api/projects/:project/jobs/:job/stats returns counts/totals/last_run", async () => {
  seedProject(s.registryPath, { name: "alpha", path: s.projectsDir });
  const now = Date.now();
  seedRun(
    s.db,
    { project: "alpha", job: "build", started_at: now - 5_000 },
    { status: "success" },
  );
  seedRun(
    s.db,
    { project: "alpha", job: "build", started_at: now - 2_000 },
    { status: "failure" },
  );

  const r = await fetch(`${s.url}/api/projects/alpha/jobs/build/stats?since=24h`);
  expect(r.status).toBe(200);
  const body = await r.json() as {
    counts: Array<{ status: string; n: number }>;
    totals: { i: number; o: number; c: number };
    last_run: { status: string } | null;
  };
  const byStatus = Object.fromEntries(body.counts.map((c) => [c.status, c.n]));
  expect(byStatus.success).toBe(1);
  expect(byStatus.failure).toBe(1);
  expect(body.totals).toEqual({ i: 0, o: 0, c: 0 });
  expect(body.last_run?.status).toBe("failure"); // most recent
});
