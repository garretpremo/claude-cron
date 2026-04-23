import { expect, test, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { openDb } from "../../../src/db/connection";
import { startServer } from "../../../src/server";
import { seedProject, seedJobFile, seedRun, seedEvents } from "../fixtures/seed";

let server: ReturnType<typeof startServer>["server"];
let shutdown: () => void;
let baseUrl: string;
let projectPath: string;
let registryPath: string;
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "api-"));
  projectPath = join(dir, "apijack");
  mkdirSync(projectPath, { recursive: true });
  registryPath = join(dir, "projects.toml");
  db = openDb(join(dir, "h.db"));
  const started = startServer({ db, registryPath, port: 0, host: "127.0.0.1" });
  server = started.server;
  shutdown = started.shutdown;
  baseUrl = `http://127.0.0.1:${server.port}`;
});

afterEach(() => { shutdown(); });

test("GET /api/projects empty", async () => {
  const r = await fetch(`${baseUrl}/api/projects`);
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual([]);
});

test("GET /api/projects populated", async () => {
  seedProject(registryPath, { name: "apijack", path: projectPath });
  const r = await fetch(`${baseUrl}/api/projects`);
  const body = await r.json();
  expect(body.length).toBe(1);
  expect(body[0].name).toBe("apijack");
});

test("GET /api/projects/:name → 404 for unknown", async () => {
  const r = await fetch(`${baseUrl}/api/projects/nope`);
  expect(r.status).toBe(404);
  const body = await r.json();
  expect(body.code).toBe("NOT_FOUND");
});

test("GET /api/runs with filters", async () => {
  seedRun(db, { project: "a", job: "j", started_at: 1 }, { status: "success" });
  seedRun(db, { project: "a", job: "j", started_at: 2 }, { status: "failure" });
  seedRun(db, { project: "b", job: "j", started_at: 3 }, { status: "success" });

  const r1 = await fetch(`${baseUrl}/api/runs?project=a`);
  expect((await r1.json()).total).toBe(2);

  const r2 = await fetch(`${baseUrl}/api/runs?status=failure`);
  expect((await r2.json()).total).toBe(1);
});

test("GET /api/runs/:id returns events", async () => {
  const id = seedRun(db, { project: "p", job: "j" }, { status: "success", ended_at: 100 });
  seedEvents(db, id, [["start", { p: "p" }], ["end", { status: "success" }]]);
  const r = await fetch(`${baseUrl}/api/runs/${id}`);
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(body.events.length).toBe(2);
  expect(body.duration_ms).toBeDefined();
});

test("POST /api/runs/:id/stop rejects non-running", async () => {
  const id = seedRun(db, { project: "p", job: "j" }, { status: "success" });
  const r = await fetch(`${baseUrl}/api/runs/${id}/stop`, { method: "POST" });
  expect(r.status).toBe(409);
  expect((await r.json()).code).toBe("CANNOT_STOP_COMPLETED_RUN");
});

test("GET /api/status works", async () => {
  const r = await fetch(`${baseUrl}/api/status`);
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(typeof body.healthy).toBe("boolean");
});

test("GET / serves index.html", async () => {
  const r = await fetch(baseUrl + "/");
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toMatch(/text\/html/);
  const text = await r.text();
  expect(text).toContain("claude-cron");
});

test("GET /assets/app.css serves CSS", async () => {
  const r = await fetch(`${baseUrl}/assets/app.css`);
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toMatch(/text\/css/);
});
