import { expect } from "@playwright/test";
import { test } from "./auth.setup";

test.describe("Search Page (authenticated)", () => {
  test("renders search interface", async ({ authedPage: page }) => {
    await page.goto("/search");
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/login/);

    // Search input should exist
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
  });

  test("can perform a search and see results", async ({ authedPage: page }) => {
    await page.goto("/search");
    await page.waitForLoadState("networkidle");

    // Type a search query
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    await searchInput.waitFor({ state: "visible", timeout: 10_000 });
    await searchInput.fill("مكافحة غسل الأموال");

    // Submit the search (press Enter or click search button)
    await searchInput.press("Enter");

    // Should show mock search results
    await expect(
      page.locator("text=لائحة مكافحة غسل الأموال").first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
