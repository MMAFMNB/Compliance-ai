# PRD: AML.gov.sa Document Ingestion & Scraping

## Overview
Ingest 10 regulatory PDF documents and 1 web page from aml.gov.sa (Saudi AML Authority / SAFIU) into the RAG knowledge base, and set up periodic scraping to detect updates or new publications.

## Background
TAM Compliance AI currently scrapes CMA (cma.gov.sa) for regulatory updates. Compliance and risk teams need AML/CFT regulatory documents from aml.gov.sa ingested into the chat RAG pipeline so the AI assistant can reference them. Additionally, the system should periodically check for new or updated documents.

## Source Documents

### PDFs to Ingest (10 documents)
1. **AML Implementing Regulations** — اللائحة التنفيذية لنظام مكافحة غسل الأموال
   - URL: https://www.aml.gov.sa/ar-sa/RulesAndRegulations/اللائحة التنفيذية لنظام مكافحة غسل الأموال.pdf
   - Category: regulation
   
2. **CTF Implementing Regulations** — اللائحة التنفيذية لنظام مكافحة جرائم الإرهاب وتمويله
   - URL: https://www.aml.gov.sa/ar-sa/RulesAndRegulations/اللائحة التنفيذية لنظام مكافحة جرائم الإرهاب وتمويله.pdf
   - Category: regulation

3. **AML/CTF Guide for Precious Metals & Stones (Jan 2024)** — الدليل الارشادي لمكافحة غسل الأموال وتمويل الإرهاب للمعادن الثمينة والاحجار الكريمة
   - URL: https://www.aml.gov.sa/ar-sa/RulesAndInstructions/الدليل الارشادي لمكافحة غسل الأموال وتمويل الإرهاب للمعادن الثمينة والاحجار الكريمة المعتمد يناير 2024م.pdf
   - Category: guidance

4. **CMA CTF Implementing Rules** — القواعد التنفيذية لنظام مكافحة جرائم الإرهاب وتمويله الصادرة عن هيئة السوق المالية
   - URL: https://www.aml.gov.sa/ar-sa/RulesAndInstructions/القواعد التنفيذية لنظام مكافحة جرائم الإرهاب وتمويله الصادرة عن هيئة السوق المالية.pdf
   - Category: regulation

5. **CMA AML/CTF Rules 2011** — قواعد مكافحة غسل الأموال وتمويل الإرهاب لهيئة السوق المالية لعام 2011م
   - URL: https://www.aml.gov.sa/ar-sa/RulesAndInstructions/قواعد مكافحة غسل الأموال وتمويل الإرهاب لهيئة السوق المالية لعام 2011م.pdf
   - Category: regulation

6. **Risk-Based Approach Guide for Financial Services** — دليل المنهج القائم على المخاطر لنشاط الخدمات المالية
   - URL: https://www.aml.gov.sa/ar-sa/GuidanceReports/دليل المنهج القائم على المخاطر لنشاط الخدمات المالية.pdf
   - Category: guidance

7. **Proliferation Financing Risk Assessment Guide (Updated)** — الدليل الاسترشادي (المحدث) لتقييم مخاطر تمويل انتشار التسلح
   - URL: https://www.aml.gov.sa/ar-sa/GuidanceReports/الدليل الاسترشادي (المحدث) لتقييم مخاطر تمويل انتشار التسلح وكيفية الحد من تلك المخاطر - عربي.pdf
   - Category: guidance

8. **Beneficial Ownership Best Practices** — أفضل الممارسات- المستفيد الحقيقي للشخصيات الاعتبارية
   - URL: https://www.aml.gov.sa/ar-sa/GuidanceReports/أفضل الممارسات- المستفيد الحقيقي للشخصيات الاعتبارية.pdf
   - Category: guidance

9. **FATF Report on ML through New Payment Methods** — تقرير الفاتف عن غسل الأموال من خلال أساليب الدفع الجديد
   - URL: https://www.aml.gov.sa/ar-sa/GuidanceReports/تقرير الفاتف عن غسل الأموال من خلال أساليب الدفع الجديد.pdf
   - Category: report

10. **Prepaid Cards, Mobile & Internet Payments Risk Guide** — دليل المنهج القائم على المخاطر للبطاقات مسبقة الدفع
    - URL: https://www.aml.gov.sa/ar-sa/GuidanceReports/دليل المنهج القائم على المخاطر للبطاقات مسبقة الدفع، والمدفوعات عن طريق الجوال وخدمات الدفع عن طريق الإنترنت.pdf
    - Category: guidance

### Web Page to Scrape
- **High Risk Countries List** — https://www.aml.gov.sa/ar-sa/Pages/HighRiskCountries.aspx
  - Scrape country names and risk status
  - Store as structured data for reference in chat

## Goals
1. Download and ingest all 10 PDFs into the RAG pipeline (documents → chunks → embeddings)
2. Scrape the High Risk Countries page and store structured data
3. Add aml.gov.sa as a scraping source alongside CMA — check for new/updated documents periodically
4. Show all data sources with status in the dashboard
5. Make the chat agent aware of AML/CTF knowledge for regulatory queries

## Technical Requirements

### Task 1: Build AML Document Ingestion Script
- Create `backend/ingest_aml.py` that:
  - Downloads each PDF from the URLs above (handle Arabic URL encoding)
  - Uses existing `ingest.py` pipeline: extract_text_from_pdf → chunk → embed → store
  - Stores each document in `documents` table with source="aml.gov.sa", doc_type per category above
  - Handles large PDFs (some may be 100+ pages)
  - Skips already-ingested documents (dedup by source_url)
  - Can be run as a one-time script AND triggered via API

### Task 2: Add AML Ingestion API Endpoint
- Add `POST /api/dashboard/ingest-aml` endpoint (authenticated, admin only)
- Triggers the ingestion of all AML documents
- Returns progress/status (how many documents ingested, chunks created, etc.)
- Add a button on the dashboard next to the CMA scan button

### Task 3: Scrape High Risk Countries Page
- Create scraper for https://www.aml.gov.sa/ar-sa/Pages/HighRiskCountries.aspx
- Parse the HTML to extract country names and their risk classification
- Store in a new `high_risk_countries` table or in the knowledge_base table
- Make this data available to the chat RAG pipeline
- Add to the periodic scraping schedule

### Task 4: Add AML.gov.sa Periodic Scraper
- Extend the existing scraper infrastructure to check aml.gov.sa for:
  - New documents on the Rules & Regulations page
  - New documents on the Guidance Reports page
  - Updates to existing documents (check file dates/sizes)
- Add to the daily scheduler job alongside CMA scraping
- Save new findings to the alerts table with source="aml.gov.sa"

### Task 5: Dashboard Sources Panel
- Add a "Data Sources" section to the dashboard showing:
  - CMA (cma.gov.sa) — last scan time, documents count, status
  - AML (aml.gov.sa) — last scan/ingest time, documents count, status
  - For each source: number of documents, chunks, last updated
- Show ingestion status for AML docs (which are ingested, which pending)
- Add "Ingest AML Documents" button alongside the CMA scan button

### Task 6: Update Chat System Prompt
- Update the chat system prompt to mention AML/CTF knowledge availability
- Ensure RAG retrieval covers both CMA and AML document chunks
- Test with AML-specific questions to verify retrieval works

## Success Criteria
- All 10 AML PDFs are ingested with embeddings in the chunks table
- High Risk Countries data is scraped and stored
- Chat can answer AML/CTF regulatory questions citing specific articles
- Dashboard shows both CMA and AML data sources with status
- Periodic scraping checks aml.gov.sa for new publications
- Ingest button on dashboard allows manual re-ingestion
