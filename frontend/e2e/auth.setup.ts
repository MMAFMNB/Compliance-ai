import { test as base, Page } from "@playwright/test";

const SUPABASE_URL = "https://tggthesofnqdidjwvwgb.supabase.co";
const API_URL = "http://localhost:8000";

/** Fake user/session data that Supabase client expects */
const fakeUser = {
  id: "e2e-test-user-id-00000000",
  aud: "authenticated",
  role: "authenticated",
  email: "test@tamcapital.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { name: "Test User" },
  identities: [],
};

const fakeSession = {
  access_token: "e2e-fake-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: "e2e-fake-refresh-token",
  user: fakeUser,
};

/**
 * Mock all Supabase auth endpoints and backend API calls so
 * the app thinks a user is logged in without needing real credentials.
 */
export async function mockAuth(page: Page) {
  // Intercept ALL Supabase auth endpoints
  await page.route(`${SUPABASE_URL}/auth/v1/**`, (route) => {
    const url = route.request().url();

    if (url.includes("/token")) {
      // Token refresh or grant
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fakeSession),
      });
    }

    if (url.includes("/user")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fakeUser),
      });
    }

    // Any other auth endpoint
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fakeSession),
    });
  });

  // Mock backend profile endpoint
  await page.route(`${API_URL}/api/auth/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: fakeUser.id,
        email: fakeUser.email,
        name: "Test User",
        organization: "TAM Capital",
        role: "compliance_officer",
      }),
    });
  });

  // Mock conversations list
  await page.route(`${API_URL}/api/conversations`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else {
      route.continue();
    }
  });

  // Mock dashboard stats
  await page.route(`${API_URL}/api/dashboard/stats`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total_conversations: 12,
        total_messages: 48,
        total_documents: 5,
        total_chunks: 320,
        total_reviews: 3,
        total_alerts: 7,
        unread_alerts: 2,
        recent_topics: ["صناديق الاستثمار", "مكافحة غسل الأموال"],
      }),
    });
  });

  // Mock dashboard audit log (page expects { entries: [...] })
  await page.route(`${API_URL}/api/dashboard/audit*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        entries: [
          {
            id: "1",
            type: "conversation",
            summary: "استشارة حول متطلبات الصناديق",
            created_at: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  // Mock alerts (page expects { alerts: [...], unread: N })
  await page.route(`${API_URL}/api/alerts*`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          alerts: [
            {
              id: "alert-1",
              title: "تحديث لائحة صناديق الاستثمار",
              title_en: "Investment Fund Regulation Update",
              source_url: "https://cma.org.sa/example",
              publication_date: new Date().toISOString(),
              doc_type: "circular",
              summary: "تم تحديث متطلبات الإفصاح",
              impact_summary: "تأثير متوسط على صناديق الاستثمار",
              is_read: false,
              created_at: new Date().toISOString(),
            },
          ],
          unread: 1,
        }),
      });
    } else {
      route.continue();
    }
  });

  // Mock search endpoint
  await page.route(`${API_URL}/api/search*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            chunk_id: "chunk-1",
            content:
              "يجب على مؤسسات السوق المالية الالتزام بمتطلبات مكافحة غسل الأموال",
            article_number: "المادة 5",
            part: "الباب الأول",
            chapter: "الفصل الثاني",
            document_id: "doc-1",
            document_title: "لائحة مكافحة غسل الأموال",
            relevance_score: 0.92,
          },
        ],
      }),
    });
  });

  // Mock chat stream endpoint
  await page.route(`${API_URL}/api/chat/stream`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'data: {"type":"conversation_id","conversation_id":"conv-test-1"}',
        'data: {"type":"token","content":"مرحباً، "}',
        'data: {"type":"token","content":"كيف يمكنني مساعدتك؟"}',
        'data: {"type":"done"}',
        "",
      ].join("\n\n"),
    });
  });

  // Mock logout
  await page.route(`${API_URL}/api/auth/logout`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  // Inject fake Supabase session into localStorage BEFORE any JS runs.
  // Supabase JS v2 uses key: sb-<project-ref>-auth-token
  await page.addInitScript(
    ({ session }) => {
      const storageKey = "sb-tggthesofnqdidjwvwgb-auth-token";
      // Supabase v2 stores the full session object directly
      localStorage.setItem(storageKey, JSON.stringify(session));
    },
    { session: fakeSession }
  );
}

/** Extended test fixture with authentication */
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await mockAuth(page);
    await use(page);
  },
});

export { fakeUser, fakeSession };
