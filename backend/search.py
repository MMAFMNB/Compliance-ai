"""Regulation search API: full-text + vector search across all CMA documents."""

import os

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from database import supabase_admin

router = APIRouter(prefix="/api", tags=["search"])

RAG_ENABLED = os.getenv("RAG_ENABLED", "false").lower() == "true"


class SearchResult(BaseModel):
    chunk_id: str
    content: str
    article_number: str | None
    part: str | None
    chapter: str | None
    document_id: str
    document_title: str | None = None
    relevance_score: float


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]
    total: int


@router.get("/search", response_model=SearchResponse)
def search_regulations(
    q: str = Query(..., min_length=2, description="Search query"),
    doc_type: str | None = Query(None, description="Filter by document type"),
    lang: str | None = Query(None, description="Filter by language (ar/en)"),
    user: dict = Depends(get_current_user),
):
    """Search across all ingested CMA regulations.

    Combines vector similarity search with keyword matching for article numbers.
    """
    if not RAG_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="Search requires RAG to be enabled. Set RAG_ENABLED=true with sentence-transformers installed.",
        )

    # Lazy import — only loaded when RAG is enabled and endpoint is called
    from rag import rag_query

    chunks = rag_query(query=q, doc_type=doc_type)

    doc_ids = list({c["document_id"] for c in chunks if c.get("document_id")})
    doc_titles = {}
    if doc_ids:
        docs = (
            supabase_admin.table("documents")
            .select("id, title, title_en")
            .in_("id", doc_ids)
            .execute()
        )
        for d in docs.data:
            doc_titles[d["id"]] = d.get("title_en") or d.get("title", "")

    results = [
        SearchResult(
            chunk_id=str(c.get("id", "")),
            content=c.get("content", ""),
            article_number=c.get("article_number"),
            part=c.get("part"),
            chapter=c.get("chapter"),
            document_id=str(c.get("document_id", "")),
            document_title=doc_titles.get(c.get("document_id"), None),
            relevance_score=round(c.get("relevance_score", 0), 4),
        )
        for c in chunks
    ]

    return SearchResponse(query=q, results=results, total=len(results))
