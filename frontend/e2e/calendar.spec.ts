import { expect } from "@playwright/test";
import { test } from "./auth.setup";

test.describe("Calendar Page (authenticated)", () => {
  test("renders the compliance calendar", async ({ authedPage: page }) => {
    await page.goto("/calendar");
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/login/);
    await expect(
      page.locator("text=تقويم الالتزام").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows deadline entries from mock data", async ({ authedPage: page }) => {
    await page.goto("/calendar");
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator("text=تقرير الامتثال الربعي").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("displays category filter buttons", async ({ authedPage: page }) => {
    await page.goto("/calendar");
    await page.waitForLoadState("networkidle");

    // Should show "الكل" (All) filter
    await expect(page.locator("text=الكل").first()).toBeVisible({ timeout: 10_000 });
  });
});
