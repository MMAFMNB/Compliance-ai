"""Bulk ingest TAM P&P documents from backend/data/policies/ into the RAG pipeline."""

import logging
import os
import sys

from database import supabase_admin
from ingest import extract_text_from_pdf, detect_language, chunk_document, embed_texts, store_document, store_chunks

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

POLICIES_DIR = os.path.join(os.path.dirname(__file__), "data", "policies")

SOURCE = "tam_policies"
DOC_TYPE = "policy"


def is_already_ingested(filename: str) -> bool:
    """Check if a policy document is already ingested by title."""
    try:
        result = (
            supabase_admin.table("documents")
            .select("id")
            .eq("source", SOURCE)
            .eq("title", filename)
            .limit(1)
            .execute()
        )
        return len(result.data) > 0
    except Exception:
        return False


def ingest_single_policy(file_path: str) -> dict:
    """Ingest a single P&P PDF into the RAG pipeline."""
    filename = os.path.basename(file_path)

    if is_already_ingested(filename):
        logger.info("SKIP (already ingested): %s", filename)
        return {"filename": filename, "status": "skipped"}

    logger.info("INGESTING: %s", filename)

    try:
        # Extract text
        text = extract_text_from_pdf(file_path)
        if not text or len(text.strip()) < 50:
            logger.warning("SKIP (no text extracted): %s", filename)
            return {"filename": filename, "status": "error", "error": "No text extracted"}

        # Detect language
        language = detect_language(text)

        # Store document record
        doc_id = store_document(
            title=filename,
            doc_type=DOC_TYPE,
            language=language,
            source_url=f"local://policies/{filename}",
            source=SOURCE,
        )

        # Chunk the text
        chunks = chunk_document(text)
        logger.info("  Created %d chunks for %s", len(chunks), filename)

        # Generate embeddings
        texts = [c["content"] for c in chunks]
        embeddings = embed_texts(texts)

        # Store chunks with embeddings
        store_chunks(doc_id, chunks, embeddings)

        logger.info("  DONE: %s — %d chunks stored", filename, len(chunks))
        return {"filename": filename, "status": "ingested", "chunks": len(chunks)}

    except Exception as exc:
        logger.exception("FAILED: %s", filename)
        return {"filename": filename, "status": "error", "error": str(exc)}


def run_bulk_ingest() -> dict:
    """Ingest all PDFs in the policies directory."""
    if not os.path.isdir(POLICIES_DIR):
        logger.error("Policies directory not found: %s", POLICIES_DIR)
        return {"error": f"Directory not found: {POLICIES_DIR}"}

    pdf_files = sorted([
        f for f in os.listdir(POLICIES_DIR)
        if f.lower().endswith(".pdf")
    ])

    logger.info("Found %d PDF files in %s", len(pdf_files), POLICIES_DIR)

    results = []
    total_chunks = 0
    ingested = 0
    skipped = 0
    errors = 0

    for pdf in pdf_files:
        file_path = os.path.join(POLICIES_DIR, pdf)
        result = ingest_single_policy(file_path)
        results.append(result)

        if result["status"] == "ingested":
            ingested += 1
            total_chunks += result.get("chunks", 0)
        elif result["status"] == "skipped":
            skipped += 1
        else:
            errors += 1

    summary = {
        "total_files": len(pdf_files),
        "ingested": ingested,
        "skipped": skipped,
        "errors": errors,
        "total_chunks": total_chunks,
        "details": results,
    }

    logger.info("=== BULK INGEST COMPLETE ===")
    logger.info("Files: %d | Ingested: %d | Skipped: %d | Errors: %d | Chunks: %d",
                len(pdf_files), ingested, skipped, errors, total_chunks)

    return summary


if __name__ == "__main__":
    summary = run_bulk_ingest()
    print(f"\n{'='*60}")
    print(f"Total: {summary['total_files']} | Ingested: {summary['ingested']} | "
          f"Skipped: {summary['skipped']} | Errors: {summary['errors']}")
    print(f"Chunks created: {summary['total_chunks']}")
    print(f"{'='*60}")

    for r in summary["details"]:
        status_icon = "✓" if r["status"] == "ingested" else "⏭" if r["status"] == "skipped" else "✗"
        chunks_info = f" ({r['chunks']} chunks)" if r.get("chunks") else ""
        error_info = f" — {r['error']}" if r.get("error") else ""
        print(f"  {status_icon} {r['filename']}{chunks_info}{error_info}")
