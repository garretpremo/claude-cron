import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const ROOT = join(homedir(), ".claude-cron");
export const PROJECTS_TOML = join(ROOT, "projects.toml");
export const DB_PATH = join(ROOT, "history.db");
export const SECRETS_ENV = join(ROOT, "secrets.env");
export const GLOBAL_DIR = join(ROOT, "global");
export const LOCKS_DIR = join(ROOT, "locks");

export function lockPath(project: string, job: string): string {
  return join(LOCKS_DIR, `${project}--${job}.lock`);
}

export function jobsDir(projectPath: string): string {
  return resolve(projectPath, ".claude-jobs");
}
