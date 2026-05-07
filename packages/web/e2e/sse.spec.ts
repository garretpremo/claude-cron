import { test } from "@playwright/test";

// SSE live-tail requires:
//   1. claude-cron serve booted alongside the preview server
//   2. a seeded DB containing a `running` run
//   3. a process emitting events to that run
//
// The smoke harness in this directory wires only the preview server.
// TODO: introduce a fixture-API webServer in playwright.config.ts and
// drive a synthetic running run, then assert the `live` indicator and
// streamed event content. For now this spec is a placeholder.
test.skip("SSE live-tail of running run", () => {
  // Placeholder.
});
