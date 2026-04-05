"""Feedback capture system: rate AI outputs for future ML training."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from auth import get_current_user
from database import supabase_admin

router = APIRouter(prefix="/api/feedback", tags=["feedback"])
logger = logging.getLogger(__name__)

VALID_FEATURES = {"chat", "review", "docgen", "obligations"}
VALID_RATINGS = {"approved", "needs_edit", "rejected"}


# ─── Models ────────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    feature: str
    resource_id: Optional[str] = None
    rating: str  # approved / needs_edit / rejected
    original_output: Optional[str] = None
    edited_output: Optional[str] = None
    comments: Optional[str] = None
    metadata: dict = {}


class FeedbackOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    feature: str
    resource_id: Optional[str] = None
    rating: str
    original_output: Optional[str] = None
    edited_output: Optional[str] = None
    comments: Optional[str] = None
    metadata: dict = {}
    created_at: str


# ─── Endpoints ─────────────────────────────────────────────

@router.post("/", response_model=FeedbackOut)
def submit_feedback(
    body: FeedbackCreate,
    user: dict = Depends(get_current_user),
):
    """Submit feedback on an AI-generated output."""
    if body.feature not in VALID_FEATURES:
        raise HTTPException(status_code=400, detail=f"Invalid feature: {body.feature}")
    if body.rating not in VALID_RATINGS:
        raise HTTPException(status_code=400, detail=f"Invalid rating: {body.rating}")

    row = {
        "user_id": user["id"],
        "firm_id": user.get("firm_id"),
        "feature": body.feature,
        "resource_id": body.resource_id,
        "rating": body.rating,
        "original_output": body.original_output,
        "edited_output": body.edited_output,
        "comments": body.comments,
        "metadata": body.metadata,
    }

    result = supabase_admin.table("feedback").insert(row).execute()
    return result.data[0]


@router.get("/", response_model=list[FeedbackOut])
def list_feedback(
    feature: Optional[str] = Query(None),
    rating: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    """List feedback entries. Admins see all in their firm; users see their own."""
    query = (
        supabase_admin.table("feedback")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
    )

    if user.get("role") in ("super_admin",):
        pass  # See all
    elif user.get("role") in ("firm_admin",):
        query = query.eq("firm_id", user.get("firm_id"))
    else:
        query = query.eq("user_id", user["id"])

    if feature:
        query = query.eq("feature", feature)
    if rating:
        query = query.eq("rating", rating)

    result = query.execute()
    return result.data


@router.get("/summary")
def feedback_summary(
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(get_current_user),
):
    """Aggregated feedback statistics for the dashboard."""
    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    query = (
        supabase_admin.table("feedback")
        .select("feature, rating")
        .gte("created_at", cutoff)
    )

    if user.get("role") == "super_admin":
        pass
    elif user.get("role") == "firm_admin":
        query = query.eq("firm_id", user.get("firm_id"))
    else:
        query = query.eq("user_id", user["id"])

    result = query.execute()

    total = len(result.data)
    by_rating: dict[str, int] = {}
    by_feature: dict[str, dict[str, int]] = {}

    for row in result.data:
        r = row["rating"]
        f = row["feature"]
        by_rating[r] = by_rating.get(r, 0) + 1
        if f not in by_feature:
            by_feature[f] = {}
        by_feature[f][r] = by_feature[f].get(r, 0) + 1

    # Approval rate
    approved = by_rating.get("approved", 0)
    approval_rate = round((approved / total) * 100, 1) if total > 0 else 0.0

    return {
        "period_days": days,
        "total": total,
        "approval_rate": approval_rate,
        "by_rating": by_rating,
        "by_feature": by_feature,
    }


@router.get("/export")
def export_feedback(
    feature: Optional[str] = Query(None),
    format: str = Query("jsonl", description="Export format: jsonl or csv"),
    user: dict = Depends(get_current_user),
):
    """Export feedback data for ML training.

    Returns JSONL (one JSON object per line) or CSV.
    Only accessible by admins.
    """
    if user.get("role") not in ("super_admin", "firm_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    query = (
        supabase_admin.table("feedback")
        .select("feature, rating, original_output, edited_output, comments, metadata, created_at")
        .order("created_at", desc=False)
    )

    if user.get("role") == "firm_admin":
        query = query.eq("firm_id", user.get("firm_id"))
    if feature:
        query = query.eq("feature", feature)

    result = query.execute()

    if format == "csv":
        import csv
        import io

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["feature", "rating", "original_output", "edited_output", "comments", "created_at"])
        for row in result.data:
            writer.writerow([
                row["feature"],
                row["rating"],
                row.get("original_output", ""),
                row.get("edited_output", ""),
                row.get("comments", ""),
                row["created_at"],
            ])
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=feedback_export.csv"},
        )
    else:
        # JSONL format
        lines = []
        for row in result.data:
            lines.append(json.dumps(row, ensure_ascii=False))

        content = "\n".join(lines)
        return StreamingResponse(
            iter([content]),
            media_type="application/jsonl",
            headers={"Content-Disposition": "attachment; filename=feedback_export.jsonl"},
        )
