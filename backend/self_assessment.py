import json
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from config import ANTHROPIC_API_KEY, MODEL
from database import supabase_admin

router = APIRouter(prefix="/api/assessment", tags=["self-assessment"])

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class CategoryScore(BaseModel):
    category: str
    category_en: str
    score: float
    max_score: float


class Recommendation(BaseModel):
    category: str
    finding: str
    recommendation: str
    priority: str  # high / medium / low


class SelfAssessmentOut(BaseModel):
    id: str
    overall_score: float
    category_scores: list[CategoryScore]
    recommendations: list[Recommendation]
    created_at: str
    latency_ms: int


class AssessmentHistoryOut(BaseModel):
    assessments: list[SelfAssessmentOut]
    total: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _gather_compliance_data(user_id: str) -> dict:
    """Collect compliance-related data from multiple tables for the user."""

    # Overdue deadlines
    try:
        overdue_resp = (
            supabase_admin.table("user_deadlines")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .lt("due_date", datetime.now(timezone.utc).isoformat())
            .eq("status", "pending")
            .execute()
        )
        overdue_count = overdue_resp.count if overdue_resp.count is not None else 0
    except Exception:
        overdue_count = None

    # Latest compliance assessment score & gap count
    try:
        assess_resp = (
            supabase_admin.table("compliance_assessments")
            .select("score, gaps")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if assess_resp.data:
            latest_score = assess_resp.data[0].get("score")
            gaps = assess_resp.data[0].get("gaps")
            gap_count = len(gaps) if isinstance(gaps, list) else 0
        else:
            latest_score = None
            gap_count = None
    except Exception:
        latest_score = None
        gap_count = None

    # Document reviews done
    try:
        reviews_resp = (
            supabase_admin.table("document_reviews")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        review_count = reviews_resp.count if reviews_resp.count is not None else 0
    except Exception:
        review_count = None

    # Unread alerts
    try:
        alerts_resp = (
            supabase_admin.table("alerts")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .eq("read", False)
            .execute()
        )
        unread_alerts = alerts_resp.count if alerts_resp.count is not None else 0
    except Exception:
        unread_alerts = None

    # Conversations (engagement)
    try:
        convos_resp = (
            supabase_admin.table("conversations")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .execute()
        )
        conversation_count = convos_resp.count if convos_resp.count is not None else 0
    except Exception:
        conversation_count = None

    return {
        "overdue_deadlines": overdue_count,
        "latest_compliance_score": latest_score,
        "compliance_gap_count": gap_count,
        "document_reviews_done": review_count,
        "unread_alerts": unread_alerts,
        "conversation_count": conversation_count,
    }


def _build_prompt(data: dict) -> str:
    """Build the Claude prompt for self-assessment analysis."""

    missing_areas: list[str] = []
    if data["overdue_deadlines"] is None:
        missing_areas.append("deadline tracking")
    if data["latest_compliance_score"] is None:
        missing_areas.append("compliance assessments")
    if data["document_reviews_done"] is None:
        missing_areas.append("document reviews")
    if data["unread_alerts"] is None:
        missing_areas.append("alerts")
    if data["conversation_count"] is None:
        missing_areas.append("engagement / conversations")

    missing_note = ""
    if missing_areas:
        missing_note = (
            "\nIMPORTANT: The following areas have no data available and should be "
            "noted as 'not enough data' when scoring. Do not penalise heavily for "
            f"missing data, but note it in recommendations: {', '.join(missing_areas)}.\n"
        )

    return f"""You are a compliance health assessment engine for a financial services firm.
Analyze the following compliance data for a user and produce a self-assessment report.

Compliance Data Snapshot:
- Overdue deadlines: {data['overdue_deadlines'] if data['overdue_deadlines'] is not None else 'No data available'}
- Latest compliance assessment score: {data['latest_compliance_score'] if data['latest_compliance_score'] is not None else 'No data available'}
- Compliance gaps identified: {data['compliance_gap_count'] if data['compliance_gap_count'] is not None else 'No data available'}
- Document reviews completed: {data['document_reviews_done'] if data['document_reviews_done'] is not None else 'No data available'}
- Unread alerts: {data['unread_alerts'] if data['unread_alerts'] is not None else 'No data available'}
- Engagement level (conversations): {data['conversation_count'] if data['conversation_count'] is not None else 'No data available'}
{missing_note}
Produce a JSON object with the following structure:
{{
  "overall_score": <number 0-100>,
  "category_scores": [
    {{"category": "<Arabic name>", "category_en": "governance", "score": <0-100>, "max_score": 100}},
    {{"category": "<Arabic name>", "category_en": "aml_kyc", "score": <0-100>, "max_score": 100}},
    {{"category": "<Arabic name>", "category_en": "reporting", "score": <0-100>, "max_score": 100}},
    {{"category": "<Arabic name>", "category_en": "client_management", "score": <0-100>, "max_score": 100}},
    {{"category": "<Arabic name>", "category_en": "risk_management", "score": <0-100>, "max_score": 100}},
    {{"category": "<Arabic name>", "category_en": "operations", "score": <0-100>, "max_score": 100}}
  ],
  "recommendations": [
    {{
      "category": "<category_en value>",
      "finding": "<description in Arabic>",
      "recommendation": "<actionable recommendation in Arabic>",
      "priority": "high|medium|low"
    }}
  ]
}}

Rules:
- Provide between 3 and 8 recommendations, prioritised by impact.
- The category field in recommendations must match one of the category_en values.
- Findings and recommendations text should be in Arabic. Category names (category field in category_scores) should be in Arabic; category_en should be in English as shown above.
- overall_score should be a weighted average reflecting all categories.
- Respond ONLY with the JSON object, no extra text."""


def _parse_claude_json(text: str) -> dict:
    """Extract and parse JSON from Claude's response, stripping markdown fences."""
    # Strip markdown code fences if present
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    # Try direct parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Regex extract JSON object
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError("Failed to parse JSON from Claude response")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/run", response_model=SelfAssessmentOut)
async def run_self_assessment(user: dict = Depends(get_current_user)):
    """Run a new periodic self-assessment for the current user."""
    user_id = user["id"]
    start = time.time()

    # 1. Gather compliance data
    assessment_data = _gather_compliance_data(user_id)

    # 2. Build prompt and call Claude
    prompt = _build_prompt(assessment_data)

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = response.content[0].text
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Claude API error: {str(e)}")

    # 3. Parse response
    try:
        result = _parse_claude_json(raw_text)
    except ValueError:
        raise HTTPException(status_code=502, detail="Failed to parse assessment from AI response")

    latency_ms = int((time.time() - start) * 1000)

    # 4. Persist to database
    record_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    row = {
        "id": record_id,
        "user_id": user_id,
        "overall_score": result.get("overall_score", 0),
        "category_scores": result.get("category_scores", []),
        "recommendations": result.get("recommendations", []),
        "assessment_data": assessment_data,
        "latency_ms": latency_ms,
        "created_at": now,
    }

    try:
        supabase_admin.table("self_assessments").insert(row).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    return SelfAssessmentOut(
        id=record_id,
        overall_score=result.get("overall_score", 0),
        category_scores=result.get("category_scores", []),
        recommendations=result.get("recommendations", []),
        created_at=now,
        latency_ms=latency_ms,
    )


@router.get("/latest", response_model=SelfAssessmentOut)
async def get_latest_assessment(user: dict = Depends(get_current_user)):
    """Return the most recent self-assessment for the current user."""
    user_id = user["id"]

    resp = (
        supabase_admin.table("self_assessments")
        .select("id, overall_score, category_scores, recommendations, created_at, latency_ms")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if not resp.data:
        raise HTTPException(status_code=404, detail="No self-assessment found for this user")

    row = resp.data[0]
    return SelfAssessmentOut(
        id=row["id"],
        overall_score=row["overall_score"],
        category_scores=row["category_scores"],
        recommendations=row["recommendations"],
        created_at=row["created_at"],
        latency_ms=row["latency_ms"],
    )


@router.get("/{assessment_id}", response_model=SelfAssessmentOut)
async def get_assessment_by_id(
    assessment_id: str,
    user: dict = Depends(get_current_user),
):
    """Return a specific self-assessment by ID."""
    resp = (
        supabase_admin.table("self_assessments")
        .select("id, overall_score, category_scores, recommendations, created_at, latency_ms")
        .eq("id", assessment_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Self-assessment not found")

    row = resp.data[0]
    return SelfAssessmentOut(
        id=row["id"],
        overall_score=row["overall_score"],
        category_scores=row["category_scores"],
        recommendations=row["recommendations"],
        created_at=row["created_at"],
        latency_ms=row["latency_ms"],
    )


@router.get("/history", response_model=AssessmentHistoryOut)
async def get_assessment_history(
    limit: int = Query(default=10, ge=1, le=100),
    user: dict = Depends(get_current_user),
):
    """Return all self-assessments for the current user, ordered by most recent first."""
    user_id = user["id"]

    resp = (
        supabase_admin.table("self_assessments")
        .select("id, overall_score, category_scores, recommendations, created_at, latency_ms", count="exact")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    assessments = [
        SelfAssessmentOut(
            id=row["id"],
            overall_score=row["overall_score"],
            category_scores=row["category_scores"],
            recommendations=row["recommendations"],
            created_at=row["created_at"],
            latency_ms=row["latency_ms"],
        )
        for row in (resp.data or [])
    ]

    total = resp.count if resp.count is not None else len(assessments)

    return AssessmentHistoryOut(assessments=assessments, total=total)
