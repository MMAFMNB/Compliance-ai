"""Regulatory Change Impact Analysis: analyze CMA alerts for compliance impact."""

import json
import logging
import re
import time

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from api_utils import call_anthropic
from config import ANTHROPIC_API_KEY, MODEL
from database import supabase_admin

router = APIRouter(prefix="/api", tags=["impact-analysis"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ImpactAnalysisRequest(BaseModel):
    alert_id: str


class ActionItem(BaseModel):
    action: str
    priority: str  # high / medium / low
    deadline: str | None = None  # matches frontend field name


class ImpactAnalysisOut(BaseModel):
    id: str
    alert_id: str
    alert_title: str | None = None
    impact_level: str  # high / medium / low / none
    affected_areas: list[str]
    analysis: str  # matches frontend field name
    action_items: list[ActionItem]
    latency_ms: int
    created_at: str


# ---------------------------------------------------------------------------
# Claude prompt
# ---------------------------------------------------------------------------

IMPACT_ANALYSIS_PROMPT = """You are TAM Compliance AI, an expert in Saudi Capital Market Authority (CMA) regulations.

A new regulatory publication has been detected:

Title: {title}
Document Type: {doc_type}
Source URL: {source_url}

Perform a detailed Regulatory Change Impact Analysis for a CMA-licensed asset management firm. Provide:

1. **Impact Level**: Assess the overall impact as one of: "high", "medium", "low", or "none".
2. **Affected Compliance Areas**: List all affected areas from the following (include only those that apply): AML/KYC, Fund Management, Reporting, Governance, Client Management, Risk Management, Market Conduct, Licensing, Disclosure, Technology & Cybersecurity.
3. **Detailed Analysis**: Provide a thorough bilingual analysis. Write the Arabic analysis first, then the English analysis. Cover what changed, why it matters, and how it affects current compliance frameworks.
4. **Action Items**: Provide specific action items the compliance team must take. Each action item must include:
   - "action": description of what needs to be done
   - "priority": "high", "medium", or "low"
   - "deadline": a suggested deadline or timeframe (e.g. "Within 30 days", "Before next quarterly report"), or null if not applicable

Return ONLY a JSON object with the following keys (no extra text):
{{
  "impact_level": "high|medium|low|none",
  "affected_areas": ["area1", "area2"],
  "analysis": "Arabic analysis...\n\nEnglish analysis...",
  "action_items": [
    {{
      "action": "...",
      "priority": "high|medium|low",
      "deadline": "..." or null
    }}
  ]
}}"""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/impact-analysis", response_model=ImpactAnalysisOut)
def create_impact_analysis(
    body: ImpactAnalysisRequest,
    user: dict = Depends(get_current_user),
):
    """Run a Regulatory Change Impact Analysis on a specific alert."""

    # Fetch the alert
    alert_result = (
        supabase_admin.table("alerts")
        .select("*")
        .eq("id", body.alert_id)
        .execute()
    )
    if not alert_result.data:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert = alert_result.data[0]

    prompt = IMPACT_ANALYSIS_PROMPT.format(
        title=alert.get("title", ""),
        doc_type=alert.get("doc_type", ""),
        source_url=alert.get("source_url", ""),
    )

    # Call Claude
    start = time.perf_counter()
    response = call_anthropic(
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    latency_ms = int((time.perf_counter() - start) * 1000)

    text_blocks = [b for b in response.content if b.type == "text"]
    if not text_blocks:
        raise HTTPException(status_code=502, detail="LLM returned no text content")

    raw_text = text_blocks[0].text.strip()

    # Strip markdown code fences if present
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1]
        raw_text = raw_text.rsplit("```", 1)[0].strip()

    # Try to extract JSON object even if LLM added surrounding text
    json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
    if json_match:
        raw_text = json_match.group(0)

    try:
        analysis_data = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error("Failed to parse impact analysis response as JSON: %s", raw_text[:500])
        raise HTTPException(
            status_code=502,
            detail="LLM response was not valid JSON. Try again.",
        )

    # Persist to database
    row = {
        "alert_id": body.alert_id,
        "user_id": user["id"],
        "impact_level": analysis_data.get("impact_level", "none"),
        "affected_areas": analysis_data.get("affected_areas", []),
        "detailed_analysis": analysis_data.get("analysis", analysis_data.get("detailed_analysis", "")),
        "action_items": analysis_data.get("action_items", []),
        "latency_ms": latency_ms,
    }

    try:
        insert_result = (
            supabase_admin.table("impact_analyses")
            .insert(row)
            .execute()
        )
    except Exception as db_err:
        logger.error("Failed to save impact analysis to DB: %s", db_err)
        raise HTTPException(status_code=500, detail="Failed to save analysis")

    saved = insert_result.data[0]

    return _row_to_out(saved, alert_title=alert.get("title"))


def _row_to_out(row: dict, alert_title: str | None = None) -> ImpactAnalysisOut:
    """Convert a DB row to an ImpactAnalysisOut, mapping field names."""
    action_items = row.get("action_items") or []
    parsed_items = []
    for item in action_items:
        parsed_items.append(ActionItem(
            action=item.get("action", ""),
            priority=item.get("priority", "medium"),
            deadline=item.get("deadline") or item.get("deadline_suggestion"),
        ))
    return ImpactAnalysisOut(
        id=row["id"],
        alert_id=row["alert_id"],
        alert_title=alert_title,
        impact_level=row["impact_level"],
        affected_areas=row["affected_areas"],
        analysis=row.get("detailed_analysis", ""),
        action_items=parsed_items,
        latency_ms=row["latency_ms"],
        created_at=row["created_at"],
    )


def _enrich_alert_titles(rows: list[dict]) -> list[ImpactAnalysisOut]:
    """Fetch alert titles for a list of analysis rows."""
    alert_ids = list({r["alert_id"] for r in rows})
    title_map: dict[str, str] = {}
    if alert_ids:
        try:
            alerts_result = (
                supabase_admin.table("alerts")
                .select("id, title")
                .in_("id", alert_ids)
                .execute()
            )
            title_map = {a["id"]: a["title"] for a in alerts_result.data}
        except Exception:
            pass
    return [_row_to_out(r, alert_title=title_map.get(r["alert_id"])) for r in rows]


@router.get("/impact-analysis", response_model=list[ImpactAnalysisOut])
def list_impact_analyses(
    user: dict = Depends(get_current_user),
):
    """List all impact analyses for the current user."""
    result = (
        supabase_admin.table("impact_analyses")
        .select("*")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return _enrich_alert_titles(result.data)


@router.get("/impact-analysis/by-alert/{alert_id}", response_model=ImpactAnalysisOut)
def get_impact_analysis_by_alert(
    alert_id: str,
    user: dict = Depends(get_current_user),
):
    """Fetch the impact analysis for a specific alert."""
    result = (
        supabase_admin.table("impact_analyses")
        .select("*")
        .eq("alert_id", alert_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="No impact analysis found for this alert")

    row = result.data[0]
    # Fetch alert title
    try:
        alert_result = supabase_admin.table("alerts").select("title").eq("id", alert_id).limit(1).execute()
        alert_title = alert_result.data[0]["title"] if alert_result.data else None
    except Exception:
        alert_title = None

    return _row_to_out(row, alert_title=alert_title)


@router.get("/impact-analysis/{analysis_id}", response_model=ImpactAnalysisOut)
def get_impact_analysis(
    analysis_id: str,
    user: dict = Depends(get_current_user),
):
    """Fetch a stored impact analysis by its ID."""
    result = (
        supabase_admin.table("impact_analyses")
        .select("*")
        .eq("id", analysis_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Impact analysis not found")

    row = result.data[0]
    # Fetch alert title
    try:
        alert_result = supabase_admin.table("alerts").select("title").eq("id", row["alert_id"]).limit(1).execute()
        alert_title = alert_result.data[0]["title"] if alert_result.data else None
    except Exception:
        alert_title = None

    return _row_to_out(row, alert_title=alert_title)
