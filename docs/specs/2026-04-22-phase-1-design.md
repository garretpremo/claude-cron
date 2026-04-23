# claude-cron — Phase 1 Design

**Date:** 2026-04-22
**Status:** Draft, awaiting review
**Scope:** Phase 1 only (runner + job definitions + system cron + SQLite history). Phases 2 (web UI) and 3 (hooks/alerts) are out of scope.

## 1. Purpose

Run Claude Code (`claude -p`) non-interactively on a schedule, with isolation guarantees that `/loop` doesn't provide:

- Fresh context per run (no accumulated conversation state)
- Scoped to specific agents/skills with a narrow tool whitelist
- Budget-bounded (where API key auth is used)
- Gated by a pre-flight shell check so we don't spend LLM cycles when there's nothing to do
- OS-level scheduling (`crontab -l` is the source of truth; survives reboots; no daemon to babysit)

Jobs are colocated with the project they automate (`<project>/.claude-jobs/*.yaml`). Multiple projects are supported via a central registry. Run history is stored in a single SQLite DB on disk, ready to be read by a Phase 2 web UI.

The Phase 1 success condition is one concrete job running on a loop: auto-review one open apijack PR targeting `dev` every 5 minutes, via the `/review-issue` skill, with merges explicitly disallowed.

## 2. Scope

### In scope (Phase 1)

- `claude-cron` CLI (Bun + TypeScript): init, register, unregister, list, run, test, sync, logs, status
- Job definition YAML schema with zod validation
- Project registry at `~/.claude-cron/projects.toml`
- Colocated job files at `<project>/.claude-jobs/*.yaml`; global escape hatch at `~/.claude-cron/global/`
- System cron scheduling via a managed crontab block per project
- SQLite history DB (`~/.claude-cron/history.db`) in WAL mode
- Pre-flight gate (shell command, exit-code contract)
- Dynamic prompts via `prompt_cmd` (shell-generated prompt content)
- Tool whitelisting via `--allowed-tools`
- Per-run lockfiles (`flock`) to prevent overlap
- Abandoned-run sweep on startup
- Subscription-auth and API-key-auth paths
- Retention per job (delete rows older than `retention_days`)
- Unit + integration tests with a mock `claude` binary

### Out of scope (Phase 1)

- Web UI (Phase 2)
- Alerting, hooks, notifications (Phase 3)
- Multi-machine/distributed scheduling
- Retry logic (a failed run is logged; the next cron fire tries again)
- Secret management beyond a single `~/.claude-cron/secrets.env` file
- `systemctl` user timers (cron only for now; `sync` abstraction keeps timers as a future drop-in)

## 3. Architecture

### 3.1 Components

```
User → claude-cron CLI → [loader, registry, executor, cron sync, DB]
                           ↓
                       system cron → claude-cron run <project>/<job>
                                       ↓
                                   claude -p (subprocess)
```

- **Loader (`src/job/loader.ts`)** — reads `<project>/.claude-jobs/*.yaml` (or `~/.claude-cron/global/*.yaml`), validates with zod.
- **Registry (`src/job/registry.ts`)** — reads/writes `~/.claude-cron/projects.toml`.
- **Executor (`src/executor/*`)** — preflight, claude spawn, DB writes, lockfile.
- **Cron sync (`src/cron/*`)** — reads job files for a given project, renders crontab lines, rewrites the managed block in user crontab.
- **DB (`src/db/*`)** — SQLite via `bun:sqlite`, WAL mode, schema migrations.

### 3.2 Directory layout (repo)

```
claude-cron/
├── package.json
├── tsconfig.json
├── bun.lockb
├── src/
│   ├── cli.ts                     # commander entry point
│   ├── commands/
│   │   ├── init.ts
│   │   ├── register.ts
│   │   ├── unregister.ts
│   │   ├── list.ts
│   │   ├── run.ts
│   │   ├── test.ts
│   │   ├── sync.ts
│   │   ├── logs.ts
│   │   └── status.ts
│   ├── job/
│   │   ├── schema.ts              # zod schema + types
│   │   ├── loader.ts
│   │   └── registry.ts
│   ├── executor/
│   │   ├── preflight.ts
│   │   ├── claude.ts              # builds argv, spawns child
│   │   ├── logger.ts              # writes events to DB
│   │   └── lock.ts                # flock wrapper
│   ├── cron/
│   │   ├── sync.ts
│   │   └── render.ts              # job → crontab line
│   ├── db/
│   │   ├── connection.ts
│   │   ├── schema.sql
│   │   └── queries.ts
│   └── util/
│       ├── signals.ts
│       └── time.ts
├── test/
│   ├── fixtures/
│   │   └── mock-claude.sh         # stand-in for claude in CI
│   ├── job.schema.test.ts
│   ├── cron.render.test.ts
│   ├── executor.run.test.ts
│   └── sync.test.ts
├── docs/
│   └── specs/
│       └── 2026-04-22-phase-1-design.md
└── README.md
```

### 3.3 On-disk state

```
~/.claude-cron/
├── projects.toml                  # project registry
├── history.db                     # SQLite, WAL mode
├── secrets.env                    # 0600; ANTHROPIC_API_KEY if auth: api_key
├── global/                        # global escape-hatch jobs
│   └── *.yaml
└── locks/
    └── <project>--<job>.lock      # flock
```

### 3.4 Target repo layout (e.g. apijack)

```
apijack/
└── .claude-jobs/
    └── review-issue.yaml
```

The `.claude-jobs` directory is checked into git.

## 4. Job YAML Schema

```yaml
name: string                       # unique within project
description: string | null
schedule: string                   # 5-field cron expression; validated by cron-parser
enabled: boolean                   # default true
auth: "subscription" | "api_key"   # default "subscription"

preflight:                         # optional; if omitted, always runs
  run: string                      # bash script; exit 0 = proceed, nonzero = skip
  timeout: duration                # default 30s

claude:
  # exactly one of prompt | prompt_cmd
  prompt: string | null
  prompt_cmd: string | null        # bash script; stdout becomes the prompt

  agent: string | null             # → --agent
  append_system_prompt: string | null  # → --append-system-prompt
  allowed_tools: string[]          # → --allowed-tools (space-separated)
  disallowed_tools: string[]       # → --disallowed-tools
  permission_mode: "auto" | "acceptEdits" | "bypassPermissions" | "default" | "dontAsk" | "plan"
  model: string | null             # → --model
  max_budget_usd: number | null    # → --max-budget-usd (only effective when auth: api_key)
  extra_args: string[]             # escape hatch, appended to argv

cwd: string                        # default "."; resolved relative to job file's dir
timeout: duration                  # overall wall-clock cap; default 10m

logging:
  retention_days: number           # default 30
```

**Duration format:** `/^(\d+)(s|m|h|d)$/` → seconds, minutes, hours, days.

**Validation:** zod at load time. Invalid files error at `list`/`sync`/`run` time with `file:line`.

**Exactly-one constraint:** `prompt XOR prompt_cmd`. Enforced in zod via `refine`.

### 4.1 Always-applied claude flags

Regardless of YAML, the executor adds:

- `--print`
- `--no-session-persistence`
- `--output-format json`
- `--add-dir <resolved cwd>`
- `--bare` (when `auth: api_key`)

These cannot be overridden.

## 5. CLI Surface

```
claude-cron init
    First-time setup. Creates ~/.claude-cron/{projects.toml,global/,locks/},
    initialises history.db with schema. Writes a skeleton crontab block with
    BEGIN/END markers and env-var prelude (PATH, HOME, SHELL,
    DBUS_SESSION_BUS_ADDRESS, XDG_RUNTIME_DIR detected from current session).
    Writes a placeholder secrets.env (0600).
    Idempotent — re-running on an initialised system is a no-op with a notice.

claude-cron register [path]
    Register a project. Defaults to cwd. Adds {name, path} to projects.toml.
    Project name defaults to basename(path); --name overrides.
    Errors if path has no .claude-jobs/ unless --allow-empty.

claude-cron unregister [name|path]
    Remove a project from the registry. Does NOT delete job files or the
    crontab block (user must run `sync` to clear). Warns if block is still
    active.

claude-cron list [--project <name>] [--global] [--all] [--json]
    Show jobs. Default: project from cwd. --all lists every registered project
    plus global. Columns: name, schedule, enabled, last-run, last-status.
    Parse errors shown inline with file:line.

claude-cron run <job> [--force]
    Cron-facing. Job reference: "<project>/<job>" or bare "<job>" if cwd is in
    a registered project. Executes: abandoned-run sweep → flock → preflight
    → build argv → spawn claude → stream events to DB → finalise → retention
    sweep → exit.
    --force skips preflight.
    Exit codes: 0 on success/skip, 1 on runtime error, 2 on config error.

claude-cron test <job> [--skip-preflight] [--dry-run]
    Same flow as `run`, but tees output to stdout and writes runs with a
    "test" flag so history filters can hide them. --dry-run prints the exact
    argv without executing.

claude-cron sync [project] [--global] [--dry-run]
    Rewrites ONE managed crontab block. Project resolved from cwd if omitted,
    unless --global (targets only the global block). --dry-run prints diff.
    Per-project blocks: # BEGIN claude-cron:<project> / # END claude-cron:<project>
    Never touches lines outside managed blocks. Never touches other projects'
    blocks.

claude-cron logs <job> [--tail] [--last N] [--json]
    Default: last 10 runs (id, start, status, duration, cost). --last N
    overrides. --json emits full event trace. --tail follows the most recent
    in-flight run (polls DB at 1s).

claude-cron status
    Health check: registry sanity, crontab marker presence, env prelude
    present, recent failures across all projects, last-run summary, count of
    abandoned runs.
```

## 6. Execution Trace (one run)

Triggered by cron: `*/5 * * * * /home/garret/.bun/bin/claude-cron run apijack/review-issue`

1. **Abandoned-run sweep.** `UPDATE runs SET status='abandoned', ended_at=now() WHERE status='running' AND started_at < now() - max(2 × job.timeout, 1h)`.
2. **Acquire lock.** `flock -n ~/.claude-cron/locks/apijack--review-issue.lock`. If held, insert a `skipped_overlap` row and exit 0.
3. **Load + validate job** from `~/projects/apijack/.claude-jobs/review-issue.yaml`. On parse error: insert `config_error` row, exit 2.
4. **Insert run row** with `status='running'`, `fire_time`, `started_at`. Get `run_id`.
5. **Preflight.** Spawn `bash -c "$preflight.run"` in `cwd`, capture stdout/stderr, enforce timeout. Insert a `preflight` event. On nonzero exit or timeout: update run to `skipped_preflight`, exit 0.
6. **Resolve prompt.** If `prompt_cmd` set: run it in `cwd`, capture stdout as the prompt string. On nonzero exit or empty stdout: update run to `config_error`, exit 2.
7. **Build argv.** `claude` + always-applied flags + per-yaml flags + prompt as final positional.
8. **Spawn claude.** New process group. `prctl(PR_SET_PDEATHSIG, SIGKILL)` on child. Stream stdout/stderr to DB as `claude_stdout`/`claude_stderr` events (one event per line, batched in transactions of up to 50).
9. **Wait** with overall `job.timeout`. On timeout: `kill -TERM -<pgid>`, wait 5s, `kill -KILL -<pgid>`, update run to `timeout`.
10. **Parse final JSON** from claude's stdout (last valid JSON object on the stream). Extract `cost_usd`, `summary`, terminal status.
11. **Finalise.** Update run row: `ended_at`, `status` (`success` if exit 0, else `failure`), `exit_code`, `cost_usd`, `summary`.
12. **Retention sweep.** `DELETE FROM runs WHERE project=? AND job=? AND started_at < now() - retention_days × 86400`. Events cascade via FK.
13. **Release lock**, exit with appropriate code.

**Signal handling:**
- `SIGTERM`/`SIGINT`: kill child process group, mark run `interrupted`, release lock, exit 130.
- `SIGKILL`: uncatchable — relies on abandoned-run sweep next invocation. `PR_SET_PDEATHSIG` ensures the child claude dies too.

## 7. SQLite Schema

Located at `~/.claude-cron/history.db`. WAL mode. `PRAGMA busy_timeout=5000` on each connection.

```sql
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY
);
INSERT INTO schema_version VALUES (1);

CREATE TABLE projects (
  name          TEXT PRIMARY KEY,
  path          TEXT NOT NULL,
  registered_at INTEGER NOT NULL
);

CREATE TABLE runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project     TEXT NOT NULL,
  job         TEXT NOT NULL,
  fire_time   INTEGER NOT NULL,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  status      TEXT NOT NULL
              CHECK (status IN (
                'running', 'success', 'failure', 'timeout',
                'interrupted', 'abandoned',
                'skipped_preflight', 'skipped_overlap', 'config_error'
              )),
  exit_code   INTEGER,
  cost_usd    REAL,
  summary     TEXT,
  schedule    TEXT,
  is_test     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_runs_project_job_time ON runs(project, job, started_at DESC);
CREATE INDEX idx_runs_status ON runs(status, started_at DESC);

CREATE TABLE events (
  run_id      INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  ts          INTEGER NOT NULL,
  event_type  TEXT NOT NULL
              CHECK (event_type IN (
                'start', 'preflight', 'prompt_cmd',
                'claude_stdout', 'claude_stderr',
                'end'
              )),
  payload     TEXT NOT NULL,
  PRIMARY KEY (run_id, seq)
);
```

All timestamps are Unix epoch milliseconds.

## 8. Cron Integration

### 8.1 Managed block format

```
# BEGIN claude-cron-prelude
PATH=/home/garret/.bun/bin:/usr/local/bin:/usr/bin:/bin
HOME=/home/garret
SHELL=/bin/bash
DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
XDG_RUNTIME_DIR=/run/user/1000
# END claude-cron-prelude

# BEGIN claude-cron:apijack
*/5 * * * * /home/garret/.bun/bin/claude-cron run apijack/review-issue
# END claude-cron:apijack

# BEGIN claude-cron:global
# (empty)
# END claude-cron:global
```

- Prelude block written **once** by `init`. `sync` never rewrites it. `status` warns if prelude values diverge from current session detection.
- Per-project blocks written/rewritten by `sync <project>`. Always full-rewrite of that block only.
- Global block written/rewritten by `sync --global`.
- Lines outside managed markers are preserved untouched.

### 8.2 Safety

- `sync` reads current `crontab -l`, constructs the new content in memory, writes to a temp file, validates with `crontab -n` (if available) or a dry parse, then `crontab <tmp>`.
- `sync --dry-run` prints a unified diff without writing.
- On any parse/write error, abort and leave crontab untouched.

## 9. Auth

### 9.1 Subscription (default)

- No env vars added; claude uses its existing OAuth session from the keyring.
- `DBUS_SESSION_BUS_ADDRESS` and `XDG_RUNTIME_DIR` in the prelude are what make keyring access work from cron.
- `max_budget_usd` is inert; subscription rate limits are the real cap.

### 9.2 API key

- `claude-cron run` sources `~/.claude-cron/secrets.env` before spawning claude when `auth: api_key`.
- `secrets.env` is chmod 0600. `init` creates it with a placeholder comment.
- Executor adds `--bare` to the claude argv so only `ANTHROPIC_API_KEY` is used for auth.
- `max_budget_usd` becomes meaningful.

## 10. The First Job: apijack review-issue

Path: `~/projects/apijack/.claude-jobs/review-issue.yaml`

```yaml
name: review-issue
description: Review one open apijack PR (oldest first) — comment only, no merge

schedule: "*/5 * * * *"
enabled: true
auth: subscription

preflight:
  run: |
    count=$(gh pr list \
      --repo normalled/apijack \
      --base dev \
      --state open \
      --json number --jq 'length')
    [ "$count" -gt 0 ]
  timeout: 30s

claude:
  prompt_cmd: |
    pr=$(gh pr list \
      --repo normalled/apijack \
      --base dev \
      --state open \
      --json number \
      --jq 'sort_by(.number) | .[0].number')
    echo "/review-issue $pr"

  append_system_prompt: |
    You are running non-interactively. Your scope for this run is strictly
    review-and-comment: read the PR, post review feedback via `gh pr review`,
    then stop. Do NOT merge, do NOT push, do NOT hand off to other skills.
    If the skill suggests merging, skip that step and exit.

  allowed_tools:
    - "Bash(gh pr view*)"
    - "Bash(gh pr list*)"
    - "Bash(gh pr diff*)"
    - "Bash(gh pr checks*)"
    - "Bash(gh issue view*)"
    - "Bash(gh pr review*)"
    - "Bash(gh pr comment*)"
    - "Bash(gh api*)"
    - "Bash(git log*)"
    - "Bash(git show*)"
    - "Bash(git diff*)"
    - "Bash(git blame*)"
    - "Read"
    - "Grep"

  permission_mode: auto

cwd: "."
timeout: 10m

logging:
  retention_days: 30
```

**Deliberately excluded:** `Edit`, `Write`, `Bash(git push*)`, `Bash(gh pr merge*)`, `Bash(gh pr close*)`, `Skill`, `Agent`. Defense-in-depth with the `append_system_prompt` scope constraint.

## 11. Testing

- **Framework:** `bun test`.
- **Unit tests:** zod schema validation (including prompt XOR constraint), cron line rendering, duration parsing, crontab block splicing.
- **Integration tests:** full `run` flow against a **mock `claude`** binary — a shell script on `PATH` that prints canned JSON output and exits with a configured code. Covers: happy path, preflight skip, overlap skip, timeout, abandoned sweep, config error, subscription vs api_key argv.
- **No real claude calls in CI.** A separate manual smoke test procedure is documented in the README.

## 12. Phase 1 Explicit Non-Goals

| Out of scope | Why |
|---|---|
| Web UI | Phase 2. |
| Alerting / hooks | Phase 3. DB is designed for Phase 2 to read, Phase 3 to extend. |
| Retries | A failed run logs; next cron fire tries again. Simpler, harder to make worse. |
| Multi-machine | All state is local files + local SQLite. |
| Secret vaults | Single `~/.claude-cron/secrets.env`. |
| systemd timers | Future drop-in behind `sync` abstraction. |
| Merge/handoff from review-issue | Deliberate human action; Phase 1 stays review-only. |

## 13. Open Questions

None blocking. Implementation-time decisions (commander vs yargs, exact npm packages for YAML/cron parsing) are captured as remarks, not architectural choices.
