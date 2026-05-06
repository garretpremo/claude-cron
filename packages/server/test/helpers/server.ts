import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, mkdirSync } from "node:fs";
import type { Database } from "bun:sqlite";
import { openDb } from "@claude-cron/core";
import { startServer } from "../../src";

export interface TestServer {
  url: string;
  db: Database;
  registryPath: string;
  projectsDir: string;
  close: () => void;
}

/**
 * Boots an in-process Bun.serve against a fresh tmp DB + registry. Returns
 * the base URL, the open Database, and a `close()` that shuts down the server
 * and frees its DB connection. Tmp directories are left on disk (cheap; the
 * OS reaps `/tmp` eventually) — keeping them eases post-mortem debugging.
 */
export function startTestServer(): TestServer {
  const dir = mkdtempSync(join(tmpdir(), "cc-srv-"));
  const projectsDir = join(dir, "projects");
  mkdirSync(projectsDir, { recursive: true });
  const registryPath = join(dir, "projects.toml");
  const db = openDb(join(dir, "h.db"));
  const { server, shutdown } = startServer({
    db, registryPath, port: 0, host: "127.0.0.1",
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    db,
    registryPath,
    projectsDir,
    close: shutdown,
  };
}
