// Direct DB seeding helper for e2e tests that want to drive the real
// dashboard API. Boot `claude-cron serve` separately against the seeded
// database; the playwright config wires the SvelteKit preview only.
//
// Currently unused by the smoke specs in this directory because they
// don't depend on real data — they exercise the SvelteKit shell and
// client-side router. Kept here so future specs that want fixture data
// have a single place to extend.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { openDb } from "@claude-cron/core/db/connection";
import { insertRun, finishRun, appendEvent, setFavorite } from "@claude-cron/core/db/queries";

export interface SeedHandle {
  db: Database;
  close(): void;
}

export function seedFixtures(dbPath: string): SeedHandle {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);

  const now = Date.now();

  // Two projects, one favorited.
  setFavorite(db, "demo");

  // A handful of historical runs across two jobs.
  for (let i = 0; i < 5; i++) {
    const id = insertRun(db, {
      project: "demo",
      job: "hello",
      cmd: "claude --print 'hi'",
      cwd: "/tmp",
      started_at: now - (i + 1) * 60_000,
    });
    finishRun(db, id, {
      status: i === 0 ? "failure" : "success",
      finished_at: now - (i + 1) * 60_000 + 30_000,
      duration_ms: 30_000,
      exit_code: i === 0 ? 1 : 0,
      cost_usd: 0.01,
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
    });
  }

  // One running run with a couple of events.
  const runningId = insertRun(db, {
    project: "demo",
    job: "world",
    cmd: "claude --print 'hello'",
    cwd: "/tmp",
    started_at: now - 5_000,
  });
  appendEvent(db, runningId, "system", JSON.stringify({ subtype: "init" }));
  appendEvent(db, runningId, "assistant", JSON.stringify({ text: "Working..." }));

  return { db, close: () => db.close() };
}
