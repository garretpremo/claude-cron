import { expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { openDb } from "@claude-cron/core";
import {
  listProjects, getProject,
} from "../../src/services/project-service";
import { seedProject, seedRun } from "../fixtures/seed";

function fresh() {
  const dir = mkdtempSync(join(tmpdir(), "ps-"));
  const registryPath = join(dir, "projects.toml");
  const db = openDb(join(dir, "h.db"));
  return { dir, registryPath, db };
}

test("listProjects empty", () => {
  const { registryPath, db } = fresh();
  expect(listProjects(db, registryPath)).toEqual([]);
});

test("listProjects returns registered projects with counts", () => {
  const { dir, registryPath, db } = fresh();
  seedProject(registryPath, { name: "apijack", path: join(dir, "apijack") });
  seedRun(db, { project: "apijack", job: "review-issue", started_at: 100 },
    { status: "success", ended_at: 200, cost_usd: 0.05 });
  const list = listProjects(db, registryPath);
  expect(list.length).toBe(1);
  expect(list[0]!.name).toBe("apijack");
  expect(list[0]!.last_run_at).toBe(100);
});

test("getProject by name", () => {
  const { dir, registryPath, db } = fresh();
  seedProject(registryPath, { name: "apijack", path: join(dir, "apijack") });
  const p = getProject(db, registryPath, "apijack");
  expect(p?.name).toBe("apijack");
  expect(getProject(db, registryPath, "nope")).toBeNull();
});
