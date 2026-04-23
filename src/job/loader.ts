import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { JobSchema, type Job } from "./schema";

export class JobLoadError extends Error {
  constructor(public file: string, public cause: unknown) {
    super(`Failed to load ${file}: ${cause instanceof Error ? cause.message : cause}`);
  }
}

export interface LoadedJob {
  file: string;
  job: Job;
}

export interface LoadErrorEntry {
  file: string;
  message: string;
}

export interface LoadResult {
  loaded: LoadedJob[];
  errors: LoadErrorEntry[];
}

export function loadJobsFromDir(dir: string): LoadResult {
  if (!existsSync(dir)) return { loaded: [], errors: [] };

  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const loaded: LoadedJob[] = [];
  const errors: LoadErrorEntry[] = [];

  for (const f of files) {
    const path = join(dir, f);
    try {
      const raw = readFileSync(path, "utf8");
      const parsed = YAML.parse(raw);
      const job = JobSchema.parse(parsed);
      loaded.push({ file: path, job });
    } catch (e) {
      errors.push({
        file: path,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { loaded, errors };
}
