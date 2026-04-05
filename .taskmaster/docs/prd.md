# PRD: Full App Quality Pass — TAM Compliance AI

## Overview
Comprehensive quality pass across all remaining features of TAM Compliance AI. Every feature must work end-to-end with real data flowing through the system. The app must be production-ready with no dead references, no empty states hiding broken logic, and all features verified against the live Supabase instance.

## Background
After removing 8 features (Regulation Search, Alerts page, Impact Analysis, Compliance Checklist, Self-Assessment, AML Case Manager, Suitability Assessment, Regulatory Intelligence), the app has orphaned references and features that have never been validated with real data. The dashboard shows stats but expanding them reveals empty detail views.

## Goals
1. Clean up all orphaned references to deleted features
2. Verify every remaining feature works end-to-end (frontend -> backend -> database -> frontend)
3. Ensure the dashboard displays real, accurate data that expands with meaningful detail
4. Fix all broken tests and remove orphaned test files
5. Validate the CMA scraper pipeline works and feeds data correctly
6. Ensure multi-tenant (firm-based) data isolation works

## Architecture
- **Frontend**: Next.js 14 (App Router), deployed on Vercel
- **Backend**: FastAPI (Python), deployed on Render/Railway
- **Database**: Supabase (PostgreSQL with RLS)
- **Deployment URL**: https://tam-compliance-ai-frontend.vercel.app/

## Remaining Features (must all work E2E)
1. **Regulatory Chat** — AI chat with CMA regulatory knowledge (RAG-based)
2. **Document Review** — Upload PDF, get compliance review findings
3. **Compliance Calendar** — Regulatory deadlines, add/track/complete
4. **Document Generator** — Generate documents from templates
5. **Dashboard** — Stats, expandable detail cards, CMA scan button, audit log
6. **Learning Dashboard** — Accuracy metrics, knowledge base, adaptive prompts
7. **Admin Panel** — Super admin: manage firms, users, audit log, usage
8. **Firm Admin** — Firm-scoped user management
9. **CMA Scraper** — Automated + manual scan for CMA updates
10. **Auth** — Login, signup, role-based access, session management

## Task Breakdown

### Task 1: Clean Up Orphaned References
- Remove deleted feature names from `VALID_FEATURES` in `backend/feedback.py` and `backend/accuracy_tracking.py`
- Remove deleted features from learning page feature filter (`frontend/src/app/learning/page.tsx`)
- Fix dashboard.py comment on AuditEntry type
- Delete orphaned test files: `backend/tests/test_alerts.py`, `backend/tests/test_search.py`
- Update `backend/tests/conftest.py` to remove deleted feature references
- Clean up load test files in `backend/load-tests/` to remove deleted endpoint references
- Remove orphaned e2e test files referencing deleted features (alerts.spec.ts, search.spec.ts, pages.spec.ts if it references deleted pages)

### Task 2: Verify Database Tables Exist in Live Supabase
- Run SQL against the live Supabase instance to check which tables actually exist
- Compare against the 28 tables defined in migration files
- Run any missing migrations or create missing tables
- Verify RLS policies are in place for multi-tenant isolation
- Document which tables are empty vs populated

### Task 3: Validate Chat Feature E2E
- Verify chat page loads, creates conversation, sends message, receives streamed response
- Verify conversation history loads and displays correctly
- Verify conversation deletion works
- Verify RAG retrieval works (chunks table has data, embeddings work)
- Test with actual CMA regulatory questions

### Task 4: Validate Document Review E2E
- Verify PDF upload works
- Verify review findings are returned and displayed
- Verify review is saved to `document_reviews` table
- Verify review appears in dashboard stats and audit trail

### Task 5: Validate Compliance Calendar E2E
- Verify deadlines load from database
- Verify adding a new deadline works
- Verify updating deadline status (complete/pending) works
- Verify deadline categories display correctly
- Verify CMA scraper-created deadlines appear

### Task 6: Validate Document Generator E2E
- Verify templates load from database
- Verify document generation works with template fields
- Verify generated document is saved and can be retrieved
- Verify submit-for-review workflow works
- Seed templates if none exist

### Task 7: Fix Dashboard Data Integrity
- Verify each stat card shows accurate counts matching actual DB rows
- Verify each stat card expands to show real detail items
- Verify CMA scan button triggers scraper and shows results
- Verify audit trail shows real recent activity
- Verify recent topics section shows actual conversation previews
- Remove the alerts stat card OR ensure alerts table has data from scraper

### Task 8: Validate Learning Dashboard E2E
- Verify accuracy summary endpoint returns real data
- Verify accuracy trends display correctly
- Verify knowledge base CRUD (create, list, delete)
- Verify prompt configs load and display
- Verify analyze-feedback and compute-metrics work
- Ensure only valid features appear in filter list

### Task 9: Validate Admin Panel E2E
- Verify super_admin can see all firms and users
- Verify firm creation works
- Verify user role changes work
- Verify audit log displays real entries
- Verify usage summary shows real data
- Verify firm activate/deactivate works

### Task 10: Validate CMA Scraper Pipeline E2E
- Verify manual scan button triggers scraper
- Verify scraper actually fetches from CMA website
- Verify new alerts are saved to alerts table
- Verify circular_parser extracts obligations
- Verify obligations sync to calendar deadlines
- Verify scheduler runs daily job correctly

### Task 11: Validate Auth & RBAC E2E
- Verify login/signup flow works
- Verify session persistence and token refresh
- Verify role-based sidebar navigation (super_admin sees admin, firm_admin sees firm-admin)
- Verify API endpoints enforce auth correctly
- Verify firm-scoped data isolation

### Task 12: Fix and Update All Tests
- Update e2e tests to match current feature set
- Update navigation.spec.ts to only test existing nav items
- Update accessibility.spec.ts for current pages
- Ensure all e2e tests can run against the deployed app
- Update backend pytest files for current modules
- Remove references to deleted features in conftest.py

### Task 13: Seed Data for Empty Features
- Seed document templates if templates table is empty
- Seed sample deadlines if deadlines table is empty
- Ensure at least one firm exists for multi-tenant testing
- Create test user accounts for each role if needed

### Task 14: Deploy and Verify Production
- Push all fixes to master
- Verify Vercel deployment succeeds
- Verify backend deployment is healthy
- Run smoke tests against production URLs
- Verify CMA scan works in production
- Verify all expandable dashboard cards show data in production

## Multi-Agent Workflow
This PRD should be executed using a 3-agent workflow:
- **Builder Agent**: Implements fixes and code changes
- **Reviewer Agent**: Reviews code changes for correctness, security, and completeness
- **Tester Agent**: Validates changes work by running tests and checking endpoints

## Success Criteria
- All 10 remaining features work end-to-end with real data
- Dashboard stat cards expand to show actual detail items (not empty)
- CMA scan button finds and saves real updates from cma.gov.sa
- All tests pass (e2e and backend)
- No console errors or broken API calls in production
- Zero references to deleted features anywhere in the codebase
