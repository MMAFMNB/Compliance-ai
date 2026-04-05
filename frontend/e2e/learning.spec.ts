import { expect } from "@playwright/test";
import { test } from "./auth.setup";

test.describe("Learning Page (authenticated)", () => {
  test("renders the learning interface", async ({ authedPage: page }) => {
    await page.goto("/learning");
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/login/);
  });

  test("shows tab navigation", async ({ authedPage: page }) => {
    await page.goto("/learning");
    await page.waitForLoadState("networkidle");

    // Should have tabs - Overview is default
    await expect(
      page.locator("text=Overview").first()
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.locator("text=Knowledge Base").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("displays overview with approval rate", async ({ authedPage: page }) => {
    await page.goto("/learning");
    await page.waitForLoadState("networkidle");

    // Should show the overall approval rate from mock (87%)
    await expect(
      page.locator("text=Overall Approval Rate").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
