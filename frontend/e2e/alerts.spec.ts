import { expect } from "@playwright/test";
import { test } from "./auth.setup";

test.describe("Alerts Page (authenticated)", () => {
  test("renders alerts list", async ({ authedPage: page }) => {
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/login/);

    // Should show the mocked alert
    await expect(
      page.locator("text=تحديث لائحة صناديق الاستثمار").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("displays alert source", async ({ authedPage: page }) => {
    await page.goto("/alerts");
    await page.waitForLoadState("networkidle");

    // Source from mock data
    await expect(page.locator("text=CMA").first()).toBeVisible({ timeout: 10_000 });
  });
});
