# Dashboard M3 migration — design

**Date:** 2026-05-05
**Phase:** 3 (post-Phase-2 redesign)
**Status:** Approved (brainstorm complete; pending implementation plan)

## Goal

Rewrite the claude-cron dashboard on top of the [`bun-svelte-m3e-template`](https://github.com/garretpremo/bun-svelte-m3e-template) stack: SvelteKit + Material 3 Expressive frontend, a typed zod-route-registry contract layer, PWA scaffolding. Restructure the project into a 3-package Bun workspace so the CLI core, dashboard API, and web app are cleanly separated. Adopt the template's typed `apiClient` end-to-end.

The existing executor, scheduler, SQLite history, and CLI behavior are preserved unchanged. The migration is in service of graduating the project out of alpha by replacing the afterthought-grade UI with a deliberate one.

## Non-goals

- Rewriting the executor, cron-sync, or job-loading logic.
- Changing job YAML schema or `~/.claude-cron/` state-directory layout.
- Multi-user auth, dashboard hardening, npm distribution. Existing alpha gotchas remain alpha gotchas; this work is scoped to the dashboard restructure.
- macOS keyring path. Linux-only verified, as today.

## Workspace structure

3-package Bun monorepo under `packages/`:

| Package | Role | Imports |
|---|---|---|
| `@claude-cron/core` | Framework-free logic. CLI entry (`cli.ts`), executor, db (SQLite + migrations), cron sync, registry, job loader, paths. Exports run/load/query helpers used by `@claude-cron/server`. | `bun:sqlite`, `commander`, `cron-parser`, `zod` (for job YAML schema only) |
| `@claude-cron/server` | Bun.serve API. Imports `@claude-cron/core`. Defines route registry with zod input/output schemas, generates OpenAPI, mounts Scalar at `/docs`. Serves built web bundle from `@claude-cron/web/dist/`. Exports typed `apiClient` via `@claude-cron/server/contract`. | `@claude-cron/core`, `zod`, `@scalar/api-reference` |
| `@claude-cron/web` | SvelteKit + M3E PWA. Consumes `@claude-cron/server/contract`. | `@claude-cron/server` (types only), `@sveltejs/kit`, `@material/web`, `@vite-pwa/sveltekit` |

The CLI binary is symlinked from `packages/core/src/cli.ts`. `~/.claude-cron/` paths are unchanged.

## Build & install pipeline

| Command | Behavior |
|---|---|
| `bun install` | Workspace install across all packages. |
| `bun run dev` | Concurrent vite dev (web, port 5173, proxies `/api/*` and SSE to API) + `bun --watch packages/server/src/index.ts` (port 8787). |
| `bun run build` | `vite build` for web → `packages/web/dist/`. Server is no-build (Bun runs TS directly). |
| `bun run install:global` | Runs `bun run build` first, then symlinks `packages/core/src/cli.ts` to `~/.bun/bin/claude-cron`. |
| `bun test` | Workspace-wide `bun:test`. |
| `bun run typecheck` | Workspace-wide `tsc --noEmit`. |
| `bun run e2e` | Playwright e2e against the web build. |

**New install requirement:** the dashboard now requires a `vite build` (~5–15s). Documented in README. The CLI itself remains no-build at runtime.

## Information architecture

### Routes

| Path | Page | Purpose |
|---|---|---|
| `/` | Dashboard | Global stat cards, running-jobs row, project panels (4–8), job panels (max 8). |
| `/activity` | Activity | Global firehose runs table. Filterable by project, job, status, date range. Linked from a "View all →" affordance on the dashboard and from the sidebar. |
| `/projects/:project` | Project view | Project-scoped stat cards, running-jobs row, jobs grid. |
| `/projects/:project/jobs/:job` | Job view | Stat cards + filterable runs table for one job. Running runs pinned to top. Row click → run popover. |
| `/settings` | Settings | Theme + scheme picker (lifted wholesale from `bun-svelte-m3e-template`). |

### Drill-down behavior

- Dashboard project panel click → `/projects/X`.
- Dashboard job panel click → `/projects/X/jobs/Y`.
- Dashboard or Project running-job card click → `/projects/X/jobs/Y?run=<id>` (job view + popover open).
- Job view runs-table row click → opens popover, sets `?run=<id>` in URL.
- Run popover close → strips `?run`.

### Configuration surface

The previous Config view is dissolved into the new IA:

- **Job view** header: enable/disable toggle, Run-now button, "View YAML" button (opens a side drawer with schedule expression, allowed_tools list, and the resolved YAML).
- **Project view** job panels: kebab menu on each panel surfaces enable/disable + Run-now.

There is no standalone `/config` route in the new IA.

### Activity exclusion rule

When ranking projects/jobs by "activity" (top_projects, top_jobs ordering on dashboards) **and** when computing dashboard counts, exclude both `skipped_preflight` and `skipped_overlap`. Skips are still visible in the runs table and Activity page; they just don't drive ranking or headline counts.

## Backend additions

### New endpoints

| Endpoint | Returns |
|---|---|
| `GET /api/dashboard?since=24h` | `{ counts, running[], top_projects[] (≤8), top_jobs[] (≤8) }`. `top_*` ordered by `success+failure` (both skips excluded). |
| `GET /api/projects/:project/dashboard?since=24h` | Project-scoped; drops `top_projects`. |
| `GET /api/projects/:project/jobs/:job/stats?since=24h` | Job-scoped stat cards (counts, last-run summary, token totals). |
| `GET /api/favorites` | List of favorited project names. |
| `PUT /api/favorites/:project` | Mark a project favorite. Idempotent. |
| `DELETE /api/favorites/:project` | Unfavorite. Idempotent. |

All existing endpoints (projects, runs, stream, status, action endpoints) keep their shapes but acquire zod schemas via the contract layer.

### Schema migration v4

Adds:

```sql
CREATE TABLE favorites (
  project TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
```

Forward-only, consistent with existing migration policy. Bump `CURRENT_VERSION` to 4 in `packages/core/src/db/connection.ts`. Add `packages/core/src/db/migrations/004-favorites.sql`.

### Contract layer

Each route file exports a route descriptor:

```ts
export const dashboardRoute = defineRoute({
  path: "/api/dashboard",
  method: "GET",
  input: z.object({ since: z.enum(["24h", "7d", "30d"]).default("24h") }),
  output: z.object({
    counts: CountsSchema,
    running: z.array(RunRunningDTO),
    top_projects: z.array(ProjectActivityDTO).max(8),
    top_jobs: z.array(JobActivityDTO).max(8),
  }),
  handler: dashboardController.get,
});
```

Route registry in `packages/server/src/contract/registry.ts` aggregates all `defineRoute()` exports. OpenAPI generated from the registry, cached. Scalar mounted at `/docs`. Web consumes `import { apiClient } from "@claude-cron/server/contract"` — `apiClient.dashboard.get({ since: "24h" })` is fully typed end-to-end.

## Web architecture

### Reusable components

Located at `packages/web/src/lib/components/`:

| Component | Purpose |
|---|---|
| `StatCardsRow` | Array of `{ label, value, color, delta? }`. Used on Dashboard, Project view, Job view (different scopes). |
| `RunningJobsRow` | Horizontally scrollable carousel of `RunningJobCard`. **The only h-scroll surface in the app.** Hides entirely when zero running runs. Reused on Dashboard + Project view. |
| `RunningJobCard` | Job name, project, started-at, last 2-3 streamed events (FIFO phaseout), status pulse. Auto-updates via per-run SSE store. Click → `/projects/X/jobs/Y?run=<id>`. |
| `ProjectPanel` | Clickable card. Project name, success/fail counts (24h, both skips excluded), star toggle top-right. Click → `/projects/X`. Star → favorites API (optimistic). |
| `JobPanel` | Clickable card. Job name, project, success/skipped/failed counts (24h). Click → `/projects/X/jobs/Y`. |
| `RunPopover` | M3E dialog (centered, replaces the legacy slide-over). Event trace, tokens, cost. Live-tails when status is `running`. |
| `RunsTable` | Compact, filterable. Status multi-select, date range. On `/activity` also surfaces project + job filters. Running runs pinned to top. |
| `AppShell` | Sidebar nav (Dashboard / Activity / Settings) + topbar with breadcrumb when drilled in. |

### State management

- **Theme + scheme:** localStorage (`claude-cron:theme`, `claude-cron:scheme`). Per-device. Default: **Dark scheme + Indigo theme**.
- **Favorites:** server-side via favorites endpoints. Fetched on dashboard mount. Optimistic UI on toggle.
- **Filters (Activity / Job view):** localStorage (`claude-cron:filters:activity`, `claude-cron:filters:job:<project>:<job>`). Survive reload.
- **Auto-refresh:** poll `/api/dashboard` (or scoped variant) every 10s while the tab is visible. On `visibilitychange` to hidden, cancel the interval; on visible, fire one immediate fetch and restart the interval.

### Live updates

Per-run SSE × N pattern. Frontend opens one `EventSource` per running run, fed into a Svelte store keyed by run id. Existing `/api/runs/:id/stream` is reused unchanged.

Tradeoff vs a multiplexed `/api/stream?runs=...`: with N concurrent runs typically ≤5 and HTTP/1.1's ~6-sockets-per-host cap leaving headroom, parallel EventSources are simpler. If we ever push past, a multiplexed endpoint can be added without changing the store contract.

## Theming

- Settings page lifted wholesale from `bun-svelte-m3e-template`.
- Theme palette: Indigo (default), Sage, Crimson, Sunset, Plum, Slate, Citrus, Teal.
- Scheme: Dark (default), Light.
- Brand: `claude-cron` wordmark in the topbar.
- Two-tier component loading per template convention: chrome eager (AppShell, topbar, sidebar), the rest lazy via per-wrapper imports.

## Migration plan

Single feature branch (`m3-migration`). 7 staged commits, each green on `bun test` + `bun run typecheck`. The CLI must remain functional after every commit; master stays untouched until the final merge.

1. **Restructure into 3 packages.** Move existing `src/` wholesale into `packages/core/src/` and `packages/server/src/`. Update imports, `package.json`, `tsconfig`, `install:global` script. No behavior change.
2. **Zod-contract scaffold.** Route registry, OpenAPI generator, Scalar at `/docs`, `apiClient` export. No new endpoints yet.
3. **Refactor existing routes through the contract.** Each route declares `{ input, output }` zod schemas. API surface unchanged.
4. **Schema v4 + new endpoints.** `favorites` table, `/api/dashboard`, `/api/projects/:project/dashboard`, `/api/projects/:project/jobs/:job/stats`, `/api/favorites/*`. Backend tests for the new endpoints.
5. **Scaffold `packages/web`.** SvelteKit + M3E + the template's settings page. Empty pages for Dashboard / Activity / Project / Job. AppShell with sidebar nav.
6. **Build the pages.** Dashboard → Activity → Project view → Job view → run popover. One commit per page where possible. Wire up the typed apiClient and per-run SSE stores.
7. **Cutover.** Point Bun.serve at `packages/web/dist/`. Delete `src/server/public/`. Update `install:global` to run `bun run build` first. README and CLAUDE.md updated. Final smoke + Playwright run. Merge.

Before merging step 7, re-run the README's manual smoke flows ("Smoke test (manual)" and "Stop a running job from the dashboard") against the new implementation to verify behavioral parity for register → sync → test-run → dashboard observation → stop-running.

## Testing

### Backend

- All ~95 existing `bun:test` cases preserved; paths updated to `packages/core/test/` or `packages/server/test/` per ownership.
- New tests:
  - Dashboard aggregation queries (counts, top_projects ordering, top_jobs ordering, skip-exclusion correctness).
  - Favorites CRUD (idempotency, sort behavior).
  - OpenAPI generator output for one representative route.
  - Contract round-trip (zod-validate response against output schema for each route).

### Frontend e2e (Playwright)

Smoke set, not exhaustive. apijack is **not** adopted; fixtures use plain SQL helpers (`packages/web/test/fixtures.ts`) that insert project/job/run/event rows directly into the SQLite DB.

- Dashboard loads and renders the empty state correctly with one project / no running runs.
- Drilling Dashboard → Project → Job navigates correctly.
- Run popover opens via row click and via `?run=<id>` deep link; closing strips the param.
- SSE live tail: spawn a fixture run, verify `RunningJobCard` updates with new events.
- Favorites persist across reload (server-side storage).
- Theme + scheme toggle persists across reload (localStorage).

### CI

`.github/workflows/ci.yml` runs:
- `bun test` (workspace)
- `bun run typecheck` (workspace)
- `bun run build` (web)
- `bun run e2e` (Playwright)

Caches `node_modules` and `~/.bun/install/cache`.

## Decisions reference

For traceability, the brainstorm produced these locked-in answers:

- Workspace shape: **3-package** (core / server / web).
- Template scope: **full** (SvelteKit + M3E + zod-contract + OpenAPI/Scalar + PWA scaffolding + Playwright). apijack deferred.
- Active-exclusion: **both skips** excluded from activity counts/sorts.
- Favorites: **server-side** (schema v4).
- Run popover: **deep-linkable** via `?run=<id>`.
- Dashboard running-job card click: **job view + popover open** (consistent with project view).
- Theme/scheme defaults: **Dark + Indigo**.
- Live updates: **per-run SSE × N**.
- Dashboard polling cadence: **10s while visible**.
- Global activity firehose: **kept as `/activity`** (not folded into dashboard).
- Run popover style: **M3E dialog**, not slide-over.

## Open questions / future considerations

- **Multiplexed SSE endpoint.** Trivial to add later if concurrent run counts grow. Store contract is already keyed by run id.
- **WebSocket upgrade.** `wsClient` export from the contract layer is reserved but not used in this phase. SSE is sufficient.
- **macOS subscription auth.** Out of scope. Tracked in alpha gotchas.
- **Push notifications.** PWA scaffolding lands but no notification subscription is wired. Future work.
- **Dashboard `since=` arbitrary windows.** Currently capped to `24h | 7d | 30d`. If charts/trend views land later, expand the enum.
