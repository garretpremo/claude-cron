import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import { openDb } from "@claude-cron/core";
import { listJobs, getJob } from "../../src/services/job-service";
import { seedProject, seedJobFile, seedRun } from "../fixtures/seed";

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "js-"));
  const projectPath = join(dir, "apijack");
  mkdirSync(projectPath, { recursive: true });
  const registryPath = join(dir, "projects.toml");
  const db = openDb(join(dir, "h.db"));
  seedProject(registryPath, { name: "apijack", path: projectPath });
  return { dir, projectPath, registryPath, db };
}

const YAML_JOB = `
name: review-issue
description: Review one open PR
schedule: "*/5 * * * *"
enabled: true
claude:
  prompt: "/review-issue 1"
  allowed_tools: ["Read"]
  permission_mode: auto
`;

test("listJobs returns empty for project with no jobs", () => {
  const { registryPath, db } = fresh();
  expect(listJobs(db, registryPath, "apijack")).toEqual([]);
});

test("listJobs returns loaded jobs as summaries", () => {
  const { projectPath, registryPath, db } = fresh();
  seedJobFile(projectPath, "review-issue", YAML_JOB);
  const jobs = listJobs(db, registryPath, "apijack");
  expect(jobs.length).toBe(1);
  expect(jobs[0]!.name).toBe("review-issue");
  expect(jobs[0]!.enabled).toBe(true);
  expect(jobs[0]!.last_run).toBeNull();
});

test("listJobs includes last_run + counts when runs exist", () => {
  const { projectPath, registryPath, db } = fresh();
  seedJobFile(projectPath, "review-issue", YAML_JOB);
  seedRun(db, { project: "apijack", job: "review-issue", started_at: 100 },
    { status: "success", ended_at: 200 });
  seedRun(db, { project: "apijack", job: "review-issue", started_at: 300 },
    { status: "failure", ended_at: 350 });
  const [job] = listJobs(db, registryPath, "apijack");
  expect(job!.last_run!.status).toBe("failure");
  expect(job!.recent_runs.total).toBe(2);
  expect(job!.recent_runs.successes).toBe(1);
  expect(job!.recent_runs.failures).toBe(1);
});

test("getJob returns full detail including yaml + config", () => {
  const { projectPath, registryPath, db } = fresh();
  seedJobFile(projectPath, "review-issue", YAML_JOB);
  const detail = getJob(db, registryPath, "apijack", "review-issue");
  expect(detail).not.toBeNull();
  expect(detail!.yaml).toContain("name: review-issue");
  expect(detail!.config.name).toBe("review-issue");
});

test("getJob returns null for unknown job", () => {
  const { registryPath, db } = fresh();
  expect(getJob(db, registryPath, "apijack", "nope")).toBeNull();
});
