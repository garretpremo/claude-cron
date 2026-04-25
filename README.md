# claude-cron

> **Status: alpha (`v0.1.0-alpha`)** — Linux-tested only. Single-user, single-machine. Dashboard has no authentication. No security audit. Useful, but expect rough edges. See [Alpha gotchas](#alpha-gotchas) before relying on this.

Run Claude Code (`claude -p`) non-interactively on a schedule, with isolation guarantees that `/loop` doesn't provide:

- **Fresh context per run** — no accumulated conversation state between fires.
- **Scoped tools** — narrow `--allowed-tools` whitelist per job.
- **Budget-bounded** — `--max-budget-usd` for API-key jobs.
- **Preflight gate** — skip the LLM call entirely when there's nothing to do (exit-code contract).
- **OS-level scheduling** — `crontab -l` is the source of truth; survives reboots; no daemon process to keep alive.
- **Token & cost recorded per run** — pulled straight from claude's `result` event, queryable in the local SQLite DB.

Jobs are colocated with the project they automate (`<project>/.claude-jobs/*.yaml`). Multiple projects supported via a central registry. A small local web dashboard shows run history, lets you trigger or stop runs, and live-tails event streams.

## Who is this for

You write skills/agents for Claude Code and want some of them to run on a schedule — review open PRs every 15 minutes, sweep stale tickets nightly, etc. — without sitting at a terminal running `/loop`. You're comfortable on the Linux command line, comfortable with `crontab`, and OK with running a local-only tool that hasn't been hardened for shared environments.

If you want a hosted scheduler, multi-user access, or an alerting/incident system, this isn't it (and may never be).

## Prerequisites

- **[Bun](https://bun.sh) ≥ 1.1** — runtime and test runner. There is no Node.js fallback; the code uses `bun:sqlite` and `Bun.serve`.
- **`claude` CLI on `PATH`** — i.e. Claude Code installed and working.
- **`cron`** — Linux-tested; macOS likely works for the CLI itself but the keyring-from-cron path (subscription auth) is unverified. See [Alpha gotchas](#alpha-gotchas).
- **`gh` CLI** — optional, only if your jobs invoke it.

## Install

There is no npm/Homebrew package yet. Install from source:

```bash
git clone https://github.com/garretpremo/claude-cron ~/projects/claude-cron
cd ~/projects/claude-cron
bun install
bun run install:global   # symlinks src/cli.ts into ~/.bun/bin/claude-cron
claude-cron --help
```

The CLI runs directly from `src/cli.ts` via the `#!/usr/bin/env bun` shebang — no build step needed.

## First-time setup

```bash
claude-cron init
```

Creates `~/.claude-cron/{projects.toml,global/,locks/,history.db,secrets.env}` and writes a prelude block to your user crontab with `PATH`, `HOME`, `SHELL`, `DBUS_SESSION_BUS_ADDRESS`, `XDG_RUNTIME_DIR` (the last two are required for OAuth keyring access from cron on Linux).

## Define a job

Create `<your-project>/.claude-jobs/<name>.yaml`:

```yaml
name: my-job
description: Do the thing
schedule: "*/30 * * * *"
enabled: true
auth: subscription            # or api_key

preflight:                    # optional; exit 0 = proceed, nonzero = skip
  run: |
    gh pr list --repo me/myrepo --state open --json number --jq 'length > 0'
  timeout: 30s

claude:
  # exactly one of prompt | prompt_cmd
  prompt: "/some-skill"
  # prompt_cmd: |
  #   pr=$(gh pr list ...)
  #   echo "/review-issue $pr"

  allowed_tools:
    - "Bash(gh *)"
    - "Read"
    - "Grep"
  permission_mode: auto
  # agent: my-agent
  # model: sonnet
  # append_system_prompt: "Do not X."
  # max_budget_usd: 0.50        # only meaningful with auth: api_key
  # extra_args: ["--effort", "high"]

cwd: "."                        # relative to project root
timeout: 10m
logging:
  retention_days: 30
```

## Register and sync

```bash
cd ~/projects/my-project
claude-cron register
claude-cron list
claude-cron sync --dry-run      # preview crontab change
claude-cron sync                # write the managed block
crontab -l                      # verify
```

`sync` is scoped per-project — it rewrites exactly one block (`# BEGIN claude-cron:<project>` / `# END claude-cron:<project>`). `sync --global` rewrites the `global` block only. Lines outside managed blocks are never touched.

## Run jobs manually

```bash
claude-cron test my-project/my-job         # end-to-end, marks run as is_test
claude-cron run my-project/my-job          # what cron invokes
claude-cron logs my-project/my-job         # run history
claude-cron logs my-project/my-job --tail  # follow most recent run
claude-cron logs my-project/my-job --json  # full event trace
```

Bare job names work when `cwd` is inside a registered project:

```bash
cd ~/projects/my-project
claude-cron run my-job
```

## Health check

```bash
claude-cron status
```

Reports registered projects, abandoned runs, recent failures, crontab prelude health.

## Dashboard

A local web UI for browsing run history, triggering jobs, stopping runs, and live-tailing event streams.

```bash
claude-cron serve                     # binds 127.0.0.1:8787 by default
claude-cron serve --port 9000
```

Open `http://127.0.0.1:8787`. Two views, toggleable in the top bar (or press `v`):

- **Activity** — recent runs table with filters, auto-refreshes every 5 seconds. Consecutive `skipped_preflight` runs from the same job collapse into a single row with a count.
- **Config** — project → jobs tree + detail panel with enable/disable + Run-now actions.

Click any run to open a side pane with the event trace, token usage, and cost. Running runs show a live tail via SSE.

> **Security note.** The dashboard has **no authentication**. By default it binds `127.0.0.1` only. Binding to anything else requires `--allow-public` *and* trust that no untrusted user can reach the host — anyone who can hit the port can trigger or stop jobs.

## Auth modes

- **`subscription` (default)** — uses your existing OAuth session via the OS keyring. Works from cron because `init` exported `DBUS_SESSION_BUS_ADDRESS` + `XDG_RUNTIME_DIR` into the prelude. `max_budget_usd` is inert in this mode. The reported `cost_usd` is API-equivalent (notional), not a real charge.
- **`api_key`** — set `ANTHROPIC_API_KEY` in `~/.claude-cron/secrets.env` (file mode 0600). Executor adds `--bare` so the key is the only credential used. `max_budget_usd` is enforced.

## Token & cost tracking

Every successful run records (from claude's terminal `result` event):

- `cost_usd` — total cost reported by the CLI. On subscription this is API-equivalent and not billed.
- `input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens` — usage breakdown.

These are exposed in the dashboard side pane and via `claude-cron logs --json`. Treat tokens as the source of truth for what a run consumed.

## Lifecycle notes

- **Overlapping runs** — `flock` lockfile at `~/.claude-cron/locks/<project>--<job>.lock`. Second fire while the first is running → `status = skipped_overlap`; claude is not invoked.
- **Abandoned runs** — every `run` starts by sweeping `runs` rows with `status=running` older than `max(2 × timeout, 1h)` → `status = abandoned`. Handles SIGKILL, power loss, OOM killer.
- **Retention** — every successful/failed/timeout/interrupted terminal calls `deleteOldRuns(project, job, cutoff)` where `cutoff = now - logging.retention_days × 1d`. Note: retention does **not** fire on `skipped_*` or `config_error` paths — a job that *only* preflight-skips will accumulate rows. See [Alpha gotchas](#alpha-gotchas).
- **Child process death** — the claude subprocess goes away when the runner does (default Bun spawn semantics).

## Alpha gotchas

The project works for the author's daily use, but the following are real and worth knowing before you depend on it:

- **Linux-only verified.** The cron-prelude trick (`DBUS_SESSION_BUS_ADDRESS` + `XDG_RUNTIME_DIR`) is a Linux/freedesktop-keyring workaround. macOS likely needs a different approach for subscription auth from cron — untested. `api_key` mode should work on macOS.
- **Dashboard has no auth.** Default bind is `127.0.0.1`; non-loopback requires `--allow-public` and is gated with a warning, but there is still no token, no login, no rate-limit.
- **Bun-only runtime.** No Node.js fallback. If you don't already use Bun, you'll need to install it.
- **Install is `git clone` + symlink.** No npm package, no Homebrew tap, no precompiled binary. Updates mean `git pull && bun install`.
- **State directory is hardcoded** to `~/.claude-cron/`. `XDG_CONFIG_HOME` / `XDG_DATA_HOME` are not honored.
- **Single-machine.** All state (registry, history DB, locks) is local. There is no clustering, no remote DB, no leader election.
- **No retries.** A failed run is logged; the next scheduled fire is its retry. There is no exponential backoff, no max-retry config.
- **No alerting / notifications.** You'll only know a job failed if you check the dashboard, run `claude-cron status`, or your job itself notifies (e.g. posts to Slack).
- **`prompt_cmd` is shell-evaluated.** Job YAML files are effectively code — anyone who can write to `<project>/.claude-jobs/*.yaml` can run arbitrary shell on your machine at the next fire. Don't accept job files from untrusted sources.
- **Retention only sweeps on post-claude terminal states.** Jobs that exclusively preflight-skip will accumulate rows indefinitely. The per-row weight is tiny (~155 B including events), so this is cosmetic until the row count is in the millions, but it's a real gap in the contract.
- **Subscription `cost_usd` is notional.** It's the equivalent API spend computed from token usage — not a charge against your subscription.
- **Schema migrations are forward-only.** No down-migrations. If you downgrade `claude-cron`, you'll need to either keep the newer schema or drop the DB.
- **Phase 1 limitations** carried into alpha: no web push notifications, no multi-machine sync, no built-in retries, no observability beyond local logs.

If any of these are showstoppers for your use case, this isn't the right tool yet.

## Manual smoke tests

### Basic end-to-end

```bash
mkdir -p /tmp/cc-smoke/proj/.claude-jobs
cat > /tmp/cc-smoke/proj/.claude-jobs/echo.yaml <<'YAML'
name: echo
schedule: "*/5 * * * *"
enabled: true
preflight: { run: "exit 0", timeout: 5s }
claude:
  prompt_cmd: "echo /echo hello"
  allowed_tools: ["Read"]
  permission_mode: auto
cwd: "."
timeout: 1m
logging: { retention_days: 1 }
YAML
cd /tmp/cc-smoke/proj
claude-cron register
claude-cron list
claude-cron sync --dry-run
claude-cron test proj/echo           # invokes real claude once
claude-cron logs proj/echo
```

### Stop a running job from the dashboard

In one terminal, create a job that blocks until signaled:

```bash
mkdir -p /tmp/cc-stop-smoke/.claude-jobs
cat > /tmp/cc-stop-smoke/.claude-jobs/sleepy.yaml <<'EOF'
name: sleepy
schedule: "*/5 * * * *"
enabled: true
claude:
  prompt: "hi"
  allowed_tools: []
  permission_mode: auto
  extra_args: ["--block"]
cwd: "."
timeout: 5m
logging: { retention_days: 1 }
EOF
cd /tmp/cc-stop-smoke && claude-cron register
claude-cron test cc-stop-smoke/sleepy &
```

In another terminal: open `http://127.0.0.1:8787`, find the running row in Activity, click `■ stop`. Status should transition to `interrupted`.

## Development

```bash
bun test                 # ~95 tests
bun test test/foo.test.ts -t "pattern"   # single file / test
bun run typecheck        # tsc --noEmit
bun run build            # bundle to dist/claude-cron.js (not needed for local dev)
```

CI runs `bun test` + `bun run typecheck` on every push and PR to `main` (`.github/workflows/ci.yml`).

## Project layout

- `docs/specs/`, `docs/plans/` — design docs (Phase 1 + Phase 2). Authoritative for executor / scheduling / DB semantics.
- `src/cli.ts` + `src/commands/` — Commander dispatch, one subcommand per file.
- `src/executor/` — the run state machine. All run lifecycle invariants live in `run.ts`.
- `src/cron/` — managed crontab block render + splice.
- `src/db/` — SQLite schema, migrations, queries.
- `src/job/` — Zod schema, registry, YAML loader.
- `src/server/` — dashboard (Bun.serve + static SPA in `public/`).
- `test/` — `bun:test` suites.
- `CLAUDE.md` — guidance for AI assistants working in this repo.

## License

[MIT](./LICENSE) © 2026 Garret Premo
