#!/usr/bin/env bash
set -eu

if [ -n "${MOCK_CLAUDE_STDOUT_LINES:-}" ]; then
  printf '%s\n' "$MOCK_CLAUDE_STDOUT_LINES"
fi

if [ -n "${MOCK_CLAUDE_SLEEP_MS:-}" ]; then
  sleep "$(awk "BEGIN { print $MOCK_CLAUDE_SLEEP_MS / 1000 }")"
fi

# Any arg "--block" causes indefinite wait (until signalled).
for arg in "$@"; do
  if [ "$arg" = "--block" ]; then
    # Wait forever (until SIGTERM / SIGKILL). Trap nothing — let default term kill us.
    while true; do sleep 3600; done
  fi
done

cost="${MOCK_CLAUDE_COST_USD:-0.01}"
summary="${MOCK_CLAUDE_SUMMARY:-ok}"
printf '{"cost_usd":%s,"result":"%s"}\n' "$cost" "$summary"

exit "${MOCK_CLAUDE_EXIT:-0}"
