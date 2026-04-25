# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`claude-cron` runs `claude -p` non-interactively on a schedule with isolation guarantees `/loop` doesn't provide (fresh context per fire, scoped tools, budget limits, preflight gate). Bun + TypeScript CLI, no daemon — `crontab -l` is the source of truth for scheduling.

Authoritative design docs live in `docs/specs/` and `docs/plans/` (Phase 1 + Phase 2). Read these before changing executor, scheduling, or DB semantics.

## Commands

- `bun test` — run all tests (~95 tests across `test/`).
- `bun test test/executor.run.test.ts` — single file. Add `-t "pattern"` to filter by test name.
- `bun run typecheck` — `tsc --noEmit`. Strict mode + `noUncheckedIndexedAccess`.
- `bun run build` — bundle to `dist/claude-cron.js`.
- `bun run install:global` — symlink `src/cli.ts` into `~/.bun/bin/claude-cron`. The CLI runs directly from source via the shebang; no build step needed for local dev.

End-to-end smoke flow is in the README under "Smoke test (manual)" and the dashboard stop-smoke section. Use those rather than inventing new fixtures.

## Architecture

Three persistent state locations — all under `~/.claude-cron/` (see `src/util/paths.ts`):

1. **`projects.toml`** — registry of `name → absolute path`. Written by `register`/`unregister`.
2. **`history.db`** (SQLite) — `runs` + `events` tables (schema in `src/db/schema.sql`). Migrations are SQL files in `src/db/migrations/` applied by `src/db/connection.ts`. Current schema version is 3 — bump `CURRENT_VERSION` in `connection.ts` and add a numbered migration file when extending the schema.
3. **User crontab** — managed in per-project blocks delimited by `# BEGIN claude-cron:<project>` / `# END`, plus a `global` block and a prelude block (`PATH`, `HOME`, `DBUS_SESSION_BUS_ADDRESS`, `XDG_RUNTIME_DIR` for keyring access from cron). `sync` rewrites exactly one block at a time and never touches lines outside managed blocks.

Job definitions are colocated with the project they automate at `<project>/.claude-jobs/*.yaml`, parsed/validated by Zod schema in `src/job/schema.ts`. The schema enforces: exactly one of `claude.prompt | claude.prompt_cmd`, valid cron expression, valid duration strings.

### Layering

- `src/cli.ts` — Commander dispatch, one subcommand per file in `src/commands/`.
- `src/commands/*` — thin orchestration. Should not contain business logic.
- `src/executor/run.ts` — the run state machine. **All run lifecycle invariants live here**: stale-run sweep (`abandoned` after `max(2×timeout, 1h)`), `flock` acquire (overlap → `skipped_overlap`), preflight (nonzero exit → `skipped_preflight`), prompt resolution (`prompt` literal or `prompt_cmd` shell), claude argv build, stdout `stream-json` parse → `events` rows, terminal status write. Touch this file carefully; the status enum in `db/schema.sql` and the executor must stay in sync.
- `src/executor/claude.ts` — pure `Job → argv[]`. Always passes `--print --no-session-persistence --output-format stream-json --verbose --add-dir <cwd> --permission-mode <mode>`. Adds `--bare` for `auth: api_key`. Prompt is positional after `--`.
- `src/cron/render.ts` + `src/cron/sync.ts` — disabled jobs render as `# disabled: <line>` (preserved as comments, not removed).
- `src/server/` — Phase 2 dashboard. Bun.serve with `routes:` map in `index.ts`, controller-per-resource (`projects`, `runs`, `stream`, `actions`, `status`), services in `services/`, DTO shapes in `dto.ts`, static SPA in `public/`. SSE live-tail is in `controllers/stream.ts`. Run-now is wired through `services/action-service.ts` → `executor/run.ts` with the `onStart` callback so the API can return `run_id` before the run completes.

### Auth modes (subscription vs api_key)

- `subscription` (default) reuses the user's OAuth keyring session. The cron prelude must export `DBUS_SESSION_BUS_ADDRESS` + `XDG_RUNTIME_DIR` for this to work from cron — `init` writes those automatically. `max_budget_usd` is inert in this mode.
- `api_key` reads `ANTHROPIC_API_KEY` from `~/.claude-cron/secrets.env` (mode 0600), passes `--bare`, and `max_budget_usd` is enforced.

### Cost vs tokens (subscription is notional)

`runs.cost_usd` comes from the `total_cost_usd` field of the `result` event the `claude` CLI emits at end-of-run. On subscription auth this is computed as the **API-equivalent** of the run's token usage at that model's rates — it's a consumption proxy, not a real charge. Treat tokens as the source of truth for "what this run consumed":

- `runs.input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens` are populated from `result.usage` in the same event. All four are nullable; pre-claude terminal states (`config_error`, `skipped_*`) leave them null.
- The dashboard shows compact output tokens in the Activity table and a full breakdown in the run side panel; `RunDTO` carries all four fields.

### Run statuses (db/schema.sql CHECK constraint)

`running, success, failure, timeout, interrupted, abandoned, skipped_preflight, skipped_overlap, config_error`. If you add a status, update both the SQL CHECK and the `RunStatus` type in `src/db/queries.ts`.

### Coalescing in `listRuns`

`listRuns` accepts `coalesce: RunStatus` (currently allow-listed in the controller to `skipped_preflight` only). When set, consecutive runs sharing both `status` AND `(project, job)` are collapsed into a single leader row whose `coalesced_count` reflects the group size. The service fetches in 200-row chunks until the `limit`-th group is finalized — so `limit=10` returns 10 logical rows even if any single group spans thousands of physical runs. The frontend uses this on the Activity page and the job-detail "Recent runs" panel.

## Conventions

- ESM, `.ts` everywhere, `import` paths without extensions (Bun resolves them).
- Tests use `bun:test`. Fixtures live under `test/fixtures/` (jobs YAML + `mock-claude.sh`); the executor accepts an `extraPath` so tests can prepend a mock `claude` to `PATH` instead of stubbing modules.
- Per the user's global CLAUDE.md: **never add `Co-Authored-By: Claude` trailers to commits** in this repo.
