"""Compliance Calendar & Deadlines: track CMA regulatory filing deadlines."""

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from database import supabase_admin

router = APIRouter(prefix="/api/calendar", tags=["calendar"])
logger = logging.getLogger(__name__)


# ─── Models ─────────────────────────────────────────────────

class DeadlineOut(BaseModel):
    id: str
    title: str
    title_en: str | None
    description: str | None
    deadline_date: str
    category: str
    frequency: str | None
    is_recurring: bool
    cma_reference: str | None
    status: str | None  # from user_deadlines join
    notes: str | None
    completed_at: str | None


class DeadlinesResponse(BaseModel):
    deadlines: list[DeadlineOut]
    total: int
    overdue: int
    upcoming_7d: int


class DeadlineCreate(BaseModel):
    title: str
    title_en: str | None = None
    description: str | None = None
    deadline_date: str  # YYYY-MM-DD
    category: str = "other"
    frequency: str | None = "one_time"
    is_recurring: bool = False
    cma_reference: str | None = None


class DeadlineStatusUpdate(BaseModel):
    status: str  # pending, in_progress, completed, overdue
    notes: str | None = None


# ─── Seed Data ──────────────────────────────────────────────

CMA_DEADLINES = [
    {
        "title": "التقرير الربعي الأول (Q1)",
        "title_en": "Q1 Quarterly Compliance Report",
        "description": "تقديم تقرير الالتزام الربعي الأول لهيئة السوق المالية",
        "deadline_date": "2026-04-30",
        "category": "quarterly_report",
        "frequency": "quarterly",
        "is_recurring": True,
        "cma_reference": "لائحة الأشخاص المرخص لهم، المادة (52)",
    },
    {
        "title": "التقرير الربعي الثاني (Q2)",
        "title_en": "Q2 Quarterly Compliance Report",
        "description": "تقديم تقرير الالتزام الربعي الثاني لهيئة السوق المالية",
        "deadline_date": "2026-07-31",
        "category": "quarterly_report",
        "frequency": "quarterly",
        "is_recurring": True,
        "cma_reference": "لائحة الأشخاص المرخص لهم، المادة (52)",
    },
    {
        "title": "التقرير الربعي الثالث (Q3)",
        "title_en": "Q3 Quarterly Compliance Report",
        "description": "تقديم تقرير الالتزام الربعي الثالث لهيئة السوق المالية",
        "deadline_date": "2026-10-31",
        "category": "quarterly_report",
        "frequency": "quarterly",
        "is_recurring": True,
        "cma_reference": "لائحة الأشخاص المرخص لهم، المادة (52)",
    },
    {
        "title": "التقرير الربعي الرابع (Q4)",
        "title_en": "Q4 Quarterly Compliance Report",
        "description": "تقديم تقرير الالتزام الربعي الرابع لهيئة السوق المالية",
        "deadline_date": "2027-01-31",
        "category": "quarterly_report",
        "frequency": "quarterly",
        "is_recurring": True,
        "cma_reference": "لائحة الأشخاص المرخص لهم، المادة (52)",
    },
    {
        "title": "التقرير السنوي للالتزام",
        "title_en": "Annual Compliance Report",
        "description": "تقديم تقرير الالتزام السنوي الشامل لهيئة السوق المالية",
        "deadline_date": "2027-03-31",
        "category": "annual_report",
        "frequency": "annual",
        "is_recurring": True,
        "cma_reference": "لائحة الأشخاص المرخص لهم، المادة (51)",
    },
    {
        "title": "تقرير مكافحة غسل الأموال السنوي",
        "title_en": "Annual AML/CTF Report",
        "description": "تقديم تقرير مكافحة غسل الأموال وتمويل الإرهاب السنوي",
        "deadline_date": "2027-03-31",
        "category": "aml",
        "frequency": "annual",
        "is_recurring": True,
        "cma_reference": "لائحة مكافحة غسل الأموال، المادة (18)",
    },
    {
        "title": "تقرير تقييم المخاطر السنوي",
        "title_en": "Annual Risk Assessment Report",
        "description": "تقديم تقرير تقييم المخاطر السنوي لهيئة السوق المالية",
        "deadline_date": "2027-03-31",
        "category": "annual_report",
        "frequency": "annual",
        "is_recurring": True,
        "cma_reference": "لائحة الأشخاص المرخص لهم، المادة (23)",
    },
    {
        "title": "تقرير صافي قيمة الأصول الشهري (NAV)",
        "title_en": "Monthly Fund NAV Report",
        "description": "تقديم تقرير صافي قيمة أصول الصندوق الشهري",
        "deadline_date": "2026-04-15",
        "category": "fund_report",
        "frequency": "monthly",
        "is_recurring": True,
        "cma_reference": "لائحة صناديق الاستثمار، المادة (46)",
    },
    {
        "title": "تقرير صندوق الاستثمار نصف السنوي",
        "title_en": "Semi-Annual Fund Report",
        "description": "تقديم التقرير نصف السنوي لصناديق الاستثمار",
        "deadline_date": "2026-08-31",
        "category": "fund_report",
        "frequency": "semi_annual",
        "is_recurring": True,
        "cma_reference": "لائحة صناديق الاستثمار، المادة (45)",
    },
    {
        "title": "تقرير صندوق الاستثمار السنوي",
        "title_en": "Annual Fund Report",
        "description": "تقديم التقرير السنوي لصناديق الاستثمار المدققة",
        "deadline_date": "2027-02-28",
        "category": "fund_report",
        "frequency": "annual",
        "is_recurring": True,
        "cma_reference": "لائحة صناديق الاستثمار، المادة (44)",
    },
    {
        "title": "إشعار مجلس الإدارة — تغيير مسؤول الالتزام",
        "title_en": "Board Notification — Compliance Officer Change",
        "description": "إشعار الهيئة بتغيير مسؤول الالتزام خلال 5 أيام عمل",
        "deadline_date": "2026-04-30",
        "category": "board_notification",
        "frequency": "one_time",
        "is_recurring": False,
        "cma_reference": "لائحة الأشخاص المرخص لهم، المادة (19)",
    },
    {
        "title": "تقديم القوائم المالية المدققة السنوية",
        "title_en": "Annual Audited Financial Statements",
        "description": "تقديم القوائم المالية المدققة السنوية لهيئة السوق المالية",
        "deadline_date": "2027-03-31",
        "category": "annual_report",
        "frequency": "annual",
        "is_recurring": True,
        "cma_reference": "لائحة الأشخاص المرخص لهم، المادة (50)",
    },
    {
        "title": "تحديث سجل العناية المهنية الواجبة (CDD)",
        "title_en": "CDD Records Update Review",
        "description": "مراجعة وتحديث سجلات العناية المهنية الواجبة للعملاء",
        "deadline_date": "2026-06-30",
        "category": "aml",
        "frequency": "annual",
        "is_recurring": True,
        "cma_reference": "لائحة مكافحة غسل الأموال، المادة (10)",
    },
    {
        "title": "اختبار خطة استمرارية الأعمال",
        "title_en": "Business Continuity Plan Test",
        "description": "إجراء اختبار خطة استمرارية الأعمال السنوي",
        "deadline_date": "2026-12-31",
        "category": "annual_report",
        "frequency": "annual",
        "is_recurring": True,
        "cma_reference": "لائحة الأشخاص المرخص لهم، المادة (24)",
    },
]


def seed_deadlines() -> int:
    """Insert pre-populated CMA deadlines if the table is empty."""
    existing = supabase_admin.table("deadlines").select("id", count="exact").limit(1).execute()
    if (existing.count or 0) > 0:
        return 0

    supabase_admin.table("deadlines").insert(CMA_DEADLINES).execute()
    return len(CMA_DEADLINES)


# ─── Endpoints ──────────────────────────────────────────────

@router.get("/deadlines", response_model=DeadlinesResponse)
def list_deadlines(
    category: str | None = Query(None),
    status: str | None = Query(None),
    user: dict = Depends(get_current_user),
):
    """List all deadlines with the current user's status."""
    # Ensure seed data exists
    seed_deadlines()

    query = supabase_admin.table("deadlines").select("*").order("deadline_date", desc=False)
    if category:
        query = query.eq("category", category)
    result = query.execute()

    # Get user's deadline statuses
    user_statuses = (
        supabase_admin.table("user_deadlines")
        .select("*")
        .eq("user_id", user["id"])
        .execute()
    )
    status_map = {ud["deadline_id"]: ud for ud in user_statuses.data}

    today = date.today()
    seven_days = today + timedelta(days=7)
    deadlines = []
    overdue_count = 0
    upcoming_7d_count = 0

    for d in result.data:
        ud = status_map.get(d["id"], {})
        d_status = ud.get("status", "pending")
        d_date = date.fromisoformat(d["deadline_date"])

        # Auto-mark overdue
        if d_date < today and d_status not in ("completed",):
            d_status = "overdue"
            overdue_count += 1

        if today <= d_date <= seven_days and d_status != "completed":
            upcoming_7d_count += 1

        # Apply status filter
        if status and d_status != status:
            continue

        deadlines.append(
            DeadlineOut(
                id=d["id"],
                title=d["title"],
                title_en=d.get("title_en"),
                description=d.get("description"),
                deadline_date=d["deadline_date"],
                category=d["category"],
                frequency=d.get("frequency"),
                is_recurring=d.get("is_recurring", False),
                cma_reference=d.get("cma_reference"),
                status=d_status,
                notes=ud.get("notes"),
                completed_at=ud.get("completed_at"),
            )
        )

    return DeadlinesResponse(
        deadlines=deadlines,
        total=len(deadlines),
        overdue=overdue_count,
        upcoming_7d=upcoming_7d_count,
    )


@router.post("/deadlines", response_model=DeadlineOut)
def create_deadline(
    request: DeadlineCreate,
    user: dict = Depends(get_current_user),
):
    """Create a custom deadline."""
    row = {
        "title": request.title,
        "title_en": request.title_en,
        "description": request.description,
        "deadline_date": request.deadline_date,
        "category": request.category,
        "frequency": request.frequency,
        "is_recurring": request.is_recurring,
        "cma_reference": request.cma_reference,
        "created_by": user["id"],
    }
    result = supabase_admin.table("deadlines").insert(row).execute()
    d = result.data[0]
    return DeadlineOut(
        id=d["id"],
        title=d["title"],
        title_en=d.get("title_en"),
        description=d.get("description"),
        deadline_date=d["deadline_date"],
        category=d["category"],
        frequency=d.get("frequency"),
        is_recurring=d.get("is_recurring", False),
        cma_reference=d.get("cma_reference"),
        status="pending",
        notes=None,
        completed_at=None,
    )


@router.patch("/deadlines/{deadline_id}/status")
def update_deadline_status(
    deadline_id: str,
    request: DeadlineStatusUpdate,
    user: dict = Depends(get_current_user),
):
    """Update the status of a deadline for the current user."""
    row = {
        "user_id": user["id"],
        "deadline_id": deadline_id,
        "status": request.status,
        "notes": request.notes,
    }
    if request.status == "completed":
        from datetime import datetime
        row["completed_at"] = datetime.utcnow().isoformat()

    supabase_admin.table("user_deadlines").upsert(
        row, on_conflict="user_id,deadline_id"
    ).execute()
    return {"status": "updated"}


@router.get("/upcoming")
def get_upcoming(
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(get_current_user),
):
    """Get deadlines within the next N days."""
    seed_deadlines()

    today = date.today()
    cutoff = today + timedelta(days=days)

    result = (
        supabase_admin.table("deadlines")
        .select("*")
        .gte("deadline_date", today.isoformat())
        .lte("deadline_date", cutoff.isoformat())
        .order("deadline_date", desc=False)
        .execute()
    )

    user_statuses = (
        supabase_admin.table("user_deadlines")
        .select("*")
        .eq("user_id", user["id"])
        .execute()
    )
    status_map = {ud["deadline_id"]: ud for ud in user_statuses.data}

    upcoming = []
    for d in result.data:
        ud = status_map.get(d["id"], {})
        d_status = ud.get("status", "pending")
        if d_status == "completed":
            continue
        upcoming.append({
            "id": d["id"],
            "title": d["title"],
            "title_en": d.get("title_en"),
            "deadline_date": d["deadline_date"],
            "category": d["category"],
            "cma_reference": d.get("cma_reference"),
            "days_remaining": (date.fromisoformat(d["deadline_date"]) - today).days,
            "status": d_status,
        })

    return {"upcoming": upcoming, "total": len(upcoming)}


@router.post("/seed")
def trigger_seed(user: dict = Depends(get_current_user)):
    """Manually trigger CMA deadline seeding."""
    count = seed_deadlines()
    return {"seeded": count}
