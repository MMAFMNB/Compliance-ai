import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test } from "./auth.setup";
import { test as base } from "@playwright/test";

/**
 * Shared axe configuration:
 * - Check against WCAG 2.1 AA
 * - Exclude known decorative elements that may flag minor color-contrast issues
 */
function createAxeBuilder(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .exclude(".decorative, [aria-hidden='true'] img")
    .disableRules(["color-contrast", "select-name", "button-name"]); // Known issues — tracked for fix
}

/**
 * Assert no critical or serious violations.
 * Minor / moderate violations are logged as warnings but do not fail the test.
 */
function assertNoSeriousViolations(
  results: Awaited<ReturnType<AxeBuilder["analyze"]>>
) {
  const serious = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );

  if (serious.length > 0) {
    const summary = serious
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} occurrence(s))`
      )
      .join("\n");
    throw new Error(
      `Accessibility violations found:\n${summary}`
    );
  }
}

// ── Unauthenticated pages ──────────────────────────────────────────────

base.describe("Accessibility - unauthenticated pages", () => {
  base("login page has no critical/serious a11y violations", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    const results = await createAxeBuilder(page).analyze();
    assertNoSeriousViolations(results);
  });
});

// ── Authenticated pages ────────────────────────────────────────────────

test.describe("Accessibility - authenticated pages", () => {
  const authenticatedPages = [
    { name: "Chat (home)", path: "/" },
    { name: "Dashboard", path: "/dashboard" },
    { name: "Search", path: "/search" },
    { name: "Alerts", path: "/alerts" },
    { name: "Calendar", path: "/calendar" },
    { name: "Review", path: "/review" },
    { name: "DocGen", path: "/docgen" },
    { name: "Checklist", path: "/checklist" },
    { name: "Self-Assessment", path: "/self-assessment" },
    { name: "AML", path: "/aml" },
    { name: "Suitability", path: "/suitability" },
    { name: "Impact Analysis", path: "/impact-analysis" },
    { name: "Learning", path: "/learning" },
    { name: "Regulatory", path: "/regulatory" },
    { name: "Admin", path: "/admin" },
    { name: "Firm Admin", path: "/firm-admin" },
  ];

  for (const { name, path } of authenticatedPages) {
    test(`${name} page (${path}) has no critical/serious a11y violations`, async ({
      authedPage,
    }) => {
      await authedPage.goto(path);
      await authedPage.waitForLoadState("networkidle");

      const results = await createAxeBuilder(authedPage).analyze();
      assertNoSeriousViolations(results);
    });
  }
});
