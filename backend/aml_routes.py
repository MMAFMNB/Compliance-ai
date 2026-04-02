"""AML/CFT Case Management endpoints."""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from database import supabase_admin

router = APIRouter(prefix="/api/aml", tags=["aml"])
logger = logging.getLogger(__name__)

# Valid status and priority values
VALID_STATUSES = {"pending", "in_progress", "escalated", "closed"}
VALID_PRIORITIES = {"low", "medium", "high", "critical"}
VALID_CASE_TYPES = {"suspicious_activity", "customer_verification", "transaction_review", "other"}


# ─── Models ────────────────────────────────────────────────


class AMLEvidenceCreate(BaseModel):
    """Model for adding evidence to an AML case."""
    title: str
    description: Optional[str] = None
    evidence_type: str  # e.g., "transaction", "document", "report", "communication"
    file_url: Optional[str] = None
    metadata: dict = {}


class AMLEvidenceOut(BaseModel):
    """Output model for evidence."""
    id: str
    case_id: str
    title: str
    description: Optional[str] = None
    evidence_type: str
    file_url: Optional[str] = None
    metadata: dict
    created_by: str
    created_at: str


class AMLTimelineEntry(BaseModel):
    """Output model for timeline entries."""
    id: str
    case_id: str
    event_type: str
    description: Optional[str] = None
    created_by: str
    created_at: str


class AMLCaseCreate(BaseModel):
    """Model for creating an AML case."""
    title: str
    description: Optional[str] = None
    case_type: str  # suspicious_activity, customer_verification, transaction_review, other
    priority: str = "medium"  # low, medium, high, critical
    assigned_to: Optional[str] = None
    customer_id: Optional[str] = None
    transaction_ids: Optional[list[str]] = None
    metadata: dict = {}


class AMLCaseUpdate(BaseModel):
    """Model for updating an AML case."""
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    metadata: Optional[dict] = None


class AMLCaseEscalate(BaseModel):
    """Model for escalating an AML case."""
    escalation_reason: str
    escalated_to: Optional[str] = None


class AMLCaseClose(BaseModel):
    """Model for closing an AML case."""
    closure_reason: str
    closure_notes: Optional[str] = None


class AMLCaseOut(BaseModel):
    """Output model for a complete AML case."""
    id: str
    firm_id: Optional[str] = None
    case_number: str
    title: str
    description: Optional[str] = None
    case_type: str
    status: str
    priority: str
    assigned_to: Optional[str] = None
    customer_id: Optional[str] = None
    transaction_ids: Optional[list[str]] = None
    escalated_to: Optional[str] = None
    escalation_reason: Optional[str] = None
    escalated_at: Optional[str] = None
    closed_at: Optional[str] = None
    closure_reason: Optional[str] = None
    metadata: dict
    created_by: str
    created_at: str
    updated_at: str


# ─── Helper Functions ──────────────────────────────────────


def generate_case_number() -> str:
    """Generate a unique case number in format AML-YYYY-NNNN."""
    now = datetime.now(timezone.utc)
    year = now.year

    # Query the last case number for this year
    try:
        result = supabase_admin.table("aml_cases").select("case_number").order(
            "created_at", desc=True
        ).limit(1).execute()

        if result.data:
            last_number = result.data[0].get("case_number", "")
            # Extract sequence number from format AML-YYYY-NNNN
            try:
                seq = int(last_number.split("-")[-1])
                next_seq = seq + 1
            except (ValueError, IndexError):
                next_seq = 1
        else:
            next_seq = 1
    except Exception:
        next_seq = 1

    return f"AML-{year}-{next_seq:04d}"


def add_timeline_entry(case_id: str, event_type: str, user_id: str, description: Optional[str] = None):
    """Add an entry to the case timeline/audit trail."""
    try:
        supabase_admin.table("aml_timeline").insert({
            "case_id": case_id,
            "event_type": event_type,
            "description": description,
            "created_by": user_id,
        }).execute()
    except Exception:
        logger.warning("Failed to add timeline entry for case %s", case_id, exc_info=True)


# ─── Endpoints ─────────────────────────────────────────────


@router.post("/cases", response_model=AMLCaseOut)
def create_case(
    body: AMLCaseCreate,
    user: dict = Depends(get_current_user),
):
    """Create a new AML/CFT case.

    Auto-generates a case number, inserts into aml_cases table,
    and creates an initial timeline entry.
    """
    # Validate inputs
    if body.case_type not in VALID_CASE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid case_type: {body.case_type}")
    if body.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Invalid priority: {body.priority}")

    case_number = generate_case_number()

    row = {
        "case_number": case_number,
        "firm_id": user.get("firm_id"),
        "title": body.title,
        "description": body.description,
        "case_type": body.case_type,
        "status": "pending",
        "priority": body.priority,
        "assigned_to": body.assigned_to,
        "customer_id": body.customer_id,
        "transaction_ids": body.transaction_ids,
        "metadata": body.metadata,
        "created_by": user["id"],
    }

    try:
        result = supabase_admin.table("aml_cases").insert(row).execute()
        case = result.data[0]

        # Add timeline entry
        add_timeline_entry(case["id"], "created", user["id"], "Case created")

        logger.info("AML case %s created by user %s", case_number, user["id"])
        return case
    except Exception as e:
        logger.exception("Failed to create AML case")
        raise HTTPException(status_code=500, detail="Failed to create case")


@router.get("/cases", response_model=list[AMLCaseOut])
def list_cases(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    case_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    """List AML cases with optional filters.

    Query params: status, priority, assigned_to, case_type
    Returns list sorted by created_at (newest first).
    """
    query = supabase_admin.table("aml_cases").select("*").order(
        "created_at", desc=True
    ).limit(limit)

    # Firm-level filtering (users only see their firm's cases)
    if user.get("role") != "super_admin":
        query = query.eq("firm_id", user.get("firm_id"))

    # Apply optional filters
    if status:
        if status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        query = query.eq("status", status)

    if priority:
        if priority not in VALID_PRIORITIES:
            raise HTTPException(status_code=400, detail=f"Invalid priority: {priority}")
        query = query.eq("priority", priority)

    if assigned_to:
        query = query.eq("assigned_to", assigned_to)

    if case_type:
        if case_type not in VALID_CASE_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid case_type: {case_type}")
        query = query.eq("case_type", case_type)

    try:
        result = query.execute()
        return result.data
    except Exception as e:
        logger.exception("Failed to list AML cases")
        raise HTTPException(status_code=500, detail="Failed to retrieve cases")


@router.get("/cases/{case_id}", response_model=AMLCaseOut)
def get_case(
    case_id: str,
    user: dict = Depends(get_current_user),
):
    """Get detailed information about a specific AML case."""
    try:
        result = supabase_admin.table("aml_cases").select("*").eq("id", case_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Case not found")

        case = result.data[0]

        # Check firm access
        if user.get("role") != "super_admin" and case.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")

        return case
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get AML case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve case")


@router.put("/cases/{case_id}", response_model=AMLCaseOut)
def update_case(
    case_id: str,
    body: AMLCaseUpdate,
    user: dict = Depends(get_current_user),
):
    """Update an AML case.

    Tracks status changes in timeline and sets updated_at.
    """
    # Get existing case first
    try:
        result = supabase_admin.table("aml_cases").select("*").eq("id", case_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Case not found")

        existing_case = result.data[0]

        # Check firm access
        if user.get("role") != "super_admin" and existing_case.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get existing case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve case")

    # Prepare updates
    updates = body.model_dump(exclude_none=True)

    # Validate enums
    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {updates['status']}")
    if "priority" in updates and updates["priority"] not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Invalid priority: {updates['priority']}")

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        result = supabase_admin.table("aml_cases").update(updates).eq("id", case_id).execute()
        case = result.data[0]

        # Track status changes in timeline
        if "status" in updates and updates["status"] != existing_case.get("status"):
            add_timeline_entry(
                case_id,
                f"status_changed_to_{updates['status']}",
                user["id"],
                f"Status changed to {updates['status']}"
            )

        logger.info("AML case %s updated by user %s", case_id, user["id"])
        return case
    except Exception as e:
        logger.exception("Failed to update AML case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to update case")


@router.post("/cases/{case_id}/evidence", response_model=AMLEvidenceOut)
def add_evidence(
    case_id: str,
    body: AMLEvidenceCreate,
    user: dict = Depends(get_current_user),
):
    """Add evidence to an AML case.

    Inserts into aml_evidence and adds timeline entry.
    """
    # Verify case exists and user has access
    try:
        result = supabase_admin.table("aml_cases").select("firm_id").eq("id", case_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Case not found")

        case = result.data[0]
        if user.get("role") != "super_admin" and case.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to verify case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to verify case")

    row = {
        "case_id": case_id,
        "title": body.title,
        "description": body.description,
        "evidence_type": body.evidence_type,
        "file_url": body.file_url,
        "metadata": body.metadata,
        "created_by": user["id"],
    }

    try:
        result = supabase_admin.table("aml_evidence").insert(row).execute()
        evidence = result.data[0]

        # Add timeline entry
        add_timeline_entry(
            case_id,
            "evidence_added",
            user["id"],
            f"Evidence added: {body.title}"
        )

        logger.info("Evidence added to case %s by user %s", case_id, user["id"])
        return evidence
    except Exception as e:
        logger.exception("Failed to add evidence to case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to add evidence")


@router.post("/cases/{case_id}/escalate", response_model=AMLCaseOut)
def escalate_case(
    case_id: str,
    body: AMLCaseEscalate,
    user: dict = Depends(get_current_user),
):
    """Escalate an AML case.

    Updates status to 'escalated', sets escalated_to, escalation_reason, escalated_at,
    and adds timeline entry.
    """
    # Verify case exists and user has access
    try:
        result = supabase_admin.table("aml_cases").select("firm_id").eq("id", case_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Case not found")

        case = result.data[0]
        if user.get("role") != "super_admin" and case.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to verify case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to verify case")

    updates = {
        "status": "escalated",
        "escalated_to": body.escalated_to,
        "escalation_reason": body.escalation_reason,
        "escalated_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        result = supabase_admin.table("aml_cases").update(updates).eq("id", case_id).execute()
        case = result.data[0]

        # Add timeline entry
        add_timeline_entry(
            case_id,
            "escalated",
            user["id"],
            f"Case escalated: {body.escalation_reason}"
        )

        logger.info("AML case %s escalated by user %s", case_id, user["id"])
        return case
    except Exception as e:
        logger.exception("Failed to escalate case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to escalate case")


@router.post("/cases/{case_id}/close", response_model=AMLCaseOut)
def close_case(
    case_id: str,
    body: AMLCaseClose,
    user: dict = Depends(get_current_user),
):
    """Close an AML case.

    Sets status='closed', closed_at, closure_reason, and adds timeline entry.
    """
    # Verify case exists and user has access
    try:
        result = supabase_admin.table("aml_cases").select("firm_id").eq("id", case_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Case not found")

        case = result.data[0]
        if user.get("role") != "super_admin" and case.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to verify case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to verify case")

    updates = {
        "status": "closed",
        "closed_at": datetime.now(timezone.utc).isoformat(),
        "closure_reason": body.closure_reason,
        "metadata": case.get("metadata", {}) | {"closure_notes": body.closure_notes},
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        result = supabase_admin.table("aml_cases").update(updates).eq("id", case_id).execute()
        case = result.data[0]

        # Add timeline entry
        add_timeline_entry(
            case_id,
            "closed",
            user["id"],
            f"Case closed: {body.closure_reason}"
        )

        logger.info("AML case %s closed by user %s", case_id, user["id"])
        return case
    except Exception as e:
        logger.exception("Failed to close case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to close case")


@router.get("/cases/{case_id}/timeline", response_model=list[AMLTimelineEntry])
def get_case_timeline(
    case_id: str,
    user: dict = Depends(get_current_user),
):
    """Get the audit trail/timeline for an AML case.

    Returns all events in chronological order.
    """
    # Verify case exists and user has access
    try:
        result = supabase_admin.table("aml_cases").select("firm_id").eq("id", case_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Case not found")

        case = result.data[0]
        if user.get("role") != "super_admin" and case.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to verify case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to verify case")

    try:
        result = supabase_admin.table("aml_timeline").select("*").eq(
            "case_id", case_id
        ).order("created_at", desc=False).execute()
        return result.data
    except Exception as e:
        logger.exception("Failed to get timeline for case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve timeline")


@router.get("/stats")
def get_dashboard_stats(
    user: dict = Depends(get_current_user),
):
    """Get AML dashboard statistics.

    Returns counts by status, priority, case_type, and recent cases.
    """
    try:
        # Base query (filtered by firm for non-super-admin)
        firm_filter = {} if user.get("role") == "super_admin" else {"firm_id": user.get("firm_id")}

        # Count by status
        status_result = supabase_admin.table("aml_cases").select(
            "status", count="exact"
        ).eq(**firm_filter).execute() if firm_filter else supabase_admin.table("aml_cases").select(
            "status", count="exact"
        ).execute()

        status_counts = {}
        for status in VALID_STATUSES:
            status_counts[status] = 0
        for row in status_result.data:
            s = row.get("status", "unknown")
            if s in status_counts:
                status_counts[s] += 1

        # Count by priority
        priority_counts = {}
        for priority in VALID_PRIORITIES:
            priority_counts[priority] = 0

        if firm_filter:
            priority_result = supabase_admin.table("aml_cases").select(
                "priority", count="exact"
            ).eq(**firm_filter).execute()
        else:
            priority_result = supabase_admin.table("aml_cases").select(
                "priority", count="exact"
            ).execute()

        for row in priority_result.data:
            p = row.get("priority", "unknown")
            if p in priority_counts:
                priority_counts[p] += 1

        # Count by case type
        case_type_counts = {}
        for ct in VALID_CASE_TYPES:
            case_type_counts[ct] = 0

        if firm_filter:
            type_result = supabase_admin.table("aml_cases").select(
                "case_type", count="exact"
            ).eq(**firm_filter).execute()
        else:
            type_result = supabase_admin.table("aml_cases").select(
                "case_type", count="exact"
            ).execute()

        for row in type_result.data:
            ct = row.get("case_type", "unknown")
            if ct in case_type_counts:
                case_type_counts[ct] += 1

        # Get recent cases (last 10)
        if firm_filter:
            recent_result = supabase_admin.table("aml_cases").select(
                "*"
            ).eq(**firm_filter).order("created_at", desc=True).limit(10).execute()
        else:
            recent_result = supabase_admin.table("aml_cases").select(
                "*"
            ).order("created_at", desc=True).limit(10).execute()

        total_cases = len(status_result.data) if status_result.data else 0

        return {
            "total_cases": total_cases,
            "by_status": status_counts,
            "by_priority": priority_counts,
            "by_case_type": case_type_counts,
            "recent_cases": recent_result.data,
        }
    except Exception as e:
        logger.exception("Failed to get AML statistics")
        raise HTTPException(status_code=500, detail="Failed to retrieve statistics")
