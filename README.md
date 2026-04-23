# claude-cron

Run Claude Code (`claude -p`) non-interactively on a schedule, with isolation guarantees that `/loop` doesn't provide:

- **Fresh context per run** — no accumulated conversation state between fires
- **Scoped tools** — narrow `--allowed-tools` whitelist per job
- **Budget-bounded** — `--max-budget-usd` for API-key jobs
- **Preflight gate** — skip the LLM call entirely when there's nothing to do (exit-code contract)
- **OS-level scheduling** — `crontab -l` is the source of truth; survives reboots; no daemon

Jobs are colocated with the project they automate (`<project>/.claude-jobs/*.yaml`). Multiple projects supported via a central registry. Run history in SQLite, ready for a future web UI.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- `claude` CLI on `PATH`
- `cron` (Linux/macOS)
- `gh` CLI if your jobs use it

## Install

```bash
cd ~/projects/claude-cron
bun install
chmod +x src/cli.ts
ln -sf "$(pwd)/src/cli.ts" ~/.bun/bin/claude-cron
claude-cron --help
```

## First-time setup

```bash
claude-cron init
```

Creates `~/.claude-cron/{projects.toml,global/,locks/,history.db,secrets.env}` and writes a prelude block to your user crontab with `PATH`, `HOME`, `SHELL`, `DBUS_SESSION_BUS_ADDRESS`, `XDG_RUNTIME_DIR` (the last two are required for OAuth keyring access from cron).

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

`sync` is scoped per-project — rewrites one block (`# BEGIN claude-cron:<project>` / `# END`). `sync --global` rewrites the `global` block only. Never touches lines outside managed blocks.

## Run jobs manually

```bash
claude-cron test my-project/my-job         # end-to-end, marks run as is_test
claude-cron run my-project/my-job          # what cron invokes
claude-cron logs my-project/my-job         # run history
claude-cron logs my-project/my-job --tail  # follow most recent run
claude-cron logs my-project/my-job --json  # full event trace
```

Bare job names work when cwd is in a registered project:

```bash
cd ~/projects/my-project
claude-cron run my-job
```

## Health check

```bash
claude-cron status
```

Reports registered projects, abandoned runs, recent failures, crontab prelude health.

## Auth modes

- **subscription (default)** — uses your existing OAuth session via keyring. Works from cron because `init` wrote `DBUS_SESSION_BUS_ADDRESS` + `XDG_RUNTIME_DIR` to the prelude. `max_budget_usd` is inert.
- **api_key** — set `ANTHROPIC_API_KEY` in `~/.claude-cron/secrets.env` (mode 0600). Executor adds `--bare` so only the key is used. `max_budget_usd` is meaningful.

## Lifecycle notes

- **Overlapping runs** — `flock` lockfile at `~/.claude-cron/locks/<project>--<job>.lock`. Second fire while the first is running → `status = skipped_overlap`; claude not invoked.
- **Abandoned runs** — every `run` starts by sweeping `runs` with `status=running` older than `max(2 × timeout, 1h)` → `status = abandoned`. Handles SIGKILL, power loss, OOM killer.
- **Child process death** — the claude subprocess inherits `PR_SET_PDEATHSIG=SIGKILL` equivalent behavior via spawn semantics, so if the runner dies unexpectedly, the child goes with it.

## Phase 1 limitations

- No web UI (Phase 2).
- No alerting/notifications (Phase 3).
- No retries — failed runs are logged; next scheduled fire retries.
- No multi-machine — all state is local.
- `unregister` leaves an orphan crontab block; `sync` requires the project to still be registered. Workaround: `sync` first with all jobs removed or disabled, then unregister.

## Smoke test (manual)

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

## Project layout

- Spec: `docs/specs/2026-04-22-phase-1-design.md`
- Plan: `docs/plans/2026-04-22-phase-1.md`
- Source: `src/{cli,commands,executor,cron,db,job,util}/`
- Tests: `test/` — 52 tests, `bun test` to run.
