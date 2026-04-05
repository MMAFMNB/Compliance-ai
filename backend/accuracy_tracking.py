"""Accuracy tracking system: aggregate feedback data into time-series metrics showing AI improvement."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from database import supabase_admin

router = APIRouter(prefix="/api/accuracy", tags=["accuracy"])
logger = logging.getLogger(__name__)

# Valid period types
PERIOD_TYPES = {"daily", "weekly", "monthly"}
VALID_FEATURES = {"chat", "review", "docgen", "obligations"}


# ─── Role guards ───────────────────────────────────────────


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Ensure user is firm_admin or super_admin."""
    if user.get("role") not in ("super_admin", "firm_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ─── Models ────────────────────────────────────────────────


class AccuracyMetricCreate(BaseModel):
    period_type: Literal["daily", "weekly", "monthly"]
    feature: str = "all"
    period_start: str  # ISO 8601 datetime
    period_end: str    # ISO 8601 datetime
    total_interactions: int
    approved_count: int
    needs_edit_count: int
    rejected_count: int
    approval_rate: float  # percentage 0-100
    improvement_vs_previous: Optional[float] = None


class AccuracyMetricOut(BaseModel):
    id: str
    firm_id: str
    period_type: str
    feature: str
    period_start: str
    period_end: str
    total_interactions: int
    approved_count: int
    needs_edit_count: int
    rejected_count: int
    approval_rate: float
    improvement_vs_previous: Optional[float]
    created_at: str


class TrendPoint(BaseModel):
    period: str  # ISO date string or week/month identifier
    approval_rate: float
    total: int
    improvement: Optional[float]


class TrendResponse(BaseModel):
    feature: str
    period_type: str
    trends: list[TrendPoint]


class AccuracySummary(BaseModel):
    current_approval_rate: float  # last 30 days
    trend_direction: Literal["improving", "declining", "stable"]
    best_feature: Optional[str]
    best_feature_rate: float
    worst_feature: Optional[str]
    worst_feature_rate: float
    total_feedback_collected: int
    overall_improvement: float  # current month vs first month
    last_computed_at: str


# ─── Helper Functions ──────────────────────────────────────


def get_period_boundaries(period_type: str, reference_date: Optional[datetime] = None) -> tuple[datetime, datetime]:
    """Get period start and end based on period type and reference date.

    Args:
        period_type: 'daily', 'weekly', or 'monthly'
        reference_date: Date to calculate period for. Defaults to now().

    Returns:
        Tuple of (period_start, period_end) in UTC.
    """
    if reference_date is None:
        reference_date = datetime.now(timezone.utc)
    else:
        reference_date = reference_date.replace(tzinfo=timezone.utc)

    if period_type == "daily":
        period_start = reference_date.replace(hour=0, minute=0, second=0, microsecond=0)
        period_end = period_start + timedelta(days=1)
    elif period_type == "weekly":
        # Week starts on Monday
        days_since_monday = reference_date.weekday()
        period_start = reference_date.replace(hour=0, minute=0, second=0, microsecond=0)
        period_start -= timedelta(days=days_since_monday)
        period_end = period_start + timedelta(days=7)
    elif period_type == "monthly":
        period_start = reference_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        # Get first day of next month
        if period_start.month == 12:
            period_end = period_start.replace(year=period_start.year + 1, month=1)
        else:
            period_end = period_start.replace(month=period_start.month + 1)
    else:
        raise ValueError(f"Invalid period_type: {period_type}")

    return period_start, period_end


def calculate_feedback_stats(feedback_data: list[dict]) -> dict:
    """Calculate approval rate and counts from feedback list.

    Args:
        feedback_data: List of feedback records with 'rating' field.

    Returns:
        Dict with total_interactions, approved_count, needs_edit_count, rejected_count, approval_rate.
    """
    total = len(feedback_data)
    approved = sum(1 for f in feedback_data if f.get("rating") == "approved")
    needs_edit = sum(1 for f in feedback_data if f.get("rating") == "needs_edit")
    rejected = sum(1 for f in feedback_data if f.get("rating") == "rejected")

    approval_rate = (approved / total * 100) if total > 0 else 0.0

    return {
        "total_interactions": total,
        "approved_count": approved,
        "needs_edit_count": needs_edit,
        "rejected_count": rejected,
        "approval_rate": round(approval_rate, 2),
    }


def log_learning_event(user_id: str, firm_id: str, event_type: str, details: dict):
    """Log a learning event for tracking system improvements."""
    try:
        supabase_admin.table("learning_events").insert({
            "firm_id": firm_id,
            "event_type": event_type,
            "details": details,
            "triggered_by": user_id or "system",
        }).execute()
    except Exception:
        logger.exception("Failed to log learning event")


# ─── Endpoints ─────────────────────────────────────────────


@router.post("/compute", response_model=AccuracyMetricOut)
def compute_accuracy_metrics(
    period_type: str = Query(..., description="daily, weekly, or monthly"),
    feature: str = Query("all", description="Feature name or 'all' for all features"),
    reference_date: Optional[str] = Query(None, description="ISO 8601 date for metric period (defaults to today)"),
    user: dict = Depends(require_admin),
):
    """Compute accuracy metrics for a period.

    Queries feedback table for the period, calculates approval rates,
    compares with previous period, saves metrics, and logs learning event.
    Admin only.
    """
    if period_type not in PERIOD_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid period_type: {period_type}")

    if feature != "all" and feature not in VALID_FEATURES:
        raise HTTPException(status_code=400, detail=f"Invalid feature: {feature}")

    firm_id = user.get("firm_id")
    if not firm_id and user.get("role") != "super_admin":
        raise HTTPException(status_code=400, detail="User must belong to a firm")

    # Parse reference date if provided
    ref_date = None
    if reference_date:
        try:
            ref_date = datetime.fromisoformat(reference_date.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format, use ISO 8601")

    # Get period boundaries
    period_start, period_end = get_period_boundaries(period_type, ref_date)

    # Query feedback for this period
    feedback_query = (
        supabase_admin.table("feedback")
        .select("rating")
        .gte("created_at", period_start.isoformat())
        .lt("created_at", period_end.isoformat())
    )

    if user.get("role") != "super_admin":
        feedback_query = feedback_query.eq("firm_id", firm_id)

    if feature != "all":
        feedback_query = feedback_query.eq("feature", feature)

    result = feedback_query.execute()
    feedback_data = result.data or []

    # Calculate stats
    stats = calculate_feedback_stats(feedback_data)

    # Get previous period stats for comparison
    prev_start = period_start - (period_end - period_start)
    prev_end = period_start

    prev_query = (
        supabase_admin.table("feedback")
        .select("rating")
        .gte("created_at", prev_start.isoformat())
        .lt("created_at", prev_end.isoformat())
    )

    if user.get("role") != "super_admin":
        prev_query = prev_query.eq("firm_id", firm_id)

    if feature != "all":
        prev_query = prev_query.eq("feature", feature)

    prev_result = prev_query.execute()
    prev_feedback = prev_result.data or []
    prev_stats = calculate_feedback_stats(prev_feedback)

    # Calculate improvement
    improvement_vs_previous = None
    if prev_stats["total_interactions"] > 0:
        improvement_vs_previous = round(
            stats["approval_rate"] - prev_stats["approval_rate"],
            2,
        )

    # Save metric
    metric_row = {
        "firm_id": firm_id,
        "period_type": period_type,
        "feature": feature,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "total_interactions": stats["total_interactions"],
        "approved_count": stats["approved_count"],
        "needs_edit_count": stats["needs_edit_count"],
        "rejected_count": stats["rejected_count"],
        "approval_rate": stats["approval_rate"],
        "improvement_vs_previous": improvement_vs_previous,
    }

    insert_result = supabase_admin.table("accuracy_metrics").insert(metric_row).execute()
    metric = insert_result.data[0]

    # Log learning event
    log_learning_event(
        user["id"],
        firm_id,
        "metric_computed",
        {
            "period_type": period_type,
            "feature": feature,
            "approval_rate": stats["approval_rate"],
            "total_interactions": stats["total_interactions"],
            "improvement_vs_previous": improvement_vs_previous,
        },
    )

    logger.info(
        "Computed accuracy metric: period_type=%s feature=%s approval_rate=%.2f%% total=%d",
        period_type,
        feature,
        stats["approval_rate"],
        stats["total_interactions"],
    )

    return metric


@router.get("/metrics", response_model=list[AccuracyMetricOut])
def get_accuracy_metrics(
    feature: Optional[str] = Query(None),
    period_type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None, description="ISO 8601 date to filter from"),
    end_date: Optional[str] = Query(None, description="ISO 8601 date to filter until"),
    limit: int = Query(100, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    """Get accuracy metrics filtered by feature, period type, and date range.

    Scoped to user's firm for non-super-admins.
    """
    firm_id = user.get("firm_id")

    query = (
        supabase_admin.table("accuracy_metrics")
        .select("*")
        .order("period_start", desc=True)
        .limit(limit)
    )

    # Scope to firm unless super_admin
    if user.get("role") != "super_admin" and firm_id:
        query = query.eq("firm_id", firm_id)

    if feature and feature != "all":
        query = query.eq("feature", feature)

    if period_type and period_type in PERIOD_TYPES:
        query = query.eq("period_type", period_type)

    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            query = query.gte("period_start", start_dt.isoformat())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format")

    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            query = query.lte("period_end", end_dt.isoformat())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format")

    result = query.execute()
    return result.data or []


@router.get("/trends", response_model=TrendResponse)
def get_trend_data(
    feature: str = Query("all"),
    period_type: str = Query("weekly"),
    last_n_periods: int = Query(12, ge=1, le=52),
    user: dict = Depends(get_current_user),
):
    """Get trend data for time-series charts.

    Returns approval rate, total interactions, and improvement for each period.
    """
    if feature != "all" and feature not in VALID_FEATURES:
        raise HTTPException(status_code=400, detail=f"Invalid feature: {feature}")

    if period_type not in PERIOD_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid period_type: {period_type}")

    firm_id = user.get("firm_id")

    query = (
        supabase_admin.table("accuracy_metrics")
        .select("*")
        .eq("period_type", period_type)
        .order("period_start", desc=True)
        .limit(last_n_periods)
    )

    if user.get("role") != "super_admin" and firm_id:
        query = query.eq("firm_id", firm_id)

    if feature != "all":
        query = query.eq("feature", feature)

    result = query.execute()
    metrics = result.data or []

    # Reverse to chronological order
    metrics = list(reversed(metrics))

    # Build trend points
    trends = []
    for metric in metrics:
        period_str = metric["period_start"][:10]  # Use start date as identifier
        trends.append(TrendPoint(
            period=period_str,
            approval_rate=metric["approval_rate"],
            total=metric["total_interactions"],
            improvement=metric.get("improvement_vs_previous"),
        ))

    return TrendResponse(
        feature=feature,
        period_type=period_type,
        trends=trends,
    )


@router.get("/summary", response_model=AccuracySummary)
def get_accuracy_summary(
    user: dict = Depends(get_current_user),
):
    """Get overall accuracy summary for dashboard.

    Returns current approval rate (last 30 days), trend direction,
    best/worst performing features, total feedback, and overall improvement.
    """
    firm_id = user.get("firm_id")

    # Current period: last 30 days
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    current_query = (
        supabase_admin.table("feedback")
        .select("rating, feature")
        .gte("created_at", thirty_days_ago.isoformat())
    )

    if user.get("role") != "super_admin" and firm_id:
        current_query = current_query.eq("firm_id", firm_id)

    current_result = current_query.execute()
    current_feedback = current_result.data or []

    current_stats = calculate_feedback_stats(current_feedback)
    current_approval = current_stats["approval_rate"]

    # Previous period: 30 days before that
    sixty_days_ago = now - timedelta(days=60)
    prev_query = (
        supabase_admin.table("feedback")
        .select("rating")
        .gte("created_at", sixty_days_ago.isoformat())
        .lt("created_at", thirty_days_ago.isoformat())
    )

    if user.get("role") != "super_admin" and firm_id:
        prev_query = prev_query.eq("firm_id", firm_id)

    prev_result = prev_query.execute()
    prev_feedback = prev_result.data or []
    prev_stats = calculate_feedback_stats(prev_feedback)
    prev_approval = prev_stats["approval_rate"]

    # Determine trend direction
    if current_approval > prev_approval + 1:
        trend_direction = "improving"
    elif current_approval < prev_approval - 1:
        trend_direction = "declining"
    else:
        trend_direction = "stable"

    # Best and worst features (from last 30 days)
    feature_stats = {}
    for feedback in current_feedback:
        f = feedback.get("feature", "unknown")
        if f not in feature_stats:
            feature_stats[f] = {"approved": 0, "total": 0}
        feature_stats[f]["total"] += 1
        if feedback.get("rating") == "approved":
            feature_stats[f]["approved"] += 1

    best_feature = None
    best_rate = 0.0
    worst_feature = None
    worst_rate = 100.0

    for feat, stats in feature_stats.items():
        if stats["total"] > 0:
            rate = stats["approved"] / stats["total"] * 100
            if rate > best_rate:
                best_rate = rate
                best_feature = feat
            if rate < worst_rate:
                worst_rate = rate
                worst_feature = feat

    best_rate = round(best_rate, 2)
    worst_rate = round(worst_rate, 2)

    # Overall improvement: compare current month to first month on record
    oldest_query = supabase_admin.table("feedback").select("rating")
    if user.get("role") != "super_admin" and firm_id:
        oldest_query = oldest_query.eq("firm_id", firm_id)

    oldest_result = oldest_query.order("created_at").limit(1).execute()

    overall_improvement = 0.0
    if oldest_result.data:
        # Get first month from oldest record
        oldest_date = datetime.fromisoformat(oldest_result.data[0]["created_at"].replace("Z", "+00:00"))
        first_month_start = oldest_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        first_month_end = first_month_start + timedelta(days=32)
        first_month_end = first_month_end.replace(day=1)

        first_query = (
            supabase_admin.table("feedback")
            .select("rating")
            .gte("created_at", first_month_start.isoformat())
            .lt("created_at", first_month_end.isoformat())
        )

        if user.get("role") != "super_admin" and firm_id:
            first_query = first_query.eq("firm_id", firm_id)

        first_result = first_query.execute()
        first_feedback = first_result.data or []
        first_stats = calculate_feedback_stats(first_feedback)

        overall_improvement = round(current_approval - first_stats["approval_rate"], 2)

    # Get last metric computation timestamp
    metrics_query = supabase_admin.table("accuracy_metrics").select("created_at")
    if user.get("role") != "super_admin" and firm_id:
        metrics_query = metrics_query.eq("firm_id", firm_id)

    metrics_result = metrics_query.order("created_at", desc=True).limit(1).execute()
    last_computed_at = metrics_result.data[0]["created_at"] if metrics_result.data else now.isoformat()

    return AccuracySummary(
        current_approval_rate=current_approval,
        trend_direction=trend_direction,
        best_feature=best_feature,
        best_feature_rate=best_rate,
        worst_feature=worst_feature,
        worst_feature_rate=worst_rate,
        total_feedback_collected=len(current_feedback),
        overall_improvement=overall_improvement,
        last_computed_at=last_computed_at,
    )


@router.post("/compute-all")
def compute_all_metrics(
    weeks_back: int = Query(12, ge=1, le=52, description="Compute metrics for last N weeks"),
    user: dict = Depends(require_admin),
):
    """Batch compute accuracy metrics for all features for the last N weeks.

    Useful for initial backfill when deploying. Admin only.
    """
    firm_id = user.get("firm_id")
    if not firm_id and user.get("role") != "super_admin":
        raise HTTPException(status_code=400, detail="User must belong to a firm")

    computed_count = 0
    now = datetime.now(timezone.utc)

    # Compute weekly metrics for each feature going back
    for weeks_ago in range(weeks_back):
        reference_date = now - timedelta(weeks=weeks_ago)
        period_start, period_end = get_period_boundaries("weekly", reference_date)

        for feature in list(VALID_FEATURES) + ["all"]:
            feedback_query = (
                supabase_admin.table("feedback")
                .select("rating")
                .gte("created_at", period_start.isoformat())
                .lt("created_at", period_end.isoformat())
                .eq("feature", feature) if feature != "all" else None
            )

            if feature == "all":
                feedback_query = (
                    supabase_admin.table("feedback")
                    .select("rating")
                    .gte("created_at", period_start.isoformat())
                    .lt("created_at", period_end.isoformat())
                )

            if user.get("role") != "super_admin":
                feedback_query = feedback_query.eq("firm_id", firm_id)

            result = feedback_query.execute()
            feedback_data = result.data or []

            if not feedback_data:
                continue  # Skip if no feedback for this period/feature

            stats = calculate_feedback_stats(feedback_data)

            # Check if metric already exists
            existing = (
                supabase_admin.table("accuracy_metrics")
                .select("id")
                .eq("period_type", "weekly")
                .eq("feature", feature)
                .eq("period_start", period_start.isoformat())
            )

            if user.get("role") != "super_admin":
                existing = existing.eq("firm_id", firm_id)

            existing_result = existing.execute()

            if existing_result.data:
                continue  # Skip if already computed

            metric_row = {
                "firm_id": firm_id,
                "period_type": "weekly",
                "feature": feature,
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "total_interactions": stats["total_interactions"],
                "approved_count": stats["approved_count"],
                "needs_edit_count": stats["needs_edit_count"],
                "rejected_count": stats["rejected_count"],
                "approval_rate": stats["approval_rate"],
                "improvement_vs_previous": None,
            }

            try:
                supabase_admin.table("accuracy_metrics").insert(metric_row).execute()
                computed_count += 1
            except Exception:
                logger.exception("Failed to insert metric for period and feature", extra={
                    "feature": feature,
                    "period_start": period_start.isoformat(),
                })

    log_learning_event(
        user["id"],
        firm_id,
        "metrics_backfilled",
        {"weeks_back": weeks_back, "metrics_computed": computed_count},
    )

    logger.info(
        "Backfilled %d accuracy metrics for %d weeks",
        computed_count,
        weeks_back,
    )

    return {
        "status": "completed",
        "metrics_computed": computed_count,
        "weeks_back": weeks_back,
    }


# ─── Scheduler Helper ───────────────────────────────────────


async def scheduled_compute_weekly_metrics():
    """Helper function for scheduler: compute weekly metrics for all firms and features.

    Call this from a background scheduler (e.g., APScheduler) once per week.
    """
    logger.info("Starting scheduled weekly metric computation")

    try:
        # Get all active firms
        firms_result = supabase_admin.table("firms").select("id").eq("is_active", True).execute()
        firms = firms_result.data or []

        total_computed = 0

        for firm in firms:
            firm_id = firm["id"]
            now = datetime.now(timezone.utc)
            period_start, period_end = get_period_boundaries("weekly", now)

            # Compute "all" and each individual feature
            for feature in ["all"] + list(VALID_FEATURES):
                feedback_query = (
                    supabase_admin.table("feedback")
                    .select("rating")
                    .eq("firm_id", firm_id)
                    .gte("created_at", period_start.isoformat())
                    .lt("created_at", period_end.isoformat())
                )

                if feature != "all":
                    feedback_query = feedback_query.eq("feature", feature)

                result = feedback_query.execute()
                feedback_data = result.data or []

                if not feedback_data:
                    continue

                stats = calculate_feedback_stats(feedback_data)

                metric_row = {
                    "firm_id": firm_id,
                    "period_type": "weekly",
                    "feature": feature,
                    "period_start": period_start.isoformat(),
                    "period_end": period_end.isoformat(),
                    "total_interactions": stats["total_interactions"],
                    "approved_count": stats["approved_count"],
                    "needs_edit_count": stats["needs_edit_count"],
                    "rejected_count": stats["rejected_count"],
                    "approval_rate": stats["approval_rate"],
                    "improvement_vs_previous": None,
                }

                try:
                    supabase_admin.table("accuracy_metrics").insert(metric_row).execute()
                    total_computed += 1
                except Exception:
                    logger.exception("Failed to insert weekly metric", extra={
                        "firm_id": firm_id,
                        "feature": feature,
                    })

        logger.info("Scheduled metric computation completed: %d metrics computed", total_computed)

    except Exception:
        logger.exception("Error in scheduled_compute_weekly_metrics")
