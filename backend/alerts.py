"""Alerts service: process new CMA publications and generate AI impact summaries."""

import logging

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from auth import get_current_user
from api_utils import call_anthropic
from database import supabase_admin

router = APIRouter(prefix="/api", tags=["alerts"])
logger = logging.getLogger(__name__)


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
        response = call_anthropic(
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


@router.post("/alerts/scrape")
def trigger_scrape(user: dict = Depends(get_current_user)):
    """Run the full CMA scraper pipeline: scrape, summarize, and parse."""
    from scraper import run_scraper
    result = run_scraper(parse_circulars=True)
    return result


@router.post("/alerts/parse")
def trigger_parse(user: dict = Depends(get_current_user)):
    """Parse unprocessed alerts for regulatory obligations."""
    from circular_parser import process_unparsed_alerts
    result = process_unparsed_alerts()
    return result


@router.get("/obligations")
def list_obligations(
    category: str | None = Query(None),
    priority: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    """List regulatory obligations extracted from CMA circulars."""
    query = (
        supabase_admin.table("regulatory_obligations")
        .select("*, alerts(title, title_en, doc_type, source_url)")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if category:
        query = query.eq("category", category)
    if priority:
        query = query.eq("priority", priority)
    if status:
        query = query.eq("status", status)

    result = query.execute()
    return {"obligations": result.data, "total": len(result.data)}


@router.patch("/obligations/{obligation_id}/status")
def update_obligation_status(
    obligation_id: str,
    status: str = Query(..., description="pending, acknowledged, or completed"),
    user: dict = Depends(get_current_user),
):
    """Update the status of a regulatory obligation."""
    if status not in ("pending", "acknowledged", "completed"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Invalid status")
    supabase_admin.table("regulatory_obligations").update(
        {"status": status}
    ).eq("id", obligation_id).execute()
    return {"status": "updated"}


@router.post("/obligations/{obligation_id}/assign")
def assign_obligation(
    obligation_id: str,
    assigned_to: str = Query(..., description="User ID to assign to"),
    due_date: str | None = Query(None, description="Due date YYYY-MM-DD"),
    user: dict = Depends(get_current_user),
):
    """Assign a regulatory obligation to a user with an optional due date."""
    updates: dict = {
        "assigned_to": assigned_to,
        "status": "acknowledged",
    }
    if due_date:
        updates["deadline_date"] = due_date
    supabase_admin.table("regulatory_obligations").update(
        updates
    ).eq("id", obligation_id).execute()
    return {"status": "assigned"}


@router.get("/obligations/summary")
def obligations_summary(user: dict = Depends(get_current_user)):
    """Summary statistics for the regulatory intelligence dashboard."""
    all_obs = (
        supabase_admin.table("regulatory_obligations")
        .select("id, priority, status, category, deadline_date")
        .execute()
    )

    total = len(all_obs.data)
    pending = sum(1 for o in all_obs.data if o["status"] == "pending")
    acknowledged = sum(1 for o in all_obs.data if o["status"] == "acknowledged")
    completed = sum(1 for o in all_obs.data if o["status"] == "completed")
    high_priority = sum(1 for o in all_obs.data if o["priority"] == "high" and o["status"] != "completed")

    by_category: dict[str, int] = {}
    for o in all_obs.data:
        cat = o.get("category", "other")
        by_category[cat] = by_category.get(cat, 0) + 1

    return {
        "total": total,
        "pending": pending,
        "acknowledged": acknowledged,
        "completed": completed,
        "high_priority_open": high_priority,
        "by_category": by_category,
    }
