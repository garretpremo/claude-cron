#!/usr/bin/env bash
# Mock claude for integration tests.
# Env-driven:
#   MOCK_CLAUDE_EXIT       -- exit code (default 0)
#   MOCK_CLAUDE_STDOUT_LINES -- lines to echo on stdout before final JSON
#   MOCK_CLAUDE_COST_USD   -- reported cost (default 0.01)
#   MOCK_CLAUDE_SUMMARY    -- summary text (default "ok")
#   MOCK_CLAUDE_SLEEP_MS   -- sleep before exiting (ms)
set -eu

if [ -n "${MOCK_CLAUDE_STDOUT_LINES:-}" ]; then
  printf '%s\n' "$MOCK_CLAUDE_STDOUT_LINES"
fi

if [ -n "${MOCK_CLAUDE_SLEEP_MS:-}" ]; then
  sleep "$(awk "BEGIN { print $MOCK_CLAUDE_SLEEP_MS / 1000 }")"
fi

cost="${MOCK_CLAUDE_COST_USD:-0.01}"
summary="${MOCK_CLAUDE_SUMMARY:-ok}"
printf '{"cost_usd":%s,"result":"%s"}\n' "$cost" "$summary"

exit "${MOCK_CLAUDE_EXIT:-0}"
