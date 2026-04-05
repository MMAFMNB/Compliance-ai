import { expect } from "@playwright/test";
import { test } from "./auth.setup";

test.describe("Admin Page (authenticated)", () => {
  test("renders the admin panel", async ({ authedPage: page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/login/);
    await expect(
      page.locator("text=إدارة النظام").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows firms tab with firm data", async ({ authedPage: page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    // Firms tab is default; should show mock firm
    await expect(
      page.locator("text=TAM Capital").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("has tab navigation with multiple tabs", async ({ authedPage: page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    // Should see tab labels
    await expect(page.locator("text=الشركات").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=المستخدمون").first()).toBeVisible({ timeout: 10_000 });
  });

  test("can switch to users tab", async ({ authedPage: page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");

    // Click Users tab
    await page.locator("text=المستخدمون").first().click();

    // Should show user data
    await expect(
      page.locator("text=admin@tamcapital.com").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
