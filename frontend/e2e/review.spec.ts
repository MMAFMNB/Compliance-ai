import { expect } from "@playwright/test";
import { test } from "./auth.setup";

test.describe("Review Page (authenticated)", () => {
  test("renders the document review interface", async ({ authedPage: page }) => {
    await page.goto("/review");
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("text=فحص المستندات").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("shows file upload area", async ({ authedPage: page }) => {
    await page.goto("/review");
    await page.waitForLoadState("networkidle");

    // Upload input should exist (may be hidden, but present in DOM)
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 10_000 });
  });

  test("uploads a PDF and shows review results", async ({ authedPage: page }) => {
    await page.goto("/review");
    await page.waitForLoadState("networkidle");

    // Create a minimal PDF buffer
    const pdfContent = Buffer.from("%PDF-1.4 fake pdf content for testing");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "test-document.pdf",
      mimeType: "application/pdf",
      buffer: pdfContent,
    });

    // Wait for the upload/review button and click it
    const uploadBtn = page.locator("button", { hasText: /فحص|تحليل|رفع|مراجعة/ });
    if (await uploadBtn.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await uploadBtn.first().click();
    }

    // Should show findings from mock data
    await expect(
      page.locator("text=المادة 5").first()
    ).toBeVisible({ timeout: 15_000 });
  });
});
