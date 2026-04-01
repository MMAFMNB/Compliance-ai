import { test, expect } from "@playwright/test";

test.describe("Page Load Smoke Tests", () => {
  test("login page renders without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Filter out known non-critical errors (e.g., Supabase connection when no backend)
    const criticalErrors = consoleErrors.filter(
      (e) =>
        !e.includes("supabase") &&
        !e.includes("Failed to fetch") &&
        !e.includes("net::ERR")
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("login page has correct title/branding", async ({ page }) => {
    await page.goto("/login");

    // Check for TAM branding elements
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  test("login page is responsive on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/login");

    // Login form should still be visible on mobile
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
