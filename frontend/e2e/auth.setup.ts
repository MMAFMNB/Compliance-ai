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

  // Mock calendar deadlines (returns { deadlines: [...] })
  await page.route(`${API_URL}/api/calendar/deadlines*`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          deadlines: [
            {
              id: "dl-1",
              title: "تقرير الامتثال الربعي",
              title_en: "Quarterly Compliance Report",
              category: "quarterly_report",
              deadline_date: new Date(Date.now() + 7 * 86400000).toISOString(),
              status: "pending",
              description: null,
              notes: null,
              cma_reference: null,
              created_at: new Date().toISOString(),
            },
            {
              id: "dl-2",
              title: "تقرير مكافحة غسل الأموال السنوي",
              title_en: "Annual AML Report",
              category: "annual_report",
              deadline_date: new Date(Date.now() - 2 * 86400000).toISOString(),
              status: "completed",
              description: null,
              notes: "تم التسليم",
              cma_reference: null,
              created_at: new Date().toISOString(),
            },
          ],
        }),
      });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });

  // Mock checklist requirements (returns { requirements: [...] })
  await page.route(`${API_URL}/api/checklist/requirements*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requirements: [
          {
            id: "req-1",
            category: "governance",
            text_ar: "تعيين مسؤول امتثال مؤهل",
            text_en: "Appoint a qualified Compliance Officer",
            cma_reference: "المادة 42",
          },
          {
            id: "req-2",
            category: "aml_kyc",
            text_ar: "سياسة اعرف عميلك",
            text_en: "KYC Policy",
            cma_reference: "المادة 15",
          },
        ],
      }),
    });
  });

  // Mock checklist assessments (returns { assessments: [...] })
  await page.route(`${API_URL}/api/checklist/assessments`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ assessments: [] }),
    });
  });

  // Mock checklist assessment submission
  await page.route(`${API_URL}/api/checklist/assessment`, (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "assess-1",
          overall_score: 75,
          gap_analysis: "تم تحديد فجوات في مجال الحوكمة",
          remediation_plan: "خطة معالجة الفجوات خلال 90 يوماً",
          category_scores: { governance: 80, aml_kyc: 70 },
        }),
      });
    } else {
      route.continue();
    }
  });

  // Mock self-assessment endpoints (category_scores is an ARRAY)
  await page.route(`${API_URL}/api/assessment/latest`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "sa-1",
        overall_score: 82,
        created_at: new Date().toISOString(),
        category_scores: [
          { category: "الحوكمة", category_en: "Governance", score: 90 },
          { category: "مكافحة غسل الأموال", category_en: "AML/KYC", score: 80 },
          { category: "التقارير", category_en: "Reporting", score: 75 },
          { category: "إدارة العملاء", category_en: "Client Management", score: 85 },
          { category: "إدارة المخاطر", category_en: "Risk Management", score: 78 },
          { category: "العمليات", category_en: "Operations", score: 84 },
        ],
        recommendations: [
          { priority: "high", category: "التقارير", finding: "إجراءات الإبلاغ غير كافية", recommendation: "تحسين إجراءات الإبلاغ" },
          { priority: "medium", category: "مكافحة غسل الأموال", finding: "سياسة قديمة", recommendation: "تحديث سياسة مكافحة غسل الأموال" },
        ],
      }),
    });
  });

  await page.route(`${API_URL}/api/assessment/run`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "sa-2",
        overall_score: 85,
        created_at: new Date().toISOString(),
        category_scores: [
          { category: "الحوكمة", category_en: "Governance", score: 92 },
          { category: "مكافحة غسل الأموال", category_en: "AML/KYC", score: 82 },
          { category: "التقارير", category_en: "Reporting", score: 78 },
          { category: "إدارة العملاء", category_en: "Client Management", score: 88 },
          { category: "إدارة المخاطر", category_en: "Risk Management", score: 80 },
          { category: "العمليات", category_en: "Operations", score: 86 },
        ],
        recommendations: [
          { priority: "medium", category: "التدريب", finding: "نقص التدريب", recommendation: "تعزيز برنامج التدريب" },
        ],
      }),
    });
  });

  await page.route(`${API_URL}/api/assessment/history`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assessments: [
          { id: "sa-1", overall_score: 82, created_at: new Date().toISOString() },
        ],
      }),
    });
  });

  // Mock AML cases (returns { cases: [...] })
  await page.route(`${API_URL}/api/aml/cases*`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cases: [
            {
              id: "aml-1",
              case_number: "AML-2026-001",
              case_type: "unusual_activity",
              status: "open",
              priority: "high",
              subject_name: "Ahmed Mohammed",
              subject_name_ar: "أحمد محمد",
              subject_type: "individual",
              subject_id_type: "national_id",
              subject_id_number: "1234567890",
              subject_account_number: "ACC-001",
              assigned_to: "",
              title: "Suspicious Large Transaction",
              title_ar: "معاملة مشبوهة بمبلغ كبير",
              description: "Large suspicious transaction detected",
              description_ar: "تم رصد معاملة مشبوهة بمبلغ كبير",
              total_amount: 500000,
              currency: "SAR",
              transaction_date: new Date().toISOString(),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              evidence: [],
            },
          ],
        }),
      });
    } else if (route.request().method() === "POST") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "aml-2",
          case_number: "AML-2026-002",
          status: "open",
          created_at: new Date().toISOString(),
        }),
      });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });

  // Mock screening
  await page.route(`${API_URL}/api/screening/screen`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        screened_name: "أحمد محمد",
        match_found: false,
        results: [],
        screened_at: new Date().toISOString(),
      }),
    });
  });

  // Mock STR generation
  await page.route(`${API_URL}/api/str/generate/*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "str-1",
        case_id: "aml-1",
        report_text: "تقرير العمليات المشبوهة",
        generated_at: new Date().toISOString(),
      }),
    });
  });

  // Mock suitability assessments (returns { assessments: [...] })
  await page.route(`${API_URL}/api/suitability/assessments*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assessments: [
          {
            id: "suit-1",
            client_name: "خالد سعود",
            risk_category: "moderate",
            overall_risk_score: 55,
            status: "completed",
            created_at: new Date().toISOString(),
          },
        ],
      }),
    });
  });

  await page.route(`${API_URL}/api/suitability/assess`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "suit-2",
        client_name: "سارة أحمد",
        risk_profile: "conservative",
        score: 65,
        recommendations: ["صناديق منخفضة المخاطر", "صكوك حكومية"],
        status: "completed",
      }),
    });
  });

  // Mock impact analysis
  await page.route(`${API_URL}/api/impact-analysis*`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "ia-1",
            alert_id: "alert-1",
            alert_title: "تحديث لائحة صناديق الاستثمار",
            impact_level: "high",
            affected_areas: ["صناديق الاستثمار", "الإفصاح"],
            analysis: "يتطلب التحديث مراجعة شاملة لإجراءات الإفصاح",
            action_items: [
              { action: "مراجعة سياسات الإفصاح", priority: "high" },
              { action: "تحديث النماذج", priority: "medium" },
            ],
            created_at: new Date().toISOString(),
          },
        ]),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "ia-2", impact_level: "medium" }),
      });
    }
  });

  // Mock document templates (required_fields with label_en)
  await page.route(`${API_URL}/api/documents/templates`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "tpl-1",
          name: "سياسة مكافحة غسل الأموال",
          name_en: "AML Policy",
          category: "aml_policy",
          description: "نموذج سياسة مكافحة غسل الأموال",
          required_fields: [
            { name: "company_name", label: "اسم الشركة", label_en: "Company Name", type: "text" },
            { name: "effective_date", label: "تاريخ السريان", label_en: "Effective Date", type: "text" },
          ],
        },
        {
          id: "tpl-2",
          name: "تقرير الامتثال",
          name_en: "Compliance Report",
          category: "compliance_report",
          description: "نموذج تقرير الامتثال الدوري",
          required_fields: [
            { name: "period", label: "الفترة", label_en: "Period", type: "text" },
            { name: "summary", label: "الملخص", label_en: "Summary", type: "textarea" },
          ],
        },
      ]),
    });
  });

  // Mock generated documents
  await page.route(`${API_URL}/api/documents/generated*`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });

  // Mock document generation
  await page.route(`${API_URL}/api/documents/generate`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "doc-gen-1",
        content: "# سياسة مكافحة غسل الأموال\n\nتلتزم الشركة بجميع المتطلبات التنظيمية...",
        template_name: "سياسة مكافحة غسل الأموال",
        created_at: new Date().toISOString(),
      }),
    });
  });

  // Mock knowledge base
  await page.route(`${API_URL}/api/knowledge*`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "kb-1",
            category: "regulations",
            title: "لائحة صناديق الاستثمار",
            content: "تحدد هذه اللائحة متطلبات تأسيس وإدارة الصناديق",
            created_at: new Date().toISOString(),
          },
        ]),
      });
    } else if (route.request().method() === "POST") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "kb-2", title: "New Entry" }),
      });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });

  // Mock prompts configs
  await page.route(`${API_URL}/api/prompts/configs`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Mock accuracy endpoints (page expects overall_approval_rate)
  await page.route(`${API_URL}/api/accuracy/summary`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        overall_approval_rate: 0.87,
        total_interactions: 156,
        feature_breakdown: {
          chat: { approval_rate: 0.89, total: 60 },
          search: { approval_rate: 0.85, total: 50 },
          review: { approval_rate: 0.88, total: 46 },
        },
        trend: "improving",
      }),
    });
  });

  await page.route(`${API_URL}/api/accuracy/trends*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Mock regulatory obligations - use regex for reliable matching
  await page.route(/\/api\/obligations/, (route) => {
    const url = route.request().url();

    if (url.includes("/obligations/summary")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 15,
          pending: 5,
          acknowledged: 6,
          completed: 4,
          high_priority_open: 3,
          by_category: { reporting: 5, governance: 4, aml: 3, disclosure: 3 },
        }),
      });
    }

    if (url.includes("/status")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }

    // Default: list obligations
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        obligations: [
          {
            id: "obl-1",
            alert_id: "alert-1",
            obligation: "تقديم التقرير الربعي",
            obligation_en: "Submit Quarterly Report",
            category: "reporting",
            priority: "high",
            status: "pending",
            deadline: new Date(Date.now() + 14 * 86400000).toISOString(),
            deadline_date: new Date(Date.now() + 14 * 86400000).toISOString(),
            affected_roles: ["compliance_officer", "ceo"],
            assigned_to: null,
            created_at: new Date().toISOString(),
            alerts: {
              title: "تحديث لائحة الإفصاح",
              title_en: "Disclosure Regulation Update",
              doc_type: "circular",
              source_url: "https://cma.org.sa/example",
            },
          },
        ],
      }),
    });
  });

  // Mock admin endpoints (use /api/admin/ prefix)
  await page.route(`${API_URL}/api/admin/firms*`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "firm-1",
            name: "TAM Capital",
            name_ar: "تام كابيتال",
            cma_license: "CMA-12345",
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });

  await page.route(`${API_URL}/api/admin/users*`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "user-1",
            email: "admin@tamcapital.com",
            name: "مدير النظام",
            organization: "TAM Capital",
            role: "admin",
            firm_id: "firm-1",
            language_pref: "ar",
            created_at: new Date().toISOString(),
          },
          {
            id: "user-2",
            email: "officer@tamcapital.com",
            name: "مسؤول الامتثال",
            organization: "TAM Capital",
            role: "compliance_officer",
            firm_id: "firm-1",
            language_pref: "ar",
            created_at: new Date().toISOString(),
          },
        ]),
      });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
  });

  // Mock admin audit log
  await page.route(`${API_URL}/api/admin/audit-log*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "log-1",
          user_id: "user-1",
          action: "login",
          resource_type: "user",
          resource_id: null,
          details: {},
          created_at: new Date().toISOString(),
        },
      ]),
    });
  });

  // Mock admin usage summary
  await page.route(`${API_URL}/api/admin/usage/summary*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total_events: 342,
        active_users: 8,
        period_days: 30,
        by_type: { chat: 120, search: 85, review: 45, login: 92 },
      }),
    });
  });

  // Mock review endpoint
  await page.route(`${API_URL}/api/review`, (route) => {
    if (route.request().method() === "POST") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "rev-1",
          findings: [
            {
              clause: "المادة 5 - الفقرة 2",
              status: "compliant",
              regulation: "لائحة صناديق الاستثمار",
              recommendation: "",
              citations: ["النص مطابق للمتطلبات"],
            },
            {
              clause: "المادة 12 - الفقرة 1",
              status: "non_compliant",
              regulation: "لائحة الإفصاح",
              recommendation: "يجب إضافة بند الإفصاح عن المخاطر",
              citations: ["لم يتم ذكر الإفصاح عن المخاطر"],
            },
          ],
          summary: {
            compliant: 1,
            non_compliant: 1,
            needs_review: 0,
          },
        }),
      });
    } else {
      route.continue();
    }
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
