import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import TOML from "@iarna/toml";

export interface ProjectEntry {
  name: string;
  path: string;
  registered_at: number;
}
export interface Registry {
  projects: ProjectEntry[];
}

export function readRegistry(path: string): Registry {
  if (!existsSync(path)) return { projects: [] };
  const raw = readFileSync(path, "utf8");
  const parsed = TOML.parse(raw) as { projects?: ProjectEntry[] };
  return { projects: parsed.projects ?? [] };
}

export function writeRegistry(path: string, reg: Registry): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, TOML.stringify(reg as any), { mode: 0o644 });
}

export function addProject(reg: Registry, p: ProjectEntry): Registry {
  if (reg.projects.some((x) => x.name === p.name)) {
    throw new Error(`Project name ${p.name} already registered`);
  }
  return { projects: [...reg.projects, p] };
}

export function removeProject(reg: Registry, name: string): Registry {
  return { projects: reg.projects.filter((x) => x.name !== name) };
}

export function findByName(reg: Registry, name: string): ProjectEntry | undefined {
  return reg.projects.find((x) => x.name === name);
}

export function findByPath(reg: Registry, cwd: string): ProjectEntry | undefined {
  const abs = resolve(cwd);
  return reg.projects.find((p) => {
    const rel = relative(resolve(p.path), abs);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  });
}
