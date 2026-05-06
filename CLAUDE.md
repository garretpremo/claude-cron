# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`claude-cron` runs `claude -p` non-interactively on a schedule with isolation guarantees `/loop` doesn't provide (fresh context per fire, scoped tools, budget limits, preflight gate). Bun + TypeScript, no daemon — `crontab -l` is the source of truth for scheduling.

The repo is a Bun workspace with three packages:

- **`packages/core/`** — CLI, executor, db, cron, job loader. Framework-free.
- **`packages/server/`** — Bun.serve dashboard API, zod-driven route contract, OpenAPI/Scalar at `/docs`. Serves the built web bundle for non-API routes (with SPA fallback).
- **`packages/web/`** — SvelteKit + M3E PWA dashboard. Built by `@sveltejs/adapter-static` into `packages/web/dist/`.

Authoritative design docs live in `docs/specs/` and `docs/plans/` (Phase 1, Phase 2, Phase 3). Read these before changing executor, scheduling, DB semantics, or the dashboard contract.

## Commands

- `bun test` — workspace-wide (~115 tests across `packages/*/test/`).
- `bun test packages/core/test/executor.run.test.ts` — single file. Add `-t "pattern"` to filter by test name.
- `bun run typecheck` — runs `tsc --noEmit` for `core` + `server`. Strict mode + `noUncheckedIndexedAccess`.
- `bun run --filter @claude-cron/web typecheck` — `svelte-kit sync && svelte-check`.
- `bun run --filter @claude-cron/web e2e` — playwright smokes against `vite preview`.
- `bun run dev` — concurrent `vite dev` (web) + `Bun.serve` API watcher.
- `bun run build` — vite build of the web bundle into `packages/web/dist/`.
- `bun run install:global` — `bun run build && symlink packages/core/src/cli.ts into ~/.bun/bin/claude-cron`. The CLI runs directly from source via the shebang; the build is needed for the dashboard to have something to serve.

End-to-end smoke flows are in the README under "Manual smoke tests". Use those rather than inventing new fixtures.

## Architecture

Three persistent state locations — all under `~/.claude-cron/` (see `packages/core/src/util/paths.ts`):

1. **`projects.toml`** — registry of `name → absolute path`. Written by `register`/`unregister`.
2. **`history.db`** (SQLite) — `runs` + `events` + `favorites` tables (schema in `packages/core/src/db/schema.sql`). Migrations are SQL files in `packages/core/src/db/migrations/` applied by `packages/core/src/db/connection.ts`. Current schema version is **4** (favorites table) — bump `CURRENT_VERSION` in `connection.ts` and add a numbered migration file when extending the schema.
3. **User crontab** — managed in per-project blocks delimited by `# BEGIN claude-cron:<project>` / `# END`, plus a `global` block and a prelude block (`PATH`, `HOME`, `DBUS_SESSION_BUS_ADDRESS`, `XDG_RUNTIME_DIR` for keyring access from cron). `sync` rewrites exactly one block at a time and never touches lines outside managed blocks.

Job definitions are colocated with the project they automate at `<project>/.claude-jobs/*.yaml`, parsed/validated by Zod schema in `packages/core/src/job/schema.ts`. The schema enforces: exactly one of `claude.prompt | claude.prompt_cmd`, valid cron expression, valid duration strings.

### Layering

#### `packages/core/`

- `src/cli.ts` — Commander dispatch, one subcommand per file in `src/commands/`.
- `src/commands/*` — thin orchestration. Should not contain business logic.
- `src/executor/run.ts` — the run state machine. **All run lifecycle invariants live here**: stale-run sweep (`abandoned` after `max(2×timeout, 1h)`), `flock` acquire (overlap → `skipped_overlap`), preflight (nonzero exit → `skipped_preflight`), prompt resolution (`prompt` literal or `prompt_cmd` shell), claude argv build, stdout `stream-json` parse → `events` rows, terminal status write. Touch this file carefully; the status enum in `db/schema.sql` and the executor must stay in sync.
- `src/executor/claude.ts` — pure `Job → argv[]`. Always passes `--print --no-session-persistence --output-format stream-json --verbose --add-dir <cwd> --permission-mode <mode>`. Adds `--bare` for `auth: api_key`. Prompt is positional after `--`.
- `src/cron/render.ts` + `src/cron/sync.ts` — disabled jobs render as `# disabled: <line>` (preserved as comments, not removed).
- `src/db/queries.ts` — typed wrappers over `bun:sqlite`. The `coalesce` mode in `getRecentRuns` is allow-listed by the server controller to `skipped_preflight`.

#### `packages/server/`

- `src/index.ts` — `Bun.serve` entry. Builds a `Registry` of contract-defined routes, mounts `/openapi.json` and `/docs` (Scalar API reference), wires the SSE endpoint inline, and serves the SvelteKit bundle for everything else.
- `src/contract/` — the zod-driven route registry. Each route is `defineRoute({ summary, params?, query?, body?, output, handler })` and is added to the `Registry`. The adapter generates OpenAPI 3.1 + bun route handlers from the same definition. **Use this for any new JSON endpoint.**
- `src/routes/*` — one file per resource (`projects`, `runs`, `actions`, `favorites`, `dashboard`, `status`). Each exports route factories that take their dependency object and return a `RouteDef`.
- `src/services/*` — service-layer helpers (action-service for run-now/stop, etc.). Run-now uses an `onStart` callback so the API can return `run_id` before the run completes.
- `src/controllers/static.ts` — serves `packages/web/dist/` for `/`, `/_app/*`, `/favicon.*`, and SPA fallback. If the bundle is missing, returns a 503 with a "run `bun run build`" message.
- `src/controllers/stream.ts` — SSE live-tail. **Kept inline (not in the contract registry)** because the contract adapter is JSON request/response only; SSE is a long-lived `text/event-stream` response that doesn't fit that shape.

#### `packages/web/`

- `src/routes/` — SvelteKit pages: `/` Dashboard, `/activity`, `/projects/[project]`, `/projects/[project]/jobs/[job]`, `/settings`. Adapter-static + SPA fallback (`fallback: "index.html"`) so client-side routing works on a static host.
- `src/lib/api.ts` — typed `apiClient` whose request/response shapes come from `@claude-cron/server` contract zod schemas. New routes added to the registry are picked up by re-exporting them.
- `src/lib/stores/run-stream.ts` — per-run SSE store. Mounts `/api/runs/:id/stream`, parses events, exposes a Svelte 5 rune for the UI.
- `src/lib/stores/theme.svelte.ts` — M3E theme rune. Persists `claude-cron:theme` (preset hex) and `claude-cron:scheme` (`light` | `dark`) in `localStorage`.
- `src/lib/components/RunPopover.svelte` — deep-linkable run dialog (`?run=<id>`), used from both Activity and the job-detail page.
- `e2e/` + `playwright.config.ts` — smoke tests against `vite preview`. Without a fixture-seeded API server they cover the SvelteKit shell + client-side routing only; tests that need real data should boot `claude-cron serve` separately and seed via `e2e/fixtures.ts`.

### Auth modes (subscription vs api_key)

- `subscription` (default) reuses the user's OAuth keyring session. The cron prelude must export `DBUS_SESSION_BUS_ADDRESS` + `XDG_RUNTIME_DIR` for this to work from cron — `init` writes those automatically. `max_budget_usd` is inert in this mode.
- `api_key` reads `ANTHROPIC_API_KEY` from `~/.claude-cron/secrets.env` (mode 0600), passes `--bare`, and `max_budget_usd` is enforced.

### Cost vs tokens (subscription is notional)

`runs.cost_usd` comes from the `total_cost_usd` field of the `result` event the `claude` CLI emits at end-of-run. On subscription auth this is computed as the **API-equivalent** of the run's token usage at that model's rates — it's a consumption proxy, not a real charge. Treat tokens as the source of truth for "what this run consumed":

- `runs.input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens` are populated from `result.usage` in the same event. All four are nullable; pre-claude terminal states (`config_error`, `skipped_*`) leave them null.
- The dashboard shows compact output tokens in the Activity table and a full breakdown in the run side panel; `RunDTO` carries all four fields.

### Run statuses (db/schema.sql CHECK constraint)

`running, success, failure, timeout, interrupted, abandoned, skipped_preflight, skipped_overlap, config_error`. If you add a status, update both the SQL CHECK and the `RunStatus` type in `packages/core/src/db/queries.ts`.

### Coalescing in `listRuns`

`listRuns` accepts `coalesce: RunStatus` (currently allow-listed in the controller to `skipped_preflight` only). When set, consecutive runs sharing both `status` AND `(project, job)` are collapsed into a single leader row whose `coalesced_count` reflects the group size. The service fetches in 200-row chunks until the `limit`-th group is finalized — so `limit=10` returns 10 logical rows even if any single group spans thousands of physical runs. The frontend uses this on the Activity page and the job-detail "Recent runs" panel.

## Conventions

- ESM, `.ts` everywhere, `import` paths without extensions (Bun resolves them).
- Tests use `bun:test`. Fixtures live under `packages/*/test/fixtures/` (jobs YAML + `mock-claude.sh`); the executor accepts an `extraPath` so tests can prepend a mock `claude` to `PATH` instead of stubbing modules.
- Per the user's global CLAUDE.md: **never add `Co-Authored-By: Claude` trailers to commits** in this repo.
