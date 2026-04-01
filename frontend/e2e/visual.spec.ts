import { expect } from "@playwright/test";
import { test } from "./auth.setup";
import { test as base } from "@playwright/test";

const SCREENSHOT_OPTIONS = {
  fullPage: true,
  maxDiffPixelRatio: 0.05,
};

// ── Unauthenticated pages ──────────────────────────────────────────────

base.describe("Visual regression - unauthenticated pages", () => {
  base("login page matches baseline", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("login.png", SCREENSHOT_OPTIONS);
  });
});

// ── Authenticated pages ────────────────────────────────────────────────

test.describe("Visual regression - authenticated pages", () => {
  test("chat welcome screen matches baseline", async ({ authedPage }) => {
    await authedPage.goto("/");
    await authedPage.waitForLoadState("networkidle");

    await expect(authedPage).toHaveScreenshot(
      "chat-welcome.png",
      SCREENSHOT_OPTIONS
    );
  });

  test("dashboard matches baseline", async ({ authedPage }) => {
    await authedPage.goto("/dashboard");
    await authedPage.waitForLoadState("networkidle");

    await expect(authedPage).toHaveScreenshot(
      "dashboard.png",
      SCREENSHOT_OPTIONS
    );
  });

  test("alerts page matches baseline", async ({ authedPage }) => {
    await authedPage.goto("/alerts");
    await authedPage.waitForLoadState("networkidle");

    await expect(authedPage).toHaveScreenshot(
      "alerts.png",
      SCREENSHOT_OPTIONS
    );
  });
});
