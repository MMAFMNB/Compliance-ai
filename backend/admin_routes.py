"""Admin endpoints for firm management, user management, and audit logs."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from auth import get_current_user
from database import supabase, supabase_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)

# Valid role values
VALID_ROLES = {"super_admin", "firm_admin", "compliance_officer", "analyst", "auditor", "read_only"}


# ─── Role guards ───────────────────────────────────────────


def require_role(allowed_roles: list[str]):
    """Factory that returns a FastAPI dependency checking the user's role."""
    def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Requires one of: {', '.join(allowed_roles)}",
            )
        return user
    return checker


require_super_admin = require_role(["super_admin"])
require_firm_admin = require_role(["super_admin", "firm_admin"])


# ─── Audit helper ──────────────────────────────────────────


def log_audit(
    user_id: str,
    firm_id: str | None,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    details: dict | None = None,
    request: Request | None = None,
):
    row = {
        "user_id": user_id,
        "firm_id": firm_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "details": details or {},
    }
    if request:
        row["ip_address"] = request.client.host if request.client else None
        row["user_agent"] = request.headers.get("user-agent")
    try:
        supabase_admin.table("audit_log").insert(row).execute()
    except Exception:
        logger.warning("Failed to write audit log entry", exc_info=True)


# ─── Models ────────────────────────────────────────────────


class FirmCreate(BaseModel):
    name: str
    name_ar: Optional[str] = None
    cma_license: Optional[str] = None


class FirmUpdate(BaseModel):
    name: Optional[str] = None
    name_ar: Optional[str] = None
    cma_license: Optional[str] = None
    is_active: Optional[bool] = None


class FirmOut(BaseModel):
    id: str
    name: str
    name_ar: Optional[str] = None
    cma_license: Optional[str] = None
    is_active: bool
    created_at: str
    updated_at: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    organization: str
    role: str
    firm_id: Optional[str] = None
    language_pref: str
    created_at: Optional[str] = None


class UserRoleUpdate(BaseModel):
    role: str  # one of UserRole values


class UserFirmUpdate(BaseModel):
    firm_id: str


class UserInvite(BaseModel):
    email: str
    name: str
    role: str = "compliance_officer"


class AuditLogEntry(BaseModel):
    id: str
    user_id: Optional[str] = None
    firm_id: Optional[str] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    details: dict = {}
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: str


# ─── Firm Endpoints ────────────────────────────────────────


@router.get("/firms", response_model=list[FirmOut])
def list_firms(user: dict = Depends(require_super_admin)):
    """List all firms (super_admin only)."""
    result = supabase_admin.table("firms").select("*").order("name").execute()
    return result.data


@router.post("/firms", response_model=FirmOut)
def create_firm(
    body: FirmCreate,
    request: Request,
    user: dict = Depends(require_super_admin),
):
    """Create a new firm (super_admin only)."""
    row = {"name": body.name, "name_ar": body.name_ar, "cma_license": body.cma_license}
    result = supabase_admin.table("firms").insert(row).execute()
    firm = result.data[0]
    log_audit(user["id"], None, "firm.create", "firm", firm["id"], {"name": body.name}, request)
    return firm


@router.get("/firms/{firm_id}", response_model=FirmOut)
def get_firm(firm_id: str, user: dict = Depends(require_firm_admin)):
    """Get firm details. Firm admins can only see their own firm."""
    if user.get("role") != "super_admin" and user.get("firm_id") != firm_id:
        raise HTTPException(status_code=403, detail="Access denied")
    result = supabase_admin.table("firms").select("*").eq("id", firm_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Firm not found")
    return result.data[0]


@router.patch("/firms/{firm_id}", response_model=FirmOut)
def update_firm(
    firm_id: str,
    body: FirmUpdate,
    request: Request,
    user: dict = Depends(require_super_admin),
):
    """Update a firm (super_admin only)."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = supabase_admin.table("firms").update(updates).eq("id", firm_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Firm not found")
    log_audit(user["id"], firm_id, "firm.update", "firm", firm_id, updates, request)
    return result.data[0]


# ─── User Management Endpoints ─────────────────────────────


@router.get("/users", response_model=list[UserOut])
def list_users(
    firm_id: Optional[str] = Query(None),
    user: dict = Depends(require_firm_admin),
):
    """List users. Super admin sees all; firm admin sees own firm only."""
    query = supabase_admin.table("users").select("*").order("name")

    if user.get("role") == "super_admin":
        if firm_id:
            query = query.eq("firm_id", firm_id)
    else:
        # Firm admin: restrict to own firm
        query = query.eq("firm_id", user.get("firm_id"))

    result = query.execute()
    return result.data


@router.patch("/users/{user_id}/role")
def update_user_role(
    user_id: str,
    body: UserRoleUpdate,
    request: Request,
    user: dict = Depends(require_firm_admin),
):
    """Update a user's role. Firm admin can manage users in own firm only."""
    # Validate role value
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role: {body.role}")

    # Only super_admin can assign super_admin/firm_admin roles
    if body.role in ("super_admin", "firm_admin") and user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admin can assign admin roles")

    # Firm admin can only manage users in their own firm
    if user.get("role") != "super_admin":
        target = supabase_admin.table("users").select("firm_id").eq("id", user_id).execute()
        if not target.data or target.data[0].get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Cannot manage users outside your firm")

    supabase_admin.table("users").update({"role": body.role}).eq("id", user_id).execute()
    log_audit(user["id"], user.get("firm_id"), "user.role_update", "user", user_id, {"role": body.role}, request)
    return {"status": "updated"}


@router.patch("/users/{user_id}/firm")
def update_user_firm(
    user_id: str,
    body: UserFirmUpdate,
    request: Request,
    user: dict = Depends(require_super_admin),
):
    """Assign a user to a firm (super_admin only)."""
    # Verify firm exists
    firm = supabase_admin.table("firms").select("id").eq("id", body.firm_id).execute()
    if not firm.data:
        raise HTTPException(status_code=404, detail="Firm not found")

    supabase_admin.table("users").update({"firm_id": body.firm_id}).eq("id", user_id).execute()
    log_audit(user["id"], body.firm_id, "user.firm_assign", "user", user_id, {"firm_id": body.firm_id}, request)
    return {"status": "updated"}


@router.post("/users/invite")
def invite_user(
    body: UserInvite,
    request: Request,
    user: dict = Depends(require_firm_admin),
):
    """Invite a new user to the admin user's firm.

    Creates a Supabase Auth user and a profile row pre-assigned to the firm.
    The invited user will receive a confirmation email from Supabase.
    """
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role: {body.role}")

    # Only super_admin can assign admin-level roles
    if body.role in ("super_admin", "firm_admin") and user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admin can assign admin roles")

    firm_id = user.get("firm_id")
    if not firm_id and user.get("role") != "super_admin":
        raise HTTPException(status_code=400, detail="You must belong to a firm to invite users")

    # Create auth user via Supabase Admin API (generates invite email)
    try:
        auth_response = supabase_admin.auth.admin.invite_user_by_email(body.email)
    except Exception as e:
        logger.exception("Failed to invite user via Supabase Auth")
        raise HTTPException(status_code=400, detail=f"Invitation failed: {str(e)}")

    auth_user = auth_response.user
    if not auth_user:
        raise HTTPException(status_code=400, detail="Invitation failed")

    # Create profile row
    try:
        supabase_admin.table("users").insert({
            "id": auth_user.id,
            "email": body.email,
            "full_name": body.name,
            "role": body.role,
            "firm_id": firm_id,
            "language_preference": "ar",
        }).execute()
    except Exception:
        logger.exception("Failed to create profile for invited user")

    log_audit(
        user["id"], firm_id, "user.invite", "user", str(auth_user.id),
        {"email": body.email, "role": body.role}, request,
    )
    return {"status": "invited", "user_id": str(auth_user.id), "email": body.email}


@router.put("/firms/{firm_id}/deactivate")
def deactivate_firm(
    firm_id: str,
    request: Request,
    user: dict = Depends(require_super_admin),
):
    """Deactivate a firm (super_admin only). Sets is_active=false."""
    result = supabase_admin.table("firms").update({"is_active": False}).eq("id", firm_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Firm not found")
    log_audit(user["id"], firm_id, "firm.deactivate", "firm", firm_id, {}, request)
    return {"status": "deactivated", "firm_id": firm_id}


@router.put("/firms/{firm_id}/activate")
def activate_firm(
    firm_id: str,
    request: Request,
    user: dict = Depends(require_super_admin),
):
    """Re-activate a firm (super_admin only)."""
    result = supabase_admin.table("firms").update({"is_active": True}).eq("id", firm_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Firm not found")
    log_audit(user["id"], firm_id, "firm.activate", "firm", firm_id, {}, request)
    return {"status": "activated", "firm_id": firm_id}


# ─── Audit Log Endpoints ──────────────────────────────────


@router.get("/audit-log", response_model=list[AuditLogEntry])
def list_audit_log(
    limit: int = Query(50, ge=1, le=500),
    action: Optional[str] = Query(None),
    user: dict = Depends(require_firm_admin),
):
    """List audit log entries. Super admin sees all; firm admin sees own firm."""
    query = supabase_admin.table("audit_log").select("*").order("created_at", desc=True).limit(limit)

    if user.get("role") != "super_admin":
        query = query.eq("firm_id", user.get("firm_id"))
    if action:
        query = query.eq("action", action)

    result = query.execute()
    return result.data


# ─── Usage Events Endpoints ───────────────────────────────


@router.get("/usage")
def list_usage_events(
    limit: int = Query(100, ge=1, le=1000),
    event_type: Optional[str] = Query(None),
    user: dict = Depends(require_firm_admin),
):
    """List usage events. Super admin sees all; firm admin sees own firm."""
    query = supabase_admin.table("usage_events").select("*").order("created_at", desc=True).limit(limit)

    if user.get("role") != "super_admin":
        query = query.eq("firm_id", user.get("firm_id"))
    if event_type:
        query = query.eq("event_type", event_type)

    result = query.execute()
    return {"events": result.data, "total": len(result.data)}


@router.get("/usage/summary")
def usage_summary(
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(require_firm_admin),
):
    """Aggregated usage statistics for the dashboard.

    Returns counts by event_type for the last N days.
    Super admin sees all; firm admin sees own firm.
    """
    from datetime import datetime, timedelta, timezone

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    query = (
        supabase_admin.table("usage_events")
        .select("event_type", count="exact")
        .gte("created_at", cutoff)
    )
    if user.get("role") != "super_admin":
        query = query.eq("firm_id", user.get("firm_id"))

    result = query.execute()
    total = result.count if result.count is not None else len(result.data)

    # Count by event_type
    type_counts: dict[str, int] = {}
    for row in result.data:
        et = row.get("event_type", "unknown")
        type_counts[et] = type_counts.get(et, 0) + 1

    # Also get active user count
    users_query = supabase_admin.table("users").select("id", count="exact")
    if user.get("role") != "super_admin":
        users_query = users_query.eq("firm_id", user.get("firm_id"))
    users_result = users_query.execute()
    user_count = users_result.count if users_result.count is not None else len(users_result.data)

    return {
        "period_days": days,
        "total_events": total,
        "by_type": type_counts,
        "active_users": user_count,
    }
