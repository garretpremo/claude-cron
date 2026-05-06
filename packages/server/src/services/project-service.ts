import type { Database } from "bun:sqlite";
import { existsSync, readdirSync } from "node:fs";
import { readRegistry, type ProjectEntry } from "@claude-cron/core";
import { jobsDir } from "@claude-cron/core";
import type { ProjectDTO } from "../dto";

function projectToDTO(db: Database, p: ProjectEntry): ProjectDTO {
  const dir = jobsDir(p.path);
  let job_count = 0;
  if (existsSync(dir)) {
    job_count = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml")).length;
  }
  const row = db
    .query("SELECT MAX(started_at) as m FROM runs WHERE project=?")
    .get(p.name) as { m: number | null };
  return {
    name: p.name,
    path: p.path,
    registered_at: p.registered_at,
    job_count,
    last_run_at: row.m ?? null,
  };
}

export function listProjects(db: Database, registryPath: string): ProjectDTO[] {
  const reg = readRegistry(registryPath);
  return reg.projects.map((p) => projectToDTO(db, p));
}

export function getProject(
  db: Database, registryPath: string, name: string
): ProjectDTO | null {
  const reg = readRegistry(registryPath);
  const p = reg.projects.find((x) => x.name === name);
  return p ? projectToDTO(db, p) : null;
}
