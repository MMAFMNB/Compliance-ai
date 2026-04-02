"""Client suitability assessment module.

Implements CMA's Client Classification and Suitability requirements including:
- Authorized Persons Regulations
- Investment Funds Regulations
- Saudi investor protection rules
"""

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

router = APIRouter(prefix="/api/suitability", tags=["suitability"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------

class ClientInfo(BaseModel):
    name: str
    client_type: str  # individual / corporate / institutional / government
    id_number: Optional[str] = None
    national_id: Optional[str] = None
    country: Optional[str] = None


class RiskProfile(BaseModel):
    risk_tolerance: str  # low / moderate / high
    investment_experience: str  # beginner / intermediate / advanced / professional
    investment_horizon: str  # short_term / medium_term / long_term
    annual_income: Optional[float] = None
    net_worth: Optional[float] = None
    investment_objectives: list[str]  # e.g., ["capital_growth", "income", "preservation"]
    source_of_funds: Optional[str] = None
    liquidity_needs: Optional[str] = None
    other_assets: Optional[str] = None


class SuitabilityAssessmentCreate(BaseModel):
    client: ClientInfo
    risk_profile: RiskProfile
    case_id: Optional[str] = None
    notes: Optional[str] = None


class ProductRecommendation(BaseModel):
    product_type: str
    risk_level: str
    suitability_score: float  # 0-100
    rationale: str
    caveats: Optional[str] = None


class SuitabilityAssessment(BaseModel):
    id: str
    user_id: Optional[str] = None
    firm_id: Optional[str] = None
    client_name: str
    client_type: str
    overall_risk_score: float  # 0-100
    risk_category: str  # low / medium / high
    suitable_products: list[ProductRecommendation]
    unsuitable_products: list[ProductRecommendation]
    ai_assessment_en: str
    ai_assessment_ar: str
    conditions_and_recommendations: str
    regulatory_notes: str
    approval_status: Optional[str] = None  # pending / approved / rejected
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    created_at: str
    updated_at: str


class SuitabilityAssessmentUpdate(BaseModel):
    approval_status: str  # approved / rejected
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Suitability Assessment Logic
# ---------------------------------------------------------------------------

def generate_suitability_assessment(
    client: ClientInfo,
    risk_profile: RiskProfile,
) -> dict:
    """Generate a suitability assessment using Claude.

    Analyzes the client's risk profile and generates suitable and unsuitable
    product recommendations in compliance with CMA regulations.
    """

    # Build comprehensive assessment prompt
    assessment_prompt = f"""You are a compliance expert and investment advisor evaluating client suitability for investment products per CMA regulations.

CLIENT INFORMATION:
- Name: {client.name}
- Type: {client.client_type}
- ID: {client.id_number or "Not provided"}
- Country: {client.country or "Not specified"}

RISK PROFILE:
- Risk Tolerance: {risk_profile.risk_tolerance}
- Investment Experience: {risk_profile.investment_experience}
- Investment Horizon: {risk_profile.investment_horizon}
- Annual Income: SAR {risk_profile.annual_income:,.0f} if {risk_profile.annual_income} else "Not disclosed"
- Net Worth: SAR {risk_profile.net_worth:,.0f} if {risk_profile.net_worth} else "Not disclosed"
- Investment Objectives: {", ".join(risk_profile.investment_objectives)}
- Source of Funds: {risk_profile.source_of_funds or "Not specified"}
- Liquidity Needs: {risk_profile.liquidity_needs or "Not specified"}
- Other Assets: {risk_profile.other_assets or "Not specified"}

REGULATORY FRAMEWORK:
- CMA Authorized Persons Regulations (APR)
- CMA Investment Funds Regulations (IFR)
- CMA Client Classification and Suitability Rules
- Saudi investor protection requirements

YOUR TASK:
1. Determine overall risk score (0-100) and category (low/medium/high)
2. Identify suitable investment products (equities, fixed income, funds, structured products, etc.)
3. Identify unsuitable products
4. Provide detailed assessment in BOTH Arabic and English
5. Include conditions/recommendations
6. Reference applicable CMA regulations

RESPOND IN JSON FORMAT:
{{
  "overall_risk_score": number (0-100),
  "risk_category": "low|medium|high",
  "suitable_products": [
    {{
      "product_type": "string",
      "risk_level": "low|medium|high",
      "suitability_score": number (0-100),
      "rationale": "explanation based on client profile",
      "caveats": "any conditions or warnings"
    }}
  ],
  "unsuitable_products": [
    {{
      "product_type": "string",
      "risk_level": "low|medium|high",
      "suitability_score": number (0-100),
      "rationale": "explanation why unsuitable",
      "caveats": "alternative suggestions"
    }}
  ],
  "assessment_en": "Comprehensive suitability assessment in English (2-3 paragraphs)",
  "assessment_ar": "تقييم شامل للملاءمة بالعربية (2-3 فقرات)",
  "conditions_and_recommendations": "Specific conditions, warnings, or recommendations (bilingual summary)",
  "regulatory_notes": "Reference to applicable CMA regulations and rules",
  "key_considerations": [
    "bullet point of important factors"
  ]
}}"""

    try:
        response = call_anthropic(
            messages=[{"role": "user", "content": assessment_prompt}],
            system="You are an expert compliance advisor specializing in CMA regulations and client suitability assessment. Provide thorough, accurate, bilingual analysis.",
            max_tokens=3000,
        )

        response_text = response.content[0].text

        # Parse JSON from response
        try:
            start_idx = response_text.find("{")
            end_idx = response_text.rfind("}") + 1
            if start_idx >= 0 and end_idx > start_idx:
                json_str = response_text[start_idx:end_idx]
                result = json.loads(json_str)
            else:
                raise ValueError("No JSON found in response")
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning("Failed to parse assessment response: %s", e)
            result = {
                "overall_risk_score": 50,
                "risk_category": "medium",
                "suitable_products": [],
                "unsuitable_products": [],
                "assessment_en": "Unable to generate assessment - manual review required",
                "assessment_ar": "تعذر إنشاء التقييم - يتطلب مراجعة يدوية",
                "conditions_and_recommendations": "Please contact compliance for manual review",
                "regulatory_notes": "CMA regulations require suitability assessment",
                "key_considerations": ["Manual review recommended"]
            }

        return result

    except Exception as e:
        logger.error("Assessment API call failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Assessment failed: {str(e)}")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/assess", response_model=SuitabilityAssessment)
def create_suitability_assessment(
    body: SuitabilityAssessmentCreate,
    user: dict = Depends(get_current_user),
):
    """Create a client suitability assessment.

    Generates comprehensive assessment including risk score, suitable/unsuitable
    products, and bilingual compliance notes per CMA regulations.
    """

    if not body.client.name or not body.client.name.strip():
        raise HTTPException(status_code=400, detail="Client name is required")

    start_time = time.time()

    # Generate assessment
    assessment_data = generate_suitability_assessment(body.client, body.risk_profile)

    # Build database record
    record = {
        "user_id": user["id"],
        "firm_id": user.get("firm_id"),
        "client_name": body.client.name,
        "client_type": body.client.client_type,
        "client_id_number": body.client.id_number,
        "national_id": body.client.national_id,
        "country": body.client.country,
        "case_id": body.case_id,
        "risk_tolerance": body.risk_profile.risk_tolerance,
        "investment_experience": body.risk_profile.investment_experience,
        "investment_horizon": body.risk_profile.investment_horizon,
        "annual_income": body.risk_profile.annual_income,
        "net_worth": body.risk_profile.net_worth,
        "investment_objectives": body.risk_profile.investment_objectives,
        "source_of_funds": body.risk_profile.source_of_funds,
        "overall_risk_score": assessment_data.get("overall_risk_score", 50),
        "risk_category": assessment_data.get("risk_category", "medium"),
        "suitable_products": assessment_data.get("suitable_products", []),
        "unsuitable_products": assessment_data.get("unsuitable_products", []),
        "ai_assessment_en": assessment_data.get("assessment_en", ""),
        "ai_assessment_ar": assessment_data.get("assessment_ar", ""),
        "conditions_and_recommendations": assessment_data.get("conditions_and_recommendations", ""),
        "regulatory_notes": assessment_data.get("regulatory_notes", ""),
        "key_considerations": assessment_data.get("key_considerations", []),
        "approval_status": "pending",
        "notes": body.notes,
    }

    # Save to database
    try:
        result = supabase_admin.table("suitability_assessments").insert(record).execute()
        db_record = result.data[0]
    except Exception as e:
        logger.error("Failed to save suitability assessment: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save assessment")

    latency_ms = int((time.time() - start_time) * 1000)
    logger.info(
        "Created suitability assessment for '%s' (type: %s, risk: %s) - latency: %dms",
        body.client.name, body.client.client_type,
        assessment_data.get("risk_category"), latency_ms
    )

    return SuitabilityAssessment(**db_record)


@router.get("/assessments", response_model=list[SuitabilityAssessment])
def list_suitability_assessments(
    firm_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    case_id: Optional[str] = Query(None),
    client_type: Optional[str] = Query(None),
    risk_category: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    user: dict = Depends(get_current_user),
):
    """List suitability assessments with optional filtering.

    Firm admins see their firm's assessments; users see only their own.
    Supports filtering by status, case, client type, and risk category.
    """

    query = supabase_admin.table("suitability_assessments").select("*")

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
        query = query.eq("approval_status", status)
    if case_id:
        query = query.eq("case_id", case_id)
    if client_type:
        query = query.eq("client_type", client_type)
    if risk_category:
        query = query.eq("risk_category", risk_category)

    query = query.order("created_at", desc=True).limit(limit)

    try:
        result = query.execute()
        return [SuitabilityAssessment(**row) for row in result.data]
    except Exception as e:
        logger.error("Failed to list suitability assessments: %s", e)
        raise HTTPException(status_code=500, detail="Failed to list assessments")


@router.get("/assessments/{assessment_id}", response_model=SuitabilityAssessment)
def get_suitability_assessment(
    assessment_id: str,
    user: dict = Depends(get_current_user),
):
    """Get detailed suitability assessment."""

    try:
        result = (
            supabase_admin.table("suitability_assessments")
            .select("*")
            .eq("id", assessment_id)
            .single()
            .execute()
        )
    except Exception as e:
        logger.error("Failed to fetch suitability assessment %s: %s", assessment_id, e)
        raise HTTPException(status_code=404, detail="Assessment not found")

    record = result.data

    # Access control
    if user.get("role") not in ("super_admin",) and user.get("role") != "firm_admin":
        if record.get("user_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Access denied")
    elif user.get("role") == "firm_admin":
        if record.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")

    return SuitabilityAssessment(**record)


@router.put("/assessments/{assessment_id}/approve", response_model=SuitabilityAssessment)
def approve_suitability_assessment(
    assessment_id: str,
    body: SuitabilityAssessmentUpdate,
    user: dict = Depends(get_current_user),
):
    """Approve or reject a suitability assessment.

    Only firm admins and super admins can approve assessments.
    """

    if body.approval_status not in ("approved", "rejected"):
        raise HTTPException(
            status_code=400,
            detail="approval_status must be 'approved' or 'rejected'"
        )

    # Verify the assessment exists and user has access
    try:
        result = (
            supabase_admin.table("suitability_assessments")
            .select("*")
            .eq("id", assessment_id)
            .single()
            .execute()
        )
    except Exception as e:
        logger.error("Failed to fetch assessment %s: %s", assessment_id, e)
        raise HTTPException(status_code=404, detail="Assessment not found")

    record = result.data

    # Access control - only firm_admin and above can approve
    if user.get("role") not in ("super_admin", "firm_admin"):
        raise HTTPException(status_code=403, detail="Only admins can approve assessments")

    if user.get("role") == "firm_admin" and record.get("firm_id") != user.get("firm_id"):
        raise HTTPException(status_code=403, detail="Access denied")

    # Update the record
    update_data = {
        "approval_status": body.approval_status,
        "approved_by": user["id"],
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }

    if body.notes:
        update_data["approval_notes"] = body.notes

    try:
        update_result = (
            supabase_admin.table("suitability_assessments")
            .update(update_data)
            .eq("id", assessment_id)
            .execute()
        )
        updated_record = update_result.data[0]
        logger.info(
            "Suitability assessment %s %s by user %s",
            assessment_id, body.approval_status, user["id"]
        )
        return SuitabilityAssessment(**updated_record)
    except Exception as e:
        logger.error("Failed to update assessment %s: %s", assessment_id, e)
        raise HTTPException(status_code=500, detail="Failed to update assessment")
