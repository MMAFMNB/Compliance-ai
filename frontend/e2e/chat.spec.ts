import { expect } from "@playwright/test";
import { test } from "./auth.setup";

test.describe("Chat Page (authenticated)", () => {
  test("renders the chat interface with sidebar", async ({ authedPage: page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Should NOT redirect to login
    await expect(page).not.toHaveURL(/\/login/);

    // Sidebar should be visible
    await expect(page.locator("text=محادثة جديدة").first()).toBeVisible({ timeout: 10_000 });

    // Header should show
    await expect(page.getByRole("heading", { name: "الاستشارات التنظيمية" })).toBeVisible();
  });

  test("shows welcome screen with suggestion cards", async ({ authedPage: page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Welcome heading
    await expect(page.locator("text=تام للامتثال التنظيمي").first()).toBeVisible({ timeout: 10_000 });

    // Suggestion cards should be visible
    await expect(page.locator("text=صناديق الاستثمار").first()).toBeVisible();
    await expect(page.locator("text=مكافحة غسل الأموال").first()).toBeVisible();
  });

  test("has a chat input area", async ({ authedPage: page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Chat textarea should exist
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 10_000 });
  });

  test("can type a message in the chat input", async ({ authedPage: page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const textarea = page.locator("textarea");
    await textarea.waitFor({ state: "visible", timeout: 10_000 });
    await textarea.fill("ما هي متطلبات الامتثال؟");
    await expect(textarea).toHaveValue("ما هي متطلبات الامتثال؟");
  });

  test("clicking a suggestion card populates the chat", async ({ authedPage: page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for welcome screen
    await page.locator("text=صناديق الاستثمار").first().waitFor({ state: "visible", timeout: 10_000 });

    // Click a suggestion card
    await page.locator("text=ما هي متطلبات تأسيس صندوق استثمار خاص؟").click();

    // The user message should appear in the chat
    await expect(page.locator("text=ما هي متطلبات تأسيس صندوق استثمار خاص؟").first()).toBeVisible();
  });
});
