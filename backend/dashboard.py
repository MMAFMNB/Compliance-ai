"""Dashboard API: stats, audit trail, and reporting."""

import logging
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from auth import get_current_user
from database import supabase_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class DashboardStats(BaseModel):
    total_conversations: int
    total_messages: int
    total_documents: int
    total_chunks: int
    total_reviews: int
    total_alerts: int
    unread_alerts: int
    recent_topics: list[str]


class AuditEntry(BaseModel):
    id: str
    type: str  # "chat", "review"
    summary: str
    created_at: str


class AuditResponse(BaseModel):
    entries: list[AuditEntry]
    total: int


@router.get("/stats", response_model=DashboardStats)
def get_stats(user: dict = Depends(get_current_user)):
    """Get dashboard statistics for the current user."""
    user_id = user["id"]

    # Conversation count
    convs = (
        supabase_admin.table("conversations")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )

    # Message count
    msgs = (
        supabase_admin.table("messages")
        .select("id, conversation_id", count="exact")
        .execute()
    )
    # Filter messages by user's conversations
    user_conv_ids = (
        supabase_admin.table("conversations")
        .select("id")
        .eq("user_id", user_id)
        .execute()
    )
    conv_ids = [c["id"] for c in user_conv_ids.data]
    user_msg_count = 0
    if conv_ids:
        user_msgs = (
            supabase_admin.table("messages")
            .select("id", count="exact")
            .in_("conversation_id", conv_ids)
            .execute()
        )
        user_msg_count = user_msgs.count or 0

    # Document + chunk counts (global)
    docs = supabase_admin.table("documents").select("id", count="exact").execute()
    chunks = supabase_admin.table("chunks").select("id", count="exact").execute()

    # Review count
    reviews = (
        supabase_admin.table("document_reviews")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )

    # Alert counts
    alerts = supabase_admin.table("alerts").select("id", count="exact").execute()
    reads = (
        supabase_admin.table("alert_reads")
        .select("alert_id")
        .eq("user_id", user_id)
        .execute()
    )
    total_alerts = alerts.count or 0
    unread_alerts = total_alerts - len(reads.data)

    # Recent topics from user's last 10 conversations (first message preview)
    recent_topics = []
    if conv_ids:
        recent_convs = (
            supabase_admin.table("conversations")
            .select("id")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        for conv in recent_convs.data:
            first_msg = (
                supabase_admin.table("messages")
                .select("content")
                .eq("conversation_id", conv["id"])
                .eq("role", "user")
                .order("created_at", desc=False)
                .limit(1)
                .execute()
            )
            if first_msg.data:
                recent_topics.append(first_msg.data[0]["content"][:80])

    return DashboardStats(
        total_conversations=convs.count or 0,
        total_messages=user_msg_count,
        total_documents=docs.count or 0,
        total_chunks=chunks.count or 0,
        total_reviews=reviews.count or 0,
        total_alerts=total_alerts,
        unread_alerts=max(0, unread_alerts),
        recent_topics=recent_topics,
    )


@router.get("/audit", response_model=AuditResponse)
def get_audit_trail(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    """Get the user's audit trail: recent chats and reviews."""
    user_id = user["id"]
    entries = []

    # Recent conversations
    convs = (
        supabase_admin.table("conversations")
        .select("id, created_at, messages(content, role)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    for conv in convs.data:
        msgs = conv.get("messages", [])
        preview = msgs[0]["content"][:80] if msgs else "..."
        entries.append(
            AuditEntry(
                id=conv["id"],
                type="chat",
                summary=preview,
                created_at=conv["created_at"],
            )
        )

    # Recent reviews
    reviews = (
        supabase_admin.table("document_reviews")
        .select("id, filename, total_findings, non_compliant, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    for rev in reviews.data:
        summary = f"{rev['filename']} \u2014 {rev['total_findings']} findings, {rev['non_compliant']} non-compliant"
        entries.append(
            AuditEntry(
                id=rev["id"],
                type="review",
                summary=summary,
                created_at=rev["created_at"],
            )
        )

    # Sort all entries by date
    entries.sort(key=lambda e: e.created_at, reverse=True)
    total = len(entries)
    entries = entries[offset : offset + limit]

    return AuditResponse(entries=entries, total=total)


@router.get("/stat-detail")
def get_stat_detail(
    type: str = Query(..., description="One of: conversations, messages, documents, reviews, alerts, chunks"),
    limit: int = Query(10, ge=1, le=50),
    user: dict = Depends(get_current_user),
):
    """Return recent items for a given stat card."""
    user_id = user["id"]
    items: list[dict] = []

    if type == "conversations":
        rows = (
            supabase_admin.table("conversations")
            .select("id, created_at, messages(content, role)")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        for r in rows.data:
            msgs = r.get("messages", [])
            preview = msgs[0]["content"][:100] if msgs else "..."
            items.append({"id": r["id"], "title": preview, "date": r["created_at"]})

    elif type == "messages":
        conv_ids_res = (
            supabase_admin.table("conversations")
            .select("id")
            .eq("user_id", user_id)
            .execute()
        )
        conv_ids = [c["id"] for c in conv_ids_res.data]
        if conv_ids:
            rows = (
                supabase_admin.table("messages")
                .select("id, content, role, created_at, conversation_id")
                .in_("conversation_id", conv_ids)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            for r in rows.data:
                items.append({
                    "id": r["id"],
                    "title": f"[{r['role']}] {r['content'][:100]}",
                    "date": r["created_at"],
                })

    elif type == "documents":
        rows = (
            supabase_admin.table("documents")
            .select("id, title, doc_type, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        for r in rows.data:
            items.append({
                "id": r["id"],
                "title": r.get("title") or r.get("doc_type", "Document"),
                "subtitle": r.get("doc_type", ""),
                "date": r["created_at"],
            })

    elif type == "reviews":
        rows = (
            supabase_admin.table("document_reviews")
            .select("id, filename, total_findings, non_compliant, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        for r in rows.data:
            items.append({
                "id": r["id"],
                "title": r["filename"],
                "subtitle": f"{r['total_findings']} findings \u2022 {r['non_compliant']} non-compliant",
                "date": r["created_at"],
            })

    elif type == "alerts":
        rows = (
            supabase_admin.table("alerts")
            .select("id, title, severity, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        for r in rows.data:
            items.append({
                "id": r["id"],
                "title": r.get("title", "Alert"),
                "subtitle": r.get("severity", ""),
                "date": r["created_at"],
            })

    elif type == "chunks":
        rows = (
            supabase_admin.table("chunks")
            .select("id, document_id, content, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        for r in rows.data:
            items.append({
                "id": r["id"],
                "title": r["content"][:100] if r.get("content") else "Chunk",
                "date": r["created_at"],
            })

    else:
        return {"items": [], "error": "Unknown stat type"}

    return {"items": items}


@router.post("/scan-cma")
def scan_cma(user: dict = Depends(get_current_user)):
    """Manually trigger a CMA scrape for new updates, circulars, and regulations."""
    try:
        from scraper import run_scraper
        result = run_scraper(parse_circulars=True)
        logger.info("Manual CMA scan result: %s", result)
        return {
            "status": "ok",
            "news_found": result.get("news_found", 0),
            "circulars_found": result.get("circulars_found", 0),
            "regulations_found": result.get("regulations_found", 0),
            "total_saved": result.get("total_saved", 0),
            "obligations_extracted": result.get("obligations_extracted", 0),
        }
    except Exception as exc:
        logger.exception("Manual CMA scan failed")
        return JSONResponse(status_code=500, content={"detail": str(exc)})


@router.post("/ingest-aml")
def ingest_aml(user: dict = Depends(get_current_user)):
    """Manually trigger AML document ingestion from aml.gov.sa."""
    try:
        from ingest_aml import run_aml_ingestion
        result = run_aml_ingestion()
        logger.info("Manual AML ingestion result: %s", result)
        return {
            "status": "ok",
            "documents_ingested": result.get("documents_ingested", 0),
            "chunks_created": result.get("chunks_created", 0),
            "errors": result.get("errors", []),
        }
    except Exception as exc:
        logger.exception("Manual AML ingestion failed")
        return JSONResponse(status_code=500, content={"detail": str(exc)})


@router.get("/sources")
def get_data_sources(user: dict = Depends(get_current_user)):
    """Return stats for all data sources (CMA, AML, etc.)."""
    sources = []

    # CMA source
    cma_docs = supabase_admin.table("documents").select("id", count="exact").eq("source", "cma.gov.sa").execute()
    cma_alerts = supabase_admin.table("alerts").select("id, created_at", count="exact").order("created_at", desc=True).limit(1).execute()

    sources.append({
        "name": "CMA",
        "name_ar": "هيئة السوق المالية",
        "domain": "cma.gov.sa",
        "documents": cma_docs.count or 0,
        "alerts": (supabase_admin.table("alerts").select("id", count="exact").execute()).count or 0,
        "last_scan": cma_alerts.data[0]["created_at"] if cma_alerts.data else None,
        "status": "active",
    })

    # AML source
    aml_docs = supabase_admin.table("documents").select("id", count="exact").eq("source", "aml.gov.sa").execute()

    # High risk countries count
    try:
        hrc = supabase_admin.table("high_risk_countries").select("id", count="exact").execute()
        hrc_count = hrc.count or 0
    except Exception:
        hrc_count = 0

    sources.append({
        "name": "AML/SAFIU",
        "name_ar": "الإدارة العامة للتحريات المالية",
        "domain": "aml.gov.sa",
        "documents": aml_docs.count or 0,
        "high_risk_countries": hrc_count,
        "last_scan": None,  # Will be populated once scraping runs
        "status": "active",
    })

    return {"sources": sources}


@router.post("/scan-aml")
def scan_aml(user: dict = Depends(get_current_user)):
    """Manually trigger AML.gov.sa scrape for new publications and high risk countries."""
    try:
        from scrape_aml import run_aml_scraper
        result = run_aml_scraper()
        logger.info("Manual AML scan result: %s", result)
        return {
            "status": "ok",
            "new_publications": result.get("new_publications", 0),
            "high_risk_countries_updated": result.get("high_risk_countries_updated", 0),
        }
    except Exception as exc:
        logger.exception("Manual AML scan failed")
        return JSONResponse(status_code=500, content={"detail": str(exc)})
