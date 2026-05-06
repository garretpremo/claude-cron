import { test, expect } from "@playwright/test";

// Smoke: deep-linking ?run=123 on a job page mounts the RunPopover dialog.
// Without a real API the popover will show a loading or error state, but
// the dialog element itself should render.
test("run popover deep link mounts", async ({ page }) => {
  await page.goto("/projects/demo/jobs/hello?run=1");
  // Activity page also accepts ?run= — exercise it too.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
});

test("run popover deep link from activity page", async ({ page }) => {
  await page.goto("/activity?run=1");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
});
