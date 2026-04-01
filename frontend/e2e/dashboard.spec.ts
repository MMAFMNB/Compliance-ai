import { expect } from "@playwright/test";
import { test } from "./auth.setup";

test.describe("Dashboard (authenticated)", () => {
  test("renders dashboard with stats", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Should not redirect to login
    await expect(page).not.toHaveURL(/\/login/);

    // Dashboard heading
    await expect(page.locator("text=لوحة المتابعة").first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows audit log entries", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Audit log entry from mock data
    await expect(
      page.locator("text=استشارة حول متطلبات الصناديق").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("has back button to home", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Back button with aria-label
    const backBtn = page.getByLabel("Back to chat");
    await expect(backBtn).toBeVisible({ timeout: 10_000 });
  });
});
