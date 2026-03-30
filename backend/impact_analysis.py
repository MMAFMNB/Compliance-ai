"""Regulatory Change Impact Analysis: analyze CMA alerts for compliance impact."""

import json
import logging
import re
import time

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from config import ANTHROPIC_API_KEY, MODEL
from database import supabase_admin

router = APIRouter(prefix="/api", tags=["impact-analysis"])
logger = logging.getLogger(__name__)

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class ImpactAnalysisRequest(BaseModel):
    alert_id: str


class ActionItem(BaseModel):
    action: str
    priority: str  # high / medium / low
    deadline_suggestion: str | None = None


class ImpactAnalysisOut(BaseModel):
    id: str
    alert_id: str
    impact_level: str  # high / medium / low / none
    affected_areas: list[str]
    detailed_analysis: str
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
   - "deadline_suggestion": a suggested deadline or timeframe (e.g. "Within 30 days", "Before next quarterly report"), or null if not applicable

Return ONLY a JSON object with the following keys (no extra text):
{{
  "impact_level": "high|medium|low|none",
  "affected_areas": ["area1", "area2"],
  "detailed_analysis": "Arabic analysis...\n\nEnglish analysis...",
  "action_items": [
    {{
      "action": "...",
      "priority": "high|medium|low",
      "deadline_suggestion": "..." or null
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
    response = client.messages.create(
        model=MODEL,
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
        "detailed_analysis": analysis_data.get("detailed_analysis", ""),
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

    return ImpactAnalysisOut(
        id=saved["id"],
        alert_id=saved["alert_id"],
        impact_level=saved["impact_level"],
        affected_areas=saved["affected_areas"],
        detailed_analysis=saved["detailed_analysis"],
        action_items=[ActionItem(**item) for item in saved["action_items"]],
        latency_ms=saved["latency_ms"],
        created_at=saved["created_at"],
    )


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
    return ImpactAnalysisOut(
        id=row["id"],
        alert_id=row["alert_id"],
        impact_level=row["impact_level"],
        affected_areas=row["affected_areas"],
        detailed_analysis=row["detailed_analysis"],
        action_items=[ActionItem(**item) for item in row["action_items"]],
        latency_ms=row["latency_ms"],
        created_at=row["created_at"],
    )


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
    return ImpactAnalysisOut(
        id=row["id"],
        alert_id=row["alert_id"],
        impact_level=row["impact_level"],
        affected_areas=row["affected_areas"],
        detailed_analysis=row["detailed_analysis"],
        action_items=[ActionItem(**item) for item in row["action_items"]],
        latency_ms=row["latency_ms"],
        created_at=row["created_at"],
    )
