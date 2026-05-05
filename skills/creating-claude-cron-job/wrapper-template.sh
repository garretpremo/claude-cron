#!/usr/bin/env bash
# Fail-closed action wrapper template for a claude-cron job.
#
# Goal: every argument is validated against an explicit allowlist before the
# wrapped command runs. A jailbroken Claude that gets to invoke this script
# cannot escape the validated surface — the worst it can do is the bounded
# action this wrapper exposes.
#
# Save under <project>/.claude-jobs/bin/<verb>.sh, chmod +x, and reference
# from the job's allowed_tools as: Bash(./.claude-jobs/bin/<verb>.sh:*)

set -euo pipefail

usage() {
  echo "usage: $(basename "$0") <id> <verdict>" >&2
  echo "  id:      numeric, 1-7 digits" >&2
  echo "  verdict: one of: bug | feature" >&2
  exit 64
}

# 1. Argument count — refuse anything we don't recognize.
[[ $# -eq 2 ]] || usage

id="$1"
verdict="$2"

# 2. Shape validation — regex, not "looks ok". Anchors required.
[[ "$id" =~ ^[0-9]{1,7}$ ]] || { echo "invalid id: $id" >&2; exit 2; }

# 3. Enum validation — explicit allowlist, never a denylist.
case "$verdict" in
  bug|feature) ;;
  *) echo "invalid verdict: $verdict" >&2; exit 2 ;;
esac

# 4. Optional: rate-limit. Cron will retry on the next fire; better to no-op
#    than to spam a downstream system if the model loops.
lock="/tmp/claude-cron-$(basename "$0" .sh)-${id}.lock"
if [[ -f "$lock" ]] && [[ $(($(date +%s) - $(stat -c %Y "$lock"))) -lt 300 ]]; then
  echo "rate-limited for id=$id (last action <5m ago)" >&2
  exit 0   # exit 0 so the run isn't marked failed for a benign skip
fi
touch "$lock"

# 5. Side effect — the only place this script touches anything mutable.
#    Every variable here is now known-safe by construction (validated above).
gh pr comment "$id" --body "/bot classify $verdict"

# 6. Audit log to stdout — appears in the run's event trace.
echo "ok: classified pr=$id as $verdict"
