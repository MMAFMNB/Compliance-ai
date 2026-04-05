"""Policies & Procedures document management endpoints."""

import logging
import os
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from auth import get_current_user
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

router = APIRouter(prefix="/api/policies", tags=["policies"])

TAM_POLICIES_SOURCE = "tam_policies"


class PolicyDocumentOut(BaseModel):
    id: str
    title: str
    doc_type: str
    language: str | None = None
    created_at: str | None = None
    chunk_count: int = 0


@router.post("/upload")
def upload_policy(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload a P&P PDF document, ingest it (extract, chunk, embed, store)."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Save to a temp file
    tmp_dir = tempfile.mkdtemp(prefix="pp_upload_")
    tmp_path = os.path.join(tmp_dir, file.filename)

    try:
        contents = file.file.read()
        with open(tmp_path, "wb") as f:
            f.write(contents)

        # Extract text
        text = extract_text_from_pdf(tmp_path)
        if not text.strip():
            raise HTTPException(status_code=422, detail="No text could be extracted from the PDF.")

        language = detect_language(text)

        # Chunk
        chunks = chunk_document(text)
        if not chunks:
            raise HTTPException(status_code=422, detail="No chunks produced from the document.")

        # Embed
        texts = [c["content"] for c in chunks]
        embeddings = embed_texts(texts)

        # Store document record
        title = os.path.splitext(file.filename)[0]
        doc_id = store_document(
            title=title,
            title_en=title,
            doc_type="policy",
            source_url=None,
            amendment_date=None,
            file_path=None,
            language=language,
        )

        # Set source to tam_policies
        supabase_admin.table("documents").update(
            {"source": TAM_POLICIES_SOURCE}
        ).eq("id", doc_id).execute()

        # Store chunks
        stored = store_chunks(doc_id, chunks, embeddings)

        return {
            "id": doc_id,
            "title": title,
            "language": language,
            "chunk_count": stored,
            "char_count": len(text),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to ingest P&P document: %s", file.filename)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")
    finally:
        # Cleanup temp file
        try:
            os.remove(tmp_path)
            os.rmdir(tmp_dir)
        except OSError:
            pass


@router.get("/documents")
def list_policy_documents(user: dict = Depends(get_current_user)):
    """List all uploaded P&P documents (source = tam_policies)."""
    result = (
        supabase_admin.table("documents")
        .select("id, title, doc_type, language, created_at")
        .eq("source", TAM_POLICIES_SOURCE)
        .order("created_at", desc=True)
        .execute()
    )

    docs = []
    for row in result.data or []:
        # Get chunk count for each document
        chunk_result = (
            supabase_admin.table("chunks")
            .select("id", count="exact")
            .eq("document_id", row["id"])
            .execute()
        )
        docs.append(
            PolicyDocumentOut(
                id=row["id"],
                title=row["title"],
                doc_type=row["doc_type"],
                language=row.get("language"),
                created_at=row.get("created_at"),
                chunk_count=chunk_result.count or 0,
            ).model_dump()
        )

    return docs


@router.delete("/documents/{doc_id}")
def delete_policy_document(doc_id: str, user: dict = Depends(get_current_user)):
    """Delete a P&P document and all its chunks."""
    # Verify the document exists and is a P&P document
    result = (
        supabase_admin.table("documents")
        .select("id, source")
        .eq("id", doc_id)
        .eq("source", TAM_POLICIES_SOURCE)
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="P&P document not found.")

    # Delete chunks first (foreign key constraint)
    supabase_admin.table("chunks").delete().eq("document_id", doc_id).execute()

    # Delete the document
    supabase_admin.table("documents").delete().eq("id", doc_id).execute()

    return {"status": "deleted", "id": doc_id}
