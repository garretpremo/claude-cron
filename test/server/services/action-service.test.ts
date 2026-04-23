import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { openDb } from "../../../src/db/connection";
import {
  enableJob, disableJob, stopRun,
} from "../../../src/server/services/action-service";
import { HttpError } from "../../../src/server/http/errors";
import { seedProject, seedJobFile, seedRun } from "../fixtures/seed";

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "as-"));
  const projectPath = join(dir, "apijack");
  mkdirSync(projectPath, { recursive: true });
  const registryPath = join(dir, "projects.toml");
  const db = openDb(join(dir, "h.db"));
  seedProject(registryPath, { name: "apijack", path: projectPath });
  return { dir, projectPath, registryPath, db };
}

const JOB_WITH_COMMENT = `name: j
schedule: "*/5 * * * *"
enabled: false  # flip when ready
claude:
  prompt: "hi"
  allowed_tools: []
  permission_mode: auto
`;

test("enableJob flips enabled, preserves comment and whitespace", async () => {
  const { projectPath, registryPath, db } = fresh();
  seedJobFile(projectPath, "j", JOB_WITH_COMMENT);

  const syncSpy = { calls: 0 };
  const result = await enableJob(db, registryPath, "apijack", "j", async () => {
    syncSpy.calls++;
  });

  const content = readFileSync(join(projectPath, ".claude-jobs/j.yaml"), "utf8");
  expect(content).toContain("enabled: true  # flip when ready");
  expect(result.enabled).toBe(true);
  expect(syncSpy.calls).toBe(1);
});

test("disableJob flips enabled", async () => {
  const { projectPath, registryPath, db } = fresh();
  seedJobFile(projectPath, "j", JOB_WITH_COMMENT.replace("false", "true"));
  await disableJob(db, registryPath, "apijack", "j", async () => {});
  const content = readFileSync(join(projectPath, ".claude-jobs/j.yaml"), "utf8");
  expect(content).toContain("enabled: false");
});

test("enableJob is idempotent when already enabled (skips write, still syncs)", async () => {
  const { projectPath, registryPath, db } = fresh();
  seedJobFile(projectPath, "j", JOB_WITH_COMMENT.replace("false", "true"));
  const before = readFileSync(join(projectPath, ".claude-jobs/j.yaml"), "utf8");
  let synced = 0;
  await enableJob(db, registryPath, "apijack", "j", async () => { synced++; });
  const after = readFileSync(join(projectPath, ".claude-jobs/j.yaml"), "utf8");
  expect(after).toBe(before);
  expect(synced).toBe(1);
});

test("enableJob throws NOT_FOUND for unknown project or job", async () => {
  const { registryPath, db } = fresh();
  await expect(
    enableJob(db, registryPath, "nope", "j", async () => {})
  ).rejects.toThrow(HttpError);
});

test("stopRun rejects non-running runs", () => {
  const { db } = fresh();
  const id = seedRun(db, { project: "p", job: "j" }, { status: "success" });
  expect(() => stopRun(db, id)).toThrow(/CANNOT_STOP_COMPLETED_RUN/);
});

test("stopRun rejects running runs without pid", () => {
  const { db } = fresh();
  const id = seedRun(db, { project: "p", job: "j" }, { status: "running" });
  expect(() => stopRun(db, id)).toThrow(/NO_PID_YET/);
});

test("stopRun sends SIGTERM to pid and returns DTO", () => {
  const { db } = fresh();
  const killed: Array<[number, string]> = [];
  const kill = (pid: number, signal: string | number) => {
    killed.push([pid, String(signal)]);
    return true;
  };
  const id = seedRun(db, { project: "p", job: "j" }, { status: "running", pid: 12345 });
  const dto = stopRun(db, id, { killFn: kill as any });
  expect(killed).toEqual([[12345, "SIGTERM"]]);
  expect(dto.pid).toBe(12345);
});
