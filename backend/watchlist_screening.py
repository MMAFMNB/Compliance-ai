"""Sanctions and PEP watchlist screening module."""

import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from api_utils import call_anthropic
from database import supabase_admin

router = APIRouter(prefix="/api/screening", tags=["screening"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class ScreeningRequest(BaseModel):
    name: str
    id_number: Optional[str] = None
    case_id: Optional[str] = None
    additional_info: Optional[str] = None


class ScreeningResult(BaseModel):
    id: str
    name: str
    id_number: Optional[str] = None
    case_id: Optional[str] = None
    match_found: bool
    match_score: float  # 0-100
    matched_entities: list[dict] = []
    watchlists: list[str] = []  # e.g., ["OFAC", "UN", "EU", "SAMA"]
    risk_level: str  # low / medium / high
    details: str  # detailed analysis
    review_status: Optional[str] = None  # pending / cleared / confirmed_match
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    created_at: str
    updated_at: str


class ScreeningResultUpdate(BaseModel):
    review_status: str  # cleared / confirmed_match
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Screening Logic
# ---------------------------------------------------------------------------

def screen_against_watchlists(name: str, id_number: Optional[str] = None) -> dict:
    """Use Claude to screen a name against known sanctions lists.

    Since we don't have live API access to sanctions databases, we use Claude
    to analyze the name for potential PEP/sanctions matches based on:
    - Fuzzy matching against commonly known sanctioned entities
    - Name pattern analysis for known sanctioned formats
    - Contextual risk assessment

    Returns a dict with match_found, match_score, matched_entities, and details.
    """

    # Build the screening prompt
    screening_prompt = f"""You are a compliance expert analyzing potential sanctions/PEP matches.

NAME TO SCREEN: {name}
ID NUMBER: {id_number or "Not provided"}

Your task:
1. Analyze if this name matches or closely resembles any known:
   - OFAC (US Office of Foreign Assets Control) sanctioned entities
   - UN Security Council sanctioned entities
   - EU sanctions lists entities
   - SAMA (Saudi Arabian Monetary Authority) local sanctions lists
   - Known PEPs (Politically Exposed Persons)

2. Check for:
   - Exact name matches
   - Transliteration variations (especially for Arabic names)
   - Name pattern matches (e.g., known sanctioned organizations' naming patterns)
   - Possible aliases or variations

3. Evaluate fuzzy matching - how closely does this name match known entities?

Respond in JSON format with:
{{
  "match_found": boolean,
  "match_score": number (0-100, where 100 is certain match),
  "matched_entities": [
    {{
      "entity_name": "string",
      "watchlist": "OFAC|UN|EU|SAMA|PEP",
      "confidence": number (0-100),
      "reason": "explanation of why this might be a match"
    }}
  ],
  "watchlists_checked": ["OFAC", "UN", "EU", "SAMA", "PEP"],
  "risk_level": "low|medium|high",
  "analysis": "detailed explanation of findings",
  "recommendation": "recommend further action if needed"
}}"""

    try:
        response = call_anthropic(
            messages=[{"role": "user", "content": screening_prompt}],
            system="You are a compliance screening expert. Provide thorough, accurate analysis.",
            max_tokens=2000,
        )

        # Extract the JSON response
        response_text = response.content[0].text

        # Try to parse JSON from the response
        try:
            # Find JSON in the response
            start_idx = response_text.find("{")
            end_idx = response_text.rfind("}") + 1
            if start_idx >= 0 and end_idx > start_idx:
                json_str = response_text[start_idx:end_idx]
                result = json.loads(json_str)
            else:
                raise ValueError("No JSON found in response")
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning("Failed to parse screening response: %s", e)
            result = {
                "match_found": False,
                "match_score": 0,
                "matched_entities": [],
                "watchlists_checked": ["OFAC", "UN", "EU", "SAMA"],
                "risk_level": "low",
                "analysis": "Unable to parse screening analysis",
                "recommendation": "Manual review recommended"
            }

        return result

    except Exception as e:
        logger.error("Screening API call failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Screening failed: {str(e)}")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/screen", response_model=ScreeningResult)
def screen_name(
    body: ScreeningRequest,
    user: dict = Depends(get_current_user),
):
    """Screen a name against sanctions/PEP watchlists.

    Performs fuzzy matching and analysis using Claude to identify potential
    sanctions or PEP (Politically Exposed Person) matches.
    """

    if not body.name or not body.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")

    start_time = time.time()

    # Perform screening
    screening_data = screen_against_watchlists(body.name, body.id_number)

    # Build database record
    record = {
        "user_id": user["id"],
        "firm_id": user.get("firm_id"),
        "name": body.name,
        "id_number": body.id_number,
        "case_id": body.case_id,
        "match_found": screening_data.get("match_found", False),
        "match_score": screening_data.get("match_score", 0),
        "matched_entities": screening_data.get("matched_entities", []),
        "watchlists": screening_data.get("watchlists_checked", []),
        "risk_level": screening_data.get("risk_level", "low"),
        "details": screening_data.get("analysis", ""),
        "recommendation": screening_data.get("recommendation", ""),
        "review_status": "pending",
    }

    # Save to database
    try:
        result = supabase_admin.table("screening_results").insert(record).execute()
        db_record = result.data[0]
    except Exception as e:
        logger.error("Failed to save screening result: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save screening result")

    latency_ms = int((time.time() - start_time) * 1000)
    logger.info(
        "Screened name '%s' - match: %s, score: %d, latency: %dms",
        body.name, screening_data.get("match_found"), screening_data.get("match_score"), latency_ms
    )

    return ScreeningResult(**db_record)


@router.get("/results", response_model=list[ScreeningResult])
def list_screening_results(
    firm_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    case_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    user: dict = Depends(get_current_user),
):
    """List screening results with optional filtering.

    Firm admins see their firm's results; users see only their own.
    """

    query = supabase_admin.table("screening_results").select("*")

    # Access control
    if user.get("role") == "super_admin":
        if firm_id:
            query = query.eq("firm_id", firm_id)
    elif user.get("role") == "firm_admin":
        query = query.eq("firm_id", user.get("firm_id"))
    else:
        query = query.eq("user_id", user["id"])

    # Optional filters
    if status:
        query = query.eq("review_status", status)
    if case_id:
        query = query.eq("case_id", case_id)

    query = query.order("created_at", desc=True).limit(limit)

    try:
        result = query.execute()
        return [ScreeningResult(**row) for row in result.data]
    except Exception as e:
        logger.error("Failed to list screening results: %s", e)
        raise HTTPException(status_code=500, detail="Failed to list results")


@router.get("/results/{result_id}", response_model=ScreeningResult)
def get_screening_result(
    result_id: str,
    user: dict = Depends(get_current_user),
):
    """Get detailed screening result."""

    try:
        result = (
            supabase_admin.table("screening_results")
            .select("*")
            .eq("id", result_id)
            .single()
            .execute()
        )
    except Exception as e:
        logger.error("Failed to fetch screening result %s: %s", result_id, e)
        raise HTTPException(status_code=404, detail="Screening result not found")

    record = result.data

    # Access control
    if user.get("role") not in ("super_admin",) and user.get("role") != "firm_admin":
        if record.get("user_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    elif user.get("role") == "firm_admin":
        if record.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")

    return ScreeningResult(**record)


@router.put("/results/{result_id}/review", response_model=ScreeningResult)
def review_screening_result(
    result_id: str,
    body: ScreeningResultUpdate,
    user: dict = Depends(get_current_user),
):
    """Mark a screening result as reviewed (cleared or confirmed_match)."""

    if body.review_status not in ("cleared", "confirmed_match"):
        raise HTTPException(
            status_code=400,
            detail="review_status must be 'cleared' or 'confirmed_match'"
        )

    # Verify the result exists and user has access
    try:
        result = (
            supabase_admin.table("screening_results")
            .select("*")
            .eq("id", result_id)
            .single()
            .execute()
        )
    except Exception as e:
        logger.error("Failed to fetch screening result %s: %s", result_id, e)
        raise HTTPException(status_code=404, detail="Screening result not found")

    record = result.data

    # Access control - only firm_admin and above can review
    if user.get("role") not in ("super_admin", "firm_admin"):
        raise HTTPException(status_code=403, detail="Only admins can review results")

    if user.get("role") == "firm_admin" and record.get("firm_id") != user.get("firm_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    # Update the record
    update_data = {
        "review_status": body.review_status,
        "reviewed_by": user["id"],
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
    }

    if body.notes:
        update_data["review_notes"] = body.notes

    try:
        update_result = (
            supabase_admin.table("screening_results")
            .update(update_data)
            .eq("id", result_id)
            .execute()
        )
        updated_record = update_result.data[0]
        logger.info(
            "Screening result %s reviewed as '%s' by user %s",
            result_id, body.review_status, user["id"]
        )
        return ScreeningResult(**updated_record)
    except Exception as e:
        logger.error("Failed to update screening result %s: %s", result_id, e)
        raise HTTPException(status_code=500, detail="Failed to update result")
