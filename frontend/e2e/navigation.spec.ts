import { test, expect } from "@playwright/test";

test.describe("Navigation & Routing", () => {
  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/");

    // Should redirect to login since user is not authenticated
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page loads without errors", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBe(200);
  });

  test("protected routes redirect to login", async ({ page }) => {
    const protectedRoutes = [
      "/dashboard",
      "/review",
      "/search",
      "/alerts",
      "/calendar",
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      // Should eventually end up at login
      await page.waitForURL(/\/login/, { timeout: 10_000 });
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
