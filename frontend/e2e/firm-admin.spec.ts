import { expect } from "@playwright/test";
import { test } from "./auth.setup";

test.describe("Firm Admin Page (authenticated)", () => {
  test("renders the firm admin panel", async ({ authedPage: page }) => {
    await page.goto("/firm-admin");
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/login/);
    await expect(
      page.locator("text=إدارة الشركة").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("displays users list", async ({ authedPage: page }) => {
    await page.goto("/firm-admin");
    await page.waitForLoadState("networkidle");

    // Should show users from mock
    await expect(
      page.locator("text=admin@tamcapital.com").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("has invite user button", async ({ authedPage: page }) => {
    await page.goto("/firm-admin");
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator("text=دعوة مستخدم").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows tab navigation", async ({ authedPage: page }) => {
    await page.goto("/firm-admin");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=المستخدمون").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=سجل النشاط").first()).toBeVisible({ timeout: 10_000 });
  });
});
