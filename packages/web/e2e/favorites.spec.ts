import { test, expect } from "@playwright/test";

// Smoke: Dashboard renders. Real favorites persistence is exercised by the
// backend integration tests at packages/server/test/integration/api.test.ts;
// a true end-to-end click test requires booting the API alongside the
// preview server with a seeded DB. TODO: wire the seeded API + real click.
test("dashboard mounts (favorites smoke)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
});
