"""AML document ingestion: download PDFs from aml.gov.sa and ingest into RAG pipeline."""

import logging
import os
import tempfile

import httpx

from database import supabase_admin
from ingest import (
    chunk_document,
    detect_language,
    embed_texts,
    extract_text_from_pdf,
    store_chunks,
    store_document,
)

logger = logging.getLogger(__name__)

# Browser-like headers to pass aml.gov.sa WAF (mirrors scraper.py approach)
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/pdf,application/octet-stream,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

REQUEST_TIMEOUT = 120  # PDFs can be large; generous timeout

# ─── Document Registry ─────────────────────────────────────

AML_DOCUMENTS = [
    {
        "title": "اللائحة التنفيذية لنظام مكافحة غسل الأموال",
        "title_en": "AML Implementing Regulations",
        "url": "https://www.aml.gov.sa/ar-sa/RulesAndRegulations/%D8%A7%D9%84%D9%84%D8%A7%D8%A6%D8%AD%D8%A9%20%D8%A7%D9%84%D8%AA%D9%86%D9%81%D9%8A%D8%B0%D9%8A%D8%A9%20%D9%84%D9%86%D8%B8%D8%A7%D9%85%20%D9%85%D9%83%D8%A7%D9%81%D8%AD%D8%A9%20%D8%BA%D8%B3%D9%84%20%D8%A7%D9%84%D8%A3%D9%85%D9%88%D8%A7%D9%84.pdf",
        "doc_type": "regulation",
        "source": "aml.gov.sa",
    },
    {
        "title": "اللائحة التنفيذية لنظام مكافحة جرائم الإرهاب وتمويله",
        "title_en": "CTF Implementing Regulations",
        "url": "https://www.aml.gov.sa/ar-sa/RulesAndRegulations/%D8%A7%D9%84%D9%84%D8%A7%D8%A6%D8%AD%D8%A9%20%D8%A7%D9%84%D8%AA%D9%86%D9%81%D9%8A%D8%B0%D9%8A%D8%A9%20%D9%84%D9%86%D8%B8%D8%A7%D9%85%20%D9%85%D9%83%D8%A7%D9%81%D8%AD%D8%A9%20%D8%AC%D8%B1%D8%A7%D8%A6%D9%85%20%D8%A7%D9%84%D8%A5%D8%B1%D9%87%D8%A7%D8%A8%20%D9%88%D8%AA%D9%85%D9%88%D9%8A%D9%84%D9%87.pdf",
        "doc_type": "regulation",
        "source": "aml.gov.sa",
    },
    {
        "title": "الدليل الارشادي لمكافحة غسل الأموال وتمويل الإرهاب للمعادن الثمينة والاحجار الكريمة",
        "title_en": "AML/CTF Guide for Precious Metals & Stones (Jan 2024)",
        "url": "https://www.aml.gov.sa/ar-sa/RulesAndInstructions/%D8%A7%D9%84%D8%AF%D9%84%D9%8A%D9%84%20%D8%A7%D9%84%D8%A7%D8%B1%D8%B4%D8%A7%D8%AF%D9%8A%20%D9%84%D9%85%D9%83%D8%A7%D9%81%D8%AD%D8%A9%20%D8%BA%D8%B3%D9%84%20%D8%A7%D9%84%D8%A7%D9%94%D9%85%D9%88%D8%A7%D9%84%20%D9%88%D8%AA%D9%85%D9%88%D9%8A%D9%84%20%D8%A7%D9%84%D8%A7%D9%95%D8%B1%D9%87%D8%A7%D8%A8%20%D9%84%D9%84%D9%85%D8%B9%D8%A7%D8%AF%D9%86%20%D8%A7%D9%84%D8%AB%D9%85%D9%8A%D9%86%D8%A9%20%D9%88%D8%A7%D9%84%D8%A7%D8%AD%D8%AC%D8%A7%D8%B1%20%D8%A7%D9%84%D9%83%D8%B1%D9%8A%D9%85%D8%A9%20%D8%A7%D9%84%D9%85%D8%B9%D8%AA%D9%85%D8%AF%20%D9%8A%D9%86%D8%A7%D9%8A%D8%B1%202024%D9%85.pdf",
        "doc_type": "guidance",
        "source": "aml.gov.sa",
    },
    {
        "title": "القواعد التنفيذية لنظام مكافحة جرائم الإرهاب وتمويله الصادرة عن هيئة السوق المالية",
        "title_en": "CMA CTF Implementing Rules",
        "url": "https://www.aml.gov.sa/ar-sa/RulesAndInstructions/%D8%A7%D9%84%D9%82%D9%88%D8%A7%D8%B9%D8%AF%20%D8%A7%D9%84%D8%AA%D9%86%D9%81%D9%8A%D8%B0%D9%8A%D8%A9%20%D9%84%D9%86%D8%B8%D8%A7%D9%85%20%D9%85%D9%83%D8%A7%D9%81%D8%AD%D8%A9%20%D8%AC%D8%B1%D8%A7%D8%A6%D9%85%20%D8%A7%D9%84%D8%A5%D8%B1%D9%87%D8%A7%D8%A8%20%D9%88%D8%AA%D9%85%D9%88%D9%8A%D9%84%D9%87%20%D8%A7%D9%84%D8%B5%D8%A7%D8%AF%D8%B1%D8%A9%20%D8%B9%D9%86%20%D9%87%D9%8A%D8%A6%D8%A9%20%D8%A7%D9%84%D8%B3%D9%88%D9%82%20%D8%A7%D9%84%D9%85%D8%A7%D9%84%D9%8A%D8%A9.pdf",
        "doc_type": "regulation",
        "source": "aml.gov.sa",
    },
    {
        "title": "قواعد مكافحة غسل الأموال وتمويل الإرهاب لهيئة السوق المالية لعام 2011م",
        "title_en": "CMA AML/CTF Rules 2011",
        "url": "https://www.aml.gov.sa/ar-sa/RulesAndInstructions/%D9%82%D9%88%D8%A7%D8%B9%D8%AF%20%D9%85%D9%83%D8%A7%D9%81%D8%AD%D8%A9%20%D8%BA%D8%B3%D9%84%20%D8%A7%D9%84%D8%A3%D9%85%D9%88%D8%A7%D9%84%20%D9%88%D8%AA%D9%85%D9%88%D9%8A%D9%84%20%D8%A7%D9%84%D8%A5%D8%B1%D9%87%D8%A7%D8%A8%20%D9%84%D9%87%D9%8A%D8%A6%D8%A9%20%D8%A7%D9%84%D8%B3%D9%88%D9%82%20%D8%A7%D9%84%D9%85%D8%A7%D9%84%D9%8A%D8%A9%20%D9%84%D8%B9%D8%A7%D9%85%202011%D9%85.pdf",
        "doc_type": "regulation",
        "source": "aml.gov.sa",
    },
    {
        "title": "دليل المنهج القائم على المخاطر لنشاط الخدمات المالية",
        "title_en": "Risk-Based Approach Guide for Financial Services",
        "url": "https://www.aml.gov.sa/ar-sa/GuidanceReports/%D8%AF%D9%84%D9%8A%D9%84%20%D8%A7%D9%84%D9%85%D9%86%D9%87%D8%AC%20%D8%A7%D9%84%D9%82%D8%A7%D8%A6%D9%85%20%D8%B9%D9%84%D9%89%20%D8%A7%D9%84%D9%85%D8%AE%D8%A7%D8%B7%D8%B1%20%D9%84%D9%86%D8%B4%D8%A7%D8%B7%20%D8%A7%D9%84%D8%AE%D8%AF%D9%85%D8%A7%D8%AA%20%D8%A7%D9%84%D9%85%D8%A7%D9%84%D9%8A%D8%A9.pdf",
        "doc_type": "guidance",
        "source": "aml.gov.sa",
    },
    {
        "title": "الدليل الاسترشادي المحدث لتقييم مخاطر تمويل انتشار التسلح",
        "title_en": "Proliferation Financing Risk Assessment Guide",
        "url": "https://www.aml.gov.sa/ar-sa/GuidanceReports/%D8%A7%D9%84%D8%AF%D9%84%D9%8A%D9%84%20%D8%A7%D9%84%D8%A7%D8%B3%D8%AA%D8%B1%D8%B4%D8%A7%D8%AF%D9%8A%20(%D8%A7%D9%84%D9%85%D8%AD%D8%AF%D8%AB)%20%D9%84%D8%AA%D9%82%D9%8A%D9%8A%D9%85%20%D9%85%D8%AE%D8%A7%D8%B7%D8%B1%20%D8%AA%D9%85%D9%88%D9%8A%D9%84%20%D8%A7%D9%86%D8%AA%D8%B4%D8%A7%D8%B1%20%D8%A7%D9%84%D8%AA%D8%B3%D9%84%D8%AD%20%D9%88%D9%83%D9%8A%D9%81%D9%8A%D8%A9%20%D8%A7%D9%84%D8%AD%D8%AF%20%D9%85%D9%86%20%D8%AA%D9%84%D9%83%20%D8%A7%D9%84%D9%85%D8%AE%D8%A7%D8%B7%D8%B1%20-%20%D8%B9%D8%B1%D8%A8%D9%8A.pdf",
        "doc_type": "guidance",
        "source": "aml.gov.sa",
    },
    {
        "title": "أفضل الممارسات - المستفيد الحقيقي للشخصيات الاعتبارية",
        "title_en": "Beneficial Ownership Best Practices",
        "url": "https://www.aml.gov.sa/ar-sa/GuidanceReports/%D8%A3%D9%81%D8%B6%D9%84%20%D8%A7%D9%84%D9%85%D9%85%D8%A7%D8%B1%D8%B3%D8%A7%D8%AA-%20%D8%A7%D9%84%D9%85%D8%B3%D8%AA%D9%81%D9%8A%D8%AF%20%D8%A7%D9%84%D8%AD%D9%82%D9%8A%D9%82%D9%8A%20%D9%84%D9%84%D8%B4%D8%AE%D8%B5%D9%8A%D8%A7%D8%AA%20%D8%A7%D9%84%D8%A7%D8%B9%D8%AA%D8%A8%D8%A7%D8%B1%D9%8A%D8%A9.pdf",
        "doc_type": "guidance",
        "source": "aml.gov.sa",
    },
    {
        "title": "تقرير الفاتف عن غسل الأموال من خلال أساليب الدفع الجديد",
        "title_en": "FATF Report on ML through New Payment Methods",
        "url": "https://www.aml.gov.sa/ar-sa/GuidanceReports/%D8%AA%D9%82%D8%B1%D9%8A%D8%B1%20%D8%A7%D9%84%D9%81%D8%A7%D8%AA%D9%81%20%D8%B9%D9%86%20%D8%BA%D8%B3%D9%84%20%D8%A7%D9%84%D8%A3%D9%85%D9%88%D8%A7%D9%84%20%D9%85%D9%86%20%D8%AE%D9%84%D8%A7%D9%84%20%D8%A3%D8%B3%D8%A7%D9%84%D9%8A%D8%A8%20%D8%A7%D9%84%D8%AF%D9%81%D8%B9%20%D8%A7%D9%84%D8%AC%D8%AF%D9%8A%D8%AF.pdf",
        "doc_type": "report",
        "source": "aml.gov.sa",
    },
    {
        "title": "دليل المنهج القائم على المخاطر للبطاقات مسبقة الدفع والمدفوعات الإلكترونية",
        "title_en": "Prepaid Cards & Mobile Payments Risk Guide",
        "url": "https://www.aml.gov.sa/ar-sa/GuidanceReports/%D8%AF%D9%84%D9%8A%D9%84%20%D8%A7%D9%84%D9%85%D9%86%D9%87%D8%AC%20%D8%A7%D9%84%D9%82%D8%A7%D8%A6%D9%85%20%D8%B9%D9%84%D9%89%20%D8%A7%D9%84%D9%85%D8%AE%D8%A7%D8%B7%D8%B1%20%D9%84%D9%84%D8%A8%D8%B7%D8%A7%D9%82%D8%A7%D8%AA%20%D9%85%D8%B3%D8%A8%D9%82%D8%A9%20%D8%A7%D9%84%D8%AF%D9%81%D8%B9%D8%8C%20%D9%88%D8%A7%D9%84%D9%85%D8%AF%D9%81%D9%88%D8%B9%D8%A7%D8%AA%20%D8%B9%D9%86%20%D8%B7%D8%B1%D9%8A%D9%82%20%D8%A7%D9%84%D8%AC%D9%88%D8%A7%D9%84%20%D9%88%D8%AE%D8%AF%D9%85%D8%A7%D8%AA%20%D8%A7%D9%84%D8%AF%D9%81%D8%B9%20%D8%B9%D9%86%20%D8%B7%D8%B1%D9%8A%D9%82%20%D8%A7%D9%84%D8%A5%D9%86%D8%AA%D8%B1%D9%86%D8%AA.pdf",
        "doc_type": "guidance",
        "source": "aml.gov.sa",
    },
]


# ─── PDF Download ──────────────────────────────────────────


def download_pdf(url: str, dest_path: str) -> bool:
    """Download a PDF from a URL to a local file path.

    Uses browser-like headers to pass WAF protections on aml.gov.sa.
    The URLs are already percent-encoded for Arabic characters.
    Returns True on success, False on failure.
    """
    try:
        with httpx.stream("GET", url, headers=_HEADERS, timeout=REQUEST_TIMEOUT, follow_redirects=True) as response:
            response.raise_for_status()
            with open(dest_path, "wb") as f:
                for chunk in response.iter_bytes(chunk_size=8192):
                    f.write(chunk)
        file_size = os.path.getsize(dest_path)
        logger.info("Downloaded %s (%d bytes)", url[:80], file_size)
        return True
    except httpx.HTTPError:
        logger.exception("Failed to download PDF: %s", url[:120])
        return False
    except OSError:
        logger.exception("Failed to write PDF to %s", dest_path)
        return False


# ─── Deduplication ─────────────────────────────────────────


def is_already_ingested(source_url: str) -> bool:
    """Check the documents table for an existing record with this source_url."""
    try:
        result = (
            supabase_admin.table("documents")
            .select("id")
            .eq("source_url", source_url)
            .limit(1)
            .execute()
        )
        return len(result.data) > 0
    except Exception:
        logger.exception("Error checking ingestion status for %s", source_url[:80])
        return False


# ─── Single Document Ingestion ─────────────────────────────


def ingest_single_document(doc: dict) -> dict:
    """Download, extract, chunk, embed, and store a single AML document.

    Args:
        doc: Dict with keys title, title_en, url, doc_type, source.

    Returns:
        Summary dict with status, title_en, chunks_created, and any error.
    """
    title_en = doc["title_en"]
    source_url = doc["url"]

    if is_already_ingested(source_url):
        logger.info("Already ingested, skipping: %s", title_en)
        return {"title_en": title_en, "status": "skipped", "chunks_created": 0}

    # Download PDF to a temporary file
    tmp_dir = tempfile.mkdtemp(prefix="aml_ingest_")
    tmp_path = os.path.join(tmp_dir, "document.pdf")

    try:
        if not download_pdf(source_url, tmp_path):
            return {"title_en": title_en, "status": "download_failed", "chunks_created": 0}

        # Extract text
        logger.info("Extracting text from: %s", title_en)
        text = extract_text_from_pdf(tmp_path)
        if not text.strip():
            return {"title_en": title_en, "status": "no_text_extracted", "chunks_created": 0}

        # Detect language
        language = detect_language(text)
        logger.info("Language: %s, Length: %d chars", language, len(text))

        # Chunk
        chunks = chunk_document(text)
        if not chunks:
            return {"title_en": title_en, "status": "no_chunks_produced", "chunks_created": 0}
        logger.info("Produced %d chunks for: %s", len(chunks), title_en)

        # Embed
        logger.info("Embedding %d chunks...", len(chunks))
        texts = [c["content"] for c in chunks]
        embeddings = embed_texts(texts)

        # Store document record
        doc_id = store_document(
            title=doc["title"],
            title_en=title_en,
            doc_type=doc["doc_type"],
            source_url=source_url,
            amendment_date=None,
            file_path=None,
            language=language,
        )

        # Store chunks with embeddings
        stored = store_chunks(doc_id, chunks, embeddings)
        logger.info("Stored %d chunks for: %s (doc_id=%s)", stored, title_en, doc_id)

        return {
            "title_en": title_en,
            "status": "ingested",
            "document_id": doc_id,
            "chunks_created": stored,
            "char_count": len(text),
            "language": language,
        }

    except Exception as exc:
        logger.exception("Error ingesting %s", title_en)
        return {"title_en": title_en, "status": "error", "error": str(exc), "chunks_created": 0}

    finally:
        # Clean up temp files
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            os.rmdir(tmp_dir)
        except OSError:
            pass


# ─── Full AML Ingestion Pipeline ──────────────────────────


def run_aml_ingestion() -> dict:
    """Ingest all AML documents from aml.gov.sa into the RAG pipeline.

    Iterates through AML_DOCUMENTS, downloads each PDF, extracts text,
    chunks, embeds, and stores in Supabase. Skips already-ingested docs.

    Returns:
        Summary dict with total_documents, documents_ingested, chunks_created,
        skipped, errors, and per-document results.
    """
    logger.info("Starting AML document ingestion (%d documents)", len(AML_DOCUMENTS))

    results = []
    total_chunks = 0
    ingested = 0
    skipped = 0
    errors = 0

    for i, doc in enumerate(AML_DOCUMENTS, 1):
        logger.info("[%d/%d] Processing: %s", i, len(AML_DOCUMENTS), doc["title_en"])
        result = ingest_single_document(doc)
        results.append(result)

        if result["status"] == "ingested":
            ingested += 1
            total_chunks += result["chunks_created"]
        elif result["status"] == "skipped":
            skipped += 1
        else:
            errors += 1

    summary = {
        "total_documents": len(AML_DOCUMENTS),
        "documents_ingested": ingested,
        "documents_skipped": skipped,
        "documents_errored": errors,
        "total_chunks_created": total_chunks,
        "results": results,
    }

    logger.info(
        "AML ingestion complete: %d ingested, %d skipped, %d errors, %d total chunks",
        ingested, skipped, errors, total_chunks,
    )
    return summary


# ─── CLI Entry Point ───────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    summary = run_aml_ingestion()
    print("\n=== AML Ingestion Summary ===")
    print(f"  Total documents:  {summary['total_documents']}")
    print(f"  Ingested:         {summary['documents_ingested']}")
    print(f"  Skipped:          {summary['documents_skipped']}")
    print(f"  Errors:           {summary['documents_errored']}")
    print(f"  Total chunks:     {summary['total_chunks_created']}")
    for r in summary["results"]:
        status_icon = "OK" if r["status"] == "ingested" else r["status"].upper()
        print(f"  [{status_icon}] {r['title_en']} — {r['chunks_created']} chunks")
