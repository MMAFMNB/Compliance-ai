import { expect } from "@playwright/test";
import { test } from "./auth.setup";

test.describe("DocGen Page (authenticated)", () => {
  test("renders the document generator interface", async ({ authedPage: page }) => {
    await page.goto("/docgen");
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/login/);
    await expect(
      page.locator("text=إعداد المستندات").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows template selection cards", async ({ authedPage: page }) => {
    await page.goto("/docgen");
    await page.waitForLoadState("networkidle");

    // Should show mock templates
    await expect(
      page.locator("text=سياسة مكافحة غسل الأموال").first()
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.locator("text=تقرير الامتثال").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("can select a template and see form fields", async ({ authedPage: page }) => {
    await page.goto("/docgen");
    await page.waitForLoadState("networkidle");

    // Click on a template card
    await page.locator("text=سياسة مكافحة غسل الأموال").first().click();

    // Should show form fields from the template (label)
    await expect(
      page.locator("text=اسم الشركة").first()
    ).toBeVisible({ timeout: 10_000 });

    // English label should also show
    await expect(
      page.locator("text=Company Name").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
