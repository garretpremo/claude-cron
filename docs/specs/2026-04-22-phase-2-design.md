# claude-cron — Phase 2 Design

**Date:** 2026-04-22
**Status:** Draft, awaiting review
**Depends on:** Phase 1 design (`docs/specs/2026-04-22-phase-1-design.md`). Bumps Phase 1's DB schema from v1 to v2 (adds `runs.pid`) and adds a signal-handling change to `src/executor/run.ts`.

## 1. Purpose

A local web UI for monitoring claude-cron runs across registered projects, with a minimal set of actions to control jobs without dropping to the CLI.

Primary use case: glance at the dashboard after a batch of cron fires, drill into a run to see its event trace, stop one if it's misbehaving, flip a job off without editing YAML.

Non-goals for Phase 2: creating/editing job YAML through the UI, managing the registry, configuring schedules, authentication, multi-user access, remote deployment.

## 2. Scope

### In scope

- JSON API under `/api/*` backed by `bun:sqlite` and the Phase 1 job/registry modules
- Static single-page dashboard served by the same process
- Two visual modes — **Activity** (runs-table-first) and **Config** (project/job tree) — toggleable from the top bar, persisted in localStorage
- Shared Run Detail pane with event trace and SSE-backed live tail
- Three mutating actions: enable, disable, stop
- `claude-cron serve` CLI command to start the server
- Phase 1 schema bump (v2) adding `runs.pid` + executor updates for signal-based interruption

### Out of scope (Phase 2)

- Framework frontend (Solid/Preact) — Phase 3 migration
- Authentication / authorisation
- Multi-host / remote access
- Job creation or YAML editing through the UI
- Registry management through the UI
- Alerting / notifications (Phase 3)
- Run retry or re-run actions (Phase 3)
- Charts, cost graphs, aggregates beyond simple counts

## 3. Architecture

```
Browser ⇄ Bun.serve (one process)
           ├─ /              → static index.html
           ├─ /assets/*      → static js/css
           ├─ /api/projects  ─┐
           ├─ /api/runs       │ controllers (thin)
           ├─ /api/runs/:id/stream (SSE)
           └─ POST /api/.../enable,disable,stop
                              │
                              └─ services (business logic)
                                     ├─ bun:sqlite       (history.db)
                                     ├─ YAML file ops    (.claude-jobs/*.yaml)
                                     ├─ process.kill     (stop)
                                     └─ cron/sync        (enable/disable reuse)
```

Same Bun process serves HTML, API, and SSE. No build step in Phase 2; `public/` is shipped verbatim.

### 3.1 File structure

```
src/
├── commands/
│   └── serve.ts                 # NEW: `claude-cron serve [--port N] [--host H]`
├── db/
│   ├── connection.ts            # MODIFIED: migration runner; CURRENT_VERSION=2
│   └── migrations/
│       └── 002-add-run-pid.sql  # NEW
├── executor/
│   └── run.ts                   # MODIFIED: store pid; detect SIGTERM → status=interrupted
└── server/                       # NEW subtree
    ├── index.ts                 # Bun.serve setup, route table, startup/shutdown
    ├── controllers/              # HTTP handlers: parse → call service → format
    │   ├── projects.ts
    │   ├── runs.ts
    │   ├── stream.ts            # SSE
    │   ├── actions.ts
    │   ├── status.ts
    │   └── static.ts
    ├── services/                 # Pure business logic; take db + paths
    │   ├── project-service.ts
    │   ├── job-service.ts
    │   ├── run-service.ts
    │   └── action-service.ts
    ├── dto.ts                    # All wire types in one place
    ├── http/
    │   ├── errors.ts            # HttpError class; error → Response mapping
    │   ├── response.ts          # json(), sse(), notFound(), badRequest()
    │   └── query.ts             # parseIntParam, parseCSVParam helpers
    └── public/                   # Served verbatim
        ├── index.html
        ├── app.css
        └── app.js

test/
└── server/
    ├── fixtures/seed.ts          # seedRuns, seedEvents, seedProject, seedJobFile
    ├── services/
    │   ├── job-service.test.ts
    │   ├── run-service.test.ts
    │   └── action-service.test.ts
    └── integration/api.test.ts
```

Dependency direction: **controllers → services → {db, job, cron, executor}**. One-way. DTOs are shared by controllers and services; services construct them, controllers pass them through.

## 4. API Surface

### 4.1 Endpoints

```
GET  /api/projects                         → ProjectDTO[]
GET  /api/projects/:project                → ProjectDTO
GET  /api/projects/:project/jobs           → JobSummaryDTO[]
GET  /api/projects/:project/jobs/:job      → JobDetailDTO

GET  /api/runs
       ?project=&job=&status=success,failure&limit=50&offset=0
                                           → PaginatedRunsDTO
GET  /api/runs/:id                         → RunWithEventsDTO
GET  /api/runs/:id/stream                  → text/event-stream (SSE)

POST /api/projects/:project/jobs/:job/enable   → JobDetailDTO
POST /api/projects/:project/jobs/:job/disable  → JobDetailDTO
POST /api/runs/:id/stop                        → RunDTO

GET  /api/status                           → StatusDTO

GET  /                                     → public/index.html
GET  /assets/*                             → public/<path>
```

### 4.2 Conventions

- All timestamps: **epoch milliseconds**.
- Booleans: real JSON booleans (convert SQLite `0|1` at the service boundary).
- Event `payload`: parsed JSON (`unknown`), not string.
- Pagination: `offset/limit` (offset default 0, limit default 50, max 500).
- Filters: multi-valued filters are comma-separated (`status=failure,timeout`).
- Errors: always `ErrorDTO` with stable `code` + human `error`. HTTP status matches semantics (400/404/409/500).
- Idempotent writes: `enable`/`disable` return 200 whether or not the value changed.

### 4.3 DTOs (`src/server/dto.ts`)

```typescript
import type { RunStatus, EventType } from "../db/queries";
import type { Job } from "../job/schema";

export type { RunStatus, EventType };

export interface ProjectDTO {
  name: string;
  path: string;
  registered_at: number;
  job_count: number;
  last_run_at: number | null;
}

export interface JobSummaryDTO {
  project: string;
  name: string;
  schedule: string;
  enabled: boolean;
  description: string | null;
  last_run: {
    id: number;
    started_at: number;
    status: RunStatus;
  } | null;
  recent_runs: {
    total: number;
    successes: number;
    failures: number;
    skipped: number;
  };
}

export interface JobDetailDTO extends JobSummaryDTO {
  file: string;
  yaml: string;
  config: Job;
}

export interface RunDTO {
  id: number;
  project: string;
  job: string;
  status: RunStatus;
  started_at: number;
  ended_at: number | null;
  duration_ms: number | null;
  exit_code: number | null;
  cost_usd: number | null;
  summary: string | null;
  schedule: string;
  is_test: boolean;
  pid: number | null;
}

export interface RunWithEventsDTO extends RunDTO {
  events: EventDTO[];
}

export interface EventDTO {
  seq: number;
  ts: number;
  type: EventType;
  payload: unknown;
}

export interface PaginatedRunsDTO {
  runs: RunDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface StatusDTO {
  healthy: boolean;
  problems: string[];
  projects: number;
  abandoned_all_time: number;
  failures_24h: number;
  prelude_ok: boolean;
}

export interface ErrorDTO {
  error: string;
  code: string;
  details?: unknown;
}
```

## 5. Phase 1 Changes

### 5.1 Schema v2: `runs.pid`

Add migration `src/db/migrations/002-add-run-pid.sql`:

```sql
ALTER TABLE runs ADD COLUMN pid INTEGER;
```

Add a small migration runner to `src/db/connection.ts`:

```typescript
const CURRENT_VERSION = 2;
const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url).pathname;

function applyMigrations(db: Database) {
  const row = db.query("SELECT version FROM schema_version").get() as { version: number };
  for (let v = row.version + 1; v <= CURRENT_VERSION; v++) {
    const sql = readFileSync(`${MIGRATIONS_DIR}${String(v).padStart(3, "0")}-*.sql`, "utf8");
    // glob to find the file at v; the executor runs each ALTER as a single tx
    db.exec(sql);
    db.query("UPDATE schema_version SET version = ?").run(v);
  }
}
```

On fresh install: `schema.sql` creates the base schema (v1 fields). Migration runner then steps 1→2, applying the pid column. Fresh installs and upgrades converge on the same end state.

### 5.2 Executor changes (`src/executor/run.ts`)

After `Bun.spawn(argv, …)`:

```typescript
if (proc.pid) {
  db.query("UPDATE runs SET pid=? WHERE id=?").run(proc.pid, runId);
}
```

After `proc.exited` resolves:

```typescript
const exitCode = await proc.exited;
const wasSignaled = proc.signalCode !== null;
const status: RunStatus =
    timedOut    ? "timeout"
  : wasSignaled ? "interrupted"
  : exitCode === 0 ? "success"
  : "failure";
```

No other Phase 1 changes.

## 6. Action Mechanics

### 6.1 Enable / Disable

**Algorithm (in `action-service.ts`):**

1. Locate `<project>/.claude-jobs/<job>.yaml` via the registry + filesystem.
2. Read the file. Parse with `yaml` to verify it's valid and to read the current `enabled` value.
3. If parsed value already matches target, skip write; still call sync. Return updated DTO.
4. Otherwise, regex-replace on the `enabled:` line. Pattern:
   ```
   /^(\s*enabled:\s*)(true|false)(\s*(?:#.*)?)$/m
   ```
   Replace only the captured value; leading whitespace and trailing comment preserved.
5. If no `enabled:` line exists, insert `enabled: <value>` immediately after the `schedule:` line.
6. Write atomically: write to `<file>.tmp` with the new content, `fs.renameSync` to the final path.
7. Call the existing `cmdSync({ project })`.
8. Return the freshly-loaded `JobDetailDTO`.

### 6.2 Stop

Requires schema v2 (`runs.pid`) and the executor's signal-aware exit handling.

**Algorithm (in `action-service.ts`):**

```typescript
function stopRun(db: Database, runId: number): RunDTO {
  const row = db.query("SELECT * FROM runs WHERE id=?").get(runId);
  if (!row) throw new HttpError(404, "Run not found", "NOT_FOUND");
  if (row.status !== "running") {
    throw new HttpError(409, `Run status is ${row.status}`, "CANNOT_STOP_COMPLETED_RUN");
  }
  if (!row.pid) {
    throw new HttpError(409, "Run has no pid yet", "NO_PID_YET");
  }
  try {
    process.kill(row.pid, "SIGTERM");
  } catch (e: any) {
    if (e.code === "ESRCH") {
      throw new HttpError(409, "Process no longer exists", "PROCESS_GONE");
    }
    throw e;
  }
  // Runner's exit handler will mark the row interrupted.
  return toRunDTO(row);
}
```

Child-of-child orphans (e.g. a `gh` started by claude) are **not** addressed in Phase 2. The claude process usually completes pending tool calls synchronously; leftover child processes are short-lived. `setsid` wrapping is a Phase 3 consideration if it becomes a problem.

## 7. SSE Stream (`GET /api/runs/:id/stream`)

Handler polls the `events` table for new rows matching the run, emits them as SSE messages, stops when the run's status is not `running`.

**Shape:**

```
event: event
data: {"seq":0,"ts":1776910000000,"type":"start","payload":{…}}

event: status
data: {"status":"running"}

event: event
data: {"seq":1,"ts":1776910010000,"type":"preflight","payload":{…}}

event: end
data: {"status":"success","exit_code":0,"cost_usd":0.08}
```

**Pseudocode:**

```typescript
async function streamEvents(db, runId, writer) {
  let seq = 0;
  while (true) {
    const events = db.query(
      "SELECT seq,ts,event_type,payload FROM events WHERE run_id=? AND seq>=? ORDER BY seq"
    ).all(runId, seq);
    for (const e of events) {
      writer.write(`event: event\ndata: ${JSON.stringify(toEventDTO(e))}\n\n`);
      seq = e.seq + 1;
    }
    const { status } = db.query("SELECT status FROM runs WHERE id=?").get(runId);
    writer.write(`event: status\ndata: ${JSON.stringify({ status })}\n\n`);
    if (status !== "running") {
      writer.write(`event: end\ndata: ${JSON.stringify({ status })}\n\n`);
      break;
    }
    await sleep(500);
  }
  writer.close();
}
```

Poll interval: 500ms. Client reconnects automatically on drop (`EventSource` default). Server tears down the DB statement on writer close.

## 8. Frontend

### 8.1 Files

- `public/index.html` — single HTML file with top bar skeleton and empty main region
- `public/app.css` — all styles, ~200 lines
- `public/app.js` — ~400 lines, hand-written. Structured as:
  - **State** — single object `{ view, filters, selectedRunId, runs, projects, status }`
  - **API client** — thin `fetchJSON(path)` wrapper + `subscribeStream(runId, onEvent)`
  - **Views** — `renderActivity()`, `renderConfig()`, `renderRunDetail()`, each returning a DocumentFragment
  - **Router** — hashchange listener → calls the right render function
  - **Actions** — `enableJob`, `disableJob`, `stopRun` → POST, re-fetch, re-render

### 8.2 Layout

Top bar, always present:

```
┌────────────────────────────────────────────────────────────────────┐
│ claude-cron     [Activity | Config]        ● healthy   ⚙           │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  <swappable body: Activity view or Config view>                    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

- **Toggle** — segmented control, 2 buttons. Keyboard `v` cycles.
- **Status dot** — coloured by `/api/status`: green healthy, yellow if `problems.length > 0` and no severe problems, red if severe (no DB, no crontab, abandoned > 5).
- **Settings (⚙)** — dropdown: `status`, `about`, `help`.

### 8.3 Activity view (`#/activity`)

- Filter row: project (select) · job (select, depends on project) · status (multi-select) · `[Clear]`
- Runs table: 50-row window, columns — time · project/job · status pill · duration · cost · actions
- Running rows show `■ stop` button; all rows show `→ view`
- Auto-refresh every 5s when `document.visibilityState === "visible"`; paused otherwise
- Clicking a row opens Run Detail pane (`#/runs/:id`)

### 8.4 Config view (`#/config`)

- Left column (30%): project tree. Each project collapsible; each job a row showing name · schedule · enabled pill
- Right column (70%): selected job's panel — description · schedule · parsed config preview · recent runs list (top 10) · action buttons
- Actions: `Run now` (Phase 3 stub, greyed out), `Enable`/`Disable`, `View YAML` (expands to show raw yaml)
- Clicking a recent run opens Run Detail pane

### 8.5 Run Detail pane (shared)

Slide-in from the right, 40% width. Backed by `/api/runs/:id` + SSE.

- Header: project/job · status pill · timing summary
- Body: event trace, monospace; each event collapsible (ts · type · payload JSON)
- If `status === "running"`: live-tail via SSE, auto-scroll unless user scrolls up
- Actions: `■ stop` (running only)
- Close: `×` button · `Esc` key · click outside

### 8.6 Routing

Hash-based, client-side:

- `#/activity` — default
- `#/config`
- Run Detail pane overlays whichever view is active; open by changing hash to `#/activity?run=123` or `#/config?run=123` (preserves view context)
- Toggle updates hash; hash change drives view swap
- Browser back/forward works

### 8.7 State persistence

`localStorage`:

- `cc:view` — `"activity"` or `"config"`
- `cc:activity-filters` — JSON of last-used filters
- `cc:config-selected-job` — `"<project>/<job>"`

## 9. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Services | `bun test` with in-memory SQLite | All service functions; seed helpers for dense tests |
| Controllers | Integration covers them | Only error mapping unit-tested in `http/errors.ts` |
| Integration | `Bun.serve` on ephemeral port + `fetch` | Every endpoint, happy + error paths |
| YAML preservation | Byte-level diff assertions | Comments and whitespace preserved |
| Stop | `process.kill` stubbed | Correct HTTP codes for each run state |
| Static frontend | No automated tests in Phase 2 | Manual smoke test in README; deferred to Phase 3 migration |

**Seed helpers** (`test/server/fixtures/seed.ts`):

```typescript
export function seedRuns(db: Database, rows: Partial<InsertRunInput>[]): number[];
export function seedEvents(db: Database, runId: number, entries: [EventType, unknown][]): void;
export function seedProject(registryPath: string, p: ProjectEntry): void;
export function seedJobFile(projectPath: string, name: string, yaml: string): string;
```

**Manual stop test procedure** documented in the README with a `sleep 60` mock-claude fixture.

## 10. CLI Addition

```
claude-cron serve [--port <n>] [--host <h>]
```

Defaults: `--port 8787`, `--host 127.0.0.1`. Binds to localhost only; not reachable from network by default.

- Opens the DB, wires up services, mounts controllers, calls `Bun.serve(…)`.
- Logs each request on one line (method + path + status + ms) to stdout.
- SIGINT/SIGTERM on the server → graceful shutdown: close DB, finish in-flight SSE streams (flush `event: end`), exit.

## 11. Migration Safety

Existing claude-cron Phase 1 installs have a `history.db` with schema v1. On first run of the Phase 2 executable:

- `openDb` sees v1, the migration runner steps to v2 (`ALTER TABLE runs ADD COLUMN pid INTEGER`).
- Existing rows have `pid = NULL`. This is fine — the stop handler returns `NO_PID_YET` for those, and they'll never have been `running` anyway (Phase 1 never populated pid).

Rollback from v2 to v1 (if ever needed): manual `ALTER TABLE runs DROP COLUMN pid`; schema_version set back to 1. Not automated.

## 12. Non-Goals Recap

| Out of scope | Why |
|---|---|
| Framework frontend | Phase 3 swaps `public/` for a built SPA; API stays identical |
| Auth | Phase 2 is localhost-only; one user |
| Remote access | Same reason |
| YAML editing via UI | CLI is a better authoring surface; forms invite bugs |
| Retry / re-run buttons | Phase 3; needs DB model for run lineage |
| Alerts / notifications | Phase 3 |
| Charts / cost graphs | Phase 3 |

## 13. Done Criteria

1. `bun test` green (Phase 1 + new Phase 2 tests).
2. `bun run typecheck` clean.
3. `claude-cron serve`, visit `http://127.0.0.1:8787` — dashboard loads.
4. Activity view shows registered projects/jobs/runs (populate via a manual `claude-cron test` fire if needed).
5. Config view toggle works, persists across reloads.
6. Click a run → Run Detail pane with event trace.
7. Trigger a `mock-claude.sh` with `sleep 60`, see it `running`, click stop, see it transition to `interrupted`.
8. Flip enable/disable from the UI; `crontab -l` reflects the change.
9. `gh pr list` returns 0 PRs → trigger a run → see `skipped_preflight` in the UI with the preflight stdout/stderr visible in the event trace.

## 14. Open Questions

None blocking. Implementation-time decisions (exact CSS framework-less styling approach, whether to use `<dialog>` for the Run Detail pane, event-payload rendering fidelity) are left to the implementer.
