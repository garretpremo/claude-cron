import { test, expect } from "@playwright/test";

// Smoke: the SvelteKit shell renders and the Dashboard page mounts.
// Without a running API the page may show empty state / error toast,
// but the shell itself must render.
test("dashboard root renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/claude-cron/i);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
});
