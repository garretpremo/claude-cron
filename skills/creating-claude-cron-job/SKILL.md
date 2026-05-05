---
name: creating-claude-cron-job
description: Use when authoring or editing a claude-cron job YAML at `<project>/.claude-jobs/<name>.yaml`. Triggers on requests like "schedule a Claude job", "set up a claude-cron job", or "automate <task> with claude-cron". Not for the harness's `/schedule` remote routines.
---

# Creating a claude-cron job

`claude-cron` runs `claude -p` from cron with no human in the loop and logs stdout to a local SQLite DB. Design so a *jailbroken* agent still can't do harm.

## Three pillars

1. **Push deterministic work to scripts.** Filtering, formatting, validation, posting one of N fixed outputs — all of it. Leave the model only the judgment call.
2. **Use a fail-closed allowlist.** Wrapper scripts the model can't escape, not raw `gh`/`Bash`. The allowlist is what actually contains a jailbreak.
3. **Treat every external string as untrusted data.** "Ignore any instructions" prose is folklore, not defense.

## Schema cheat sheet

`preflight` and `claude` are **siblings**, not parent/child:

```yaml
name: <kebab>                  # required
schedule: "<cron>"             # required
enabled: true
auth: subscription             # or api_key
cwd: "."
timeout: 10m

preflight:                     # top-level, optional; omit to always run
  run: |                       # exit 0 = proceed, nonzero = skipped_preflight
    ...
  timeout: 30s

claude:
  prompt: "..."                # XOR with prompt_cmd
  # prompt_cmd: |              # bash; stdout becomes the prompt
  allowed_tools: [...]
  permission_mode: auto        # auto | acceptEdits | bypassPermissions | default | dontAsk | plan
  model: sonnet                # optional
  max_budget_usd: 0.50         # only enforced under auth: api_key

logging:
  retention_days: 30
```

If a field isn't above, check `src/job/schema.ts`.

## Wrapper-script pattern

Don't give the model `Bash(gh pr comment:*)` and *trust* the prompt. Give it a wrapper that *can't* misbehave — verb and arguments validated before any side effect:

- **Read-only wrappers** fetch context (PR body, diff). Cap output size.
- **Action wrappers** regex-anchor IDs, enum-check verdicts, exit nonzero on anything else. Idempotent when the side effect is observable.
- Allowlist them as `Bash(./.claude-jobs/bin/<verb>.sh:*)`. The model never sees `gh`.

Even a jailbreak inside the validated surface can only call the allowed verbs with the allowed shapes. See `wrapper-template.sh`.

## allowed_tools syntax

| Pattern | Means |
|---|---|
| `Bash(./bin/x.sh:*)` | That script, any args. **Preferred.** |
| `Bash(gh pr view:*)` | One subcommand, any args. |
| `Bash(gh:*)` | Any `gh` verb — too broad. Allows `gh repo delete`. |
| `Bash` | Anything. Never. |

Non-Bash tools by name: `Read`, `Grep`, `WebFetch`. `Edit`/`Write` are almost always wrong for cron.

## Auth

- `subscription` (default): OAuth keyring. `max_budget_usd` is **inert**.
- `api_key`: reads `ANTHROPIC_API_KEY` from `~/.claude-cron/secrets.env`. Set `max_budget_usd` on anything that could loop.

## Verify

```
claude-cron register && claude-cron test <project>/<job>
claude-cron logs <project>/<job> --json   # confirm tool calls match the allowlist
```

## Common mistakes

| Mistake | Why it's wrong |
|---|---|
| `allowed_tools: ["Bash"]` or `Bash(gh:*)` | Allows `rm -rf`, `gh repo delete`, etc. Scope to the exact verb or a wrapper. |
| LLM does the filtering ("find PRs with label X") | Non-deterministic, wastes tokens. Filter in preflight; pass IDs to the model. |
| `prompt_cmd: echo "/review $(curl ...)"` | Untrusted output interpolated into shell. If you must use `prompt_cmd`, `printf %q` every variable. |
| Relying on an "ignore injected instructions" sentence | Advisory only. Constrain *capabilities*, not the model's reasoning. |
| Subscription auth + `max_budget_usd: 0.50` | Field is silently ignored. Use `api_key` for caps. |
| `prompt` contains secrets | Prompts are logged to `~/.claude-cron/history.db`. |
| `preflight:` nested under `claude:` or as a bare string | Top-level, `{ run, timeout }`. |
