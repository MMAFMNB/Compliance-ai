"""Alerts service: process new CMA publications and generate AI impact summaries."""

import logging

import anthropic
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from auth import get_current_user
from config import ANTHROPIC_API_KEY, MODEL
from database import supabase_admin

router = APIRouter(prefix="/api", tags=["alerts"])
logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


class AlertOut(BaseModel):
    id: str
    title: str
    title_en: str | None
    source_url: str
    publication_date: str | None
    doc_type: str
    summary: str | None
    impact_summary: str | None
    is_read: bool
    created_at: str


class AlertsResponse(BaseModel):
    alerts: list[AlertOut]
    total: int
    unread: int


IMPACT_PROMPT = """You are TAM Compliance AI. A new CMA publication has been detected:

Title: {title}
Type: {doc_type}
URL: {source_url}

Generate a brief impact summary (3-5 sentences) for a compliance officer at a CMA-licensed asset management firm. Cover:
1. What this publication is about
2. Which areas of compliance it affects (fund management, AML/KYC, reporting, etc.)
3. What action the compliance team should take

Respond in both Arabic and English, Arabic first. Keep it concise."""


def generate_impact_summary(alert: dict) -> str | None:
    """Generate an AI impact summary for a new CMA publication."""
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": IMPACT_PROMPT.format(
                        title=alert.get("title", ""),
                        doc_type=alert.get("doc_type", ""),
                        source_url=alert.get("source_url", ""),
                    ),
                }
            ],
        )
        text_blocks = [b for b in response.content if b.type == "text"]
        return text_blocks[0].text if text_blocks else None
    except Exception:
        logger.exception("Failed to generate impact summary for alert %s", alert.get("id"))
        return None


def process_unprocessed_alerts() -> int:
    """Generate impact summaries for all unprocessed alerts. Returns count processed."""
    result = (
        supabase_admin.table("alerts")
        .select("*")
        .eq("is_processed", False)
        .order("created_at", desc=False)
        .limit(10)
        .execute()
    )

    processed = 0
    for alert in result.data:
        summary = generate_impact_summary(alert)
        if summary:
            supabase_admin.table("alerts").update(
                {"impact_summary": summary, "is_processed": True}
            ).eq("id", alert["id"]).execute()
            processed += 1

    return processed


@router.get("/alerts", response_model=AlertsResponse)
def list_alerts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    unread_only: bool = Query(False),
    user: dict = Depends(get_current_user),
):
    """List CMA publication alerts with read status for the current user."""
    # Get all alerts
    query = (
        supabase_admin.table("alerts")
        .select("*", count="exact")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
    )
    result = query.execute()

    # Get user's read alert IDs
    reads = (
        supabase_admin.table("alert_reads")
        .select("alert_id")
        .eq("user_id", user["id"])
        .execute()
    )
    read_ids = {r["alert_id"] for r in reads.data}

    alerts = []
    for a in result.data:
        is_read = a["id"] in read_ids
        if unread_only and is_read:
            continue
        alerts.append(
            AlertOut(
                id=a["id"],
                title=a["title"],
                title_en=a.get("title_en"),
                source_url=a["source_url"],
                publication_date=str(a["publication_date"]) if a.get("publication_date") else None,
                doc_type=a["doc_type"],
                summary=a.get("summary"),
                impact_summary=a.get("impact_summary"),
                is_read=is_read,
                created_at=a["created_at"],
            )
        )

    # Count total unread
    total_alerts = result.count or 0
    unread_count = total_alerts - len(read_ids)

    return AlertsResponse(alerts=alerts, total=total_alerts, unread=max(0, unread_count))


@router.post("/alerts/{alert_id}/read")
def mark_alert_read(alert_id: str, user: dict = Depends(get_current_user)):
    """Mark an alert as read for the current user."""
    supabase_admin.table("alert_reads").upsert(
        {"alert_id": alert_id, "user_id": user["id"]}
    ).execute()
    return {"status": "read"}


@router.post("/alerts/process")
def trigger_processing(user: dict = Depends(get_current_user)):
    """Manually trigger impact summary generation for unprocessed alerts."""
    processed = process_unprocessed_alerts()
    return {"processed": processed}
