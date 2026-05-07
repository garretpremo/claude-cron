import { test, expect } from "@playwright/test";

// Theme persistence: change scheme on /theme and confirm it survives a
// reload via localStorage at "claude-cron:scheme".
test("theme scheme persists across reload", async ({ page }) => {
  await page.goto("/theme");
  await expect(page.getByRole("heading", { name: "Theme", level: 1 })).toBeVisible();

  // Click "Dark"
  await page.getByRole("button", { name: "Dark", exact: true }).click();

  // Storage write happens client-side; give the runtime a tick.
  await page.waitForFunction(() => {
    return localStorage.getItem("claude-cron:scheme") === "dark";
  });

  await page.reload();
  const stored = await page.evaluate(() => localStorage.getItem("claude-cron:scheme"));
  expect(stored).toBe("dark");
});
