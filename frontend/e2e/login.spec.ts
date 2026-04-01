import { test, expect } from "@playwright/test";

test.describe("Login Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("renders the login form", async ({ page }) => {
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("can toggle between signin and signup", async ({ page }) => {
    // Click the "حساب جديد" tab
    await page.getByText("حساب جديد").click();

    // Name and organization fields should appear
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#organization")).toBeVisible();
  });

  test("shows error on empty form submission", async ({ page }) => {
    // Click the submit button
    await page.locator('button[type="submit"]').click();

    // Browser should enforce required validation — email stays visible, no navigation
    await expect(page.locator("#email")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("password toggle shows and hides password", async ({ page }) => {
    const passwordInput = page.locator("#password");
    await passwordInput.fill("test123");

    // Should be password type initially
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Click the show/hide password button (has aria-label)
    await page.getByLabel("Show password").click();
    await expect(passwordInput).toHaveAttribute("type", "text");

    // Toggle back
    await page.getByLabel("Hide password").click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("can type email and password", async ({ page }) => {
    await page.locator("#email").fill("test@example.com");
    await page.locator("#password").fill("password123");

    await expect(page.locator("#email")).toHaveValue("test@example.com");
    await expect(page.locator("#password")).toHaveValue("password123");
  });
});
