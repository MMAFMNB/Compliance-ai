"""Suspicious Transaction Report (STR) generation using Claude AI."""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api_utils import call_anthropic
from auth import get_current_user
from database import supabase_admin

router = APIRouter(prefix="/api/str", tags=["str"])
logger = logging.getLogger(__name__)


# ─── Models ────────────────────────────────────────────────


class STRReportOut(BaseModel):
    """Output model for an STR report."""
    id: str
    case_id: str
    firm_id: Optional[str] = None
    status: str  # draft, reviewed, submitted
    title: str
    report_number: Optional[str] = None
    subject_name: Optional[str] = None
    subject_id: Optional[str] = None
    suspicion_summary: Optional[str] = None
    suspicion_summary_ar: Optional[str] = None
    transaction_summary: Optional[str] = None
    transaction_summary_ar: Optional[str] = None
    evidence_summary: Optional[str] = None
    evidence_summary_ar: Optional[str] = None
    suspicion_indicators: Optional[list] = None
    recommended_actions: Optional[list] = None
    full_report_en: Optional[str] = None
    full_report_ar: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = None
    submitted_at: Optional[str] = None
    created_by: str
    created_at: str
    updated_at: str


class STRGenerateRequest(BaseModel):
    """Request body for STR generation."""
    case_id: str


class STRReviewRequest(BaseModel):
    """Request body for marking STR as reviewed."""
    notes: Optional[str] = None


class STRSubmitRequest(BaseModel):
    """Request body for submitting STR to SAFIU."""
    notes: Optional[str] = None


# ─── Helper Functions ──────────────────────────────────────


def generate_report_number() -> str:
    """Generate a unique STR report number in format STR-YYYY-NNNN."""
    now = datetime.now(timezone.utc)
    year = now.year

    try:
        result = supabase_admin.table("str_reports").select("report_number").order(
            "created_at", desc=True
        ).limit(1).execute()

        if result.data:
            last_number = result.data[0].get("report_number", "")
            try:
                seq = int(last_number.split("-")[-1])
                next_seq = seq + 1
            except (ValueError, IndexError):
                next_seq = 1
        else:
            next_seq = 1
    except Exception:
        next_seq = 1

    return f"STR-{year}-{next_seq:04d}"


def add_timeline_entry(
    case_id: str,
    event_type: str,
    user_id: str,
    description: Optional[str] = None
):
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


def build_str_generation_prompt(case: dict, evidence_list: list) -> tuple[str, str]:
    """Build the system and user prompts for STR generation.

    Returns tuple of (system_prompt, user_prompt)
    """
    system_prompt = """You are a Saudi AML (Anti-Money Laundering) compliance expert specializing in
Suspicious Transaction Report (STR) preparation under SAFIU (Saudi Arabia Financial Intelligence Unit)
requirements. You have deep knowledge of:

- CMA (Capital Market Authority) Anti-Money Laundering Regulations
- SAFIU reporting format and requirements
- Transaction pattern analysis and risk assessment
- AML typologies and suspicion indicators
- Bilingual documentation (Arabic and English)

Your task is to generate professional, compliant STR reports that clearly establish grounds for suspicion
based on evidence and regulatory guidance. Reports must be comprehensive yet concise, suitable for SAFIU submission.

Generate output in valid JSON format with both English and Arabic sections."""

    # Format transaction data
    transaction_info = ""
    if case.get("transaction_ids"):
        transaction_info = f"""
Transaction IDs: {', '.join(case.get('transaction_ids', []))}"""

    # Format evidence summaries
    evidence_sections = []
    for ev in evidence_list:
        ev_desc = f"- {ev.get('title', 'Evidence')}"
        if ev.get('description'):
            ev_desc += f": {ev.get('description')}"
        if ev.get('evidence_type'):
            ev_desc += f" (Type: {ev.get('evidence_type')})"
        evidence_sections.append(ev_desc)

    evidence_text = "\n".join(evidence_sections) if evidence_sections else "No evidence provided"

    user_prompt = f"""Generate a comprehensive Suspicious Transaction Report (STR) for the following AML case:

CASE INFORMATION:
- Case Number: {case.get('case_number', 'N/A')}
- Case Type: {case.get('case_type', 'N/A')}
- Priority: {case.get('priority', 'N/A')}
- Title: {case.get('title', 'N/A')}
- Description: {case.get('description', 'N/A')}
{transaction_info}

CUSTOMER/SUBJECT INFORMATION:
- Customer ID: {case.get('customer_id', 'N/A')}
- Name: {case.get('metadata', {}).get('subject_name', 'N/A')}
- Account: {case.get('metadata', {}).get('subject_account', 'N/A')}
- ID Type: {case.get('metadata', {}).get('subject_id_type', 'N/A')}
- ID Number: {case.get('metadata', {}).get('subject_id_number', 'N/A')}

EVIDENCE COLLECTED:
{evidence_text}

Generate a bilingual STR report (JSON format) with the following structure:

{{
  "report_metadata": {{
    "report_type": "Suspicious Transaction Report",
    "reporting_entity": "Financial Institution Name",
    "reporting_date": "YYYY-MM-DD",
    "reporting_jurisdiction": "Saudi Arabia"
  }},
  "subject_information": {{
    "name": "Full Name",
    "national_id": "ID Number",
    "account_number": "Account",
    "account_type": "Individual/Corporate"
  }},
  "suspicion_summary_en": "Clear, concise English summary of suspicion grounds (2-3 paragraphs)",
  "suspicion_summary_ar": "Arabic translation of suspicion summary",
  "transaction_summary_en": "Details of suspicious transactions in English",
  "transaction_summary_ar": "Arabic translation of transaction summary",
  "evidence_summary_en": "Summary of supporting evidence in English",
  "evidence_summary_ar": "Arabic translation of evidence summary",
  "suspicion_indicators": [
    {{
      "indicator_name": "Name of AML typology or indicator",
      "description": "How this indicator applies to the subject",
      "severity": "high|medium|low",
      "supporting_evidence": "Reference to specific evidence"
    }}
  ],
  "recommended_actions": [
    {{
      "action": "Specific recommended action",
      "priority": "immediate|high|medium",
      "rationale": "Why this action is recommended"
    }}
  ],
  "full_report_en": "Complete detailed report in English addressing all regulatory requirements",
  "full_report_ar": "Complete detailed report in Arabic"
}}

Ensure:
1. Reports reference CMA AML Regulations and SAFIU requirements
2. Suspicion is clearly established with factual, evidence-based reasoning
3. All sections are comprehensive and professional
4. Arabic translations are accurate and maintain legal terminology
5. Indicators follow international AML typologies and Saudi context
6. Recommended actions are specific and actionable"""

    return system_prompt, user_prompt


# ─── Endpoints ─────────────────────────────────────────────


@router.post("/generate/{case_id}", response_model=STRReportOut)
def generate_str_report(
    case_id: str,
    body: STRGenerateRequest,
    user: dict = Depends(get_current_user),
):
    """Generate an STR report from a case using Claude AI.

    Fetches case and evidence data, builds a detailed prompt, calls Claude,
    parses the response, and saves the report to str_reports table.
    Adds timeline entry to aml_cases.
    """
    # Fetch case
    try:
        case_result = supabase_admin.table("aml_cases").select("*").eq("id", case_id).execute()
        if not case_result.data:
            raise HTTPException(status_code=404, detail="Case not found")

        case = case_result.data[0]

        # Check firm access
        if user.get("role") != "super_admin" and case.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to fetch case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to fetch case")

    # Fetch evidence for this case
    try:
        evidence_result = supabase_admin.table("aml_evidence").select(
            "*"
        ).eq("case_id", case_id).execute()
        evidence_list = evidence_result.data if evidence_result.data else []
    except Exception:
        logger.warning("Failed to fetch evidence for case %s", case_id)
        evidence_list = []

    # Build prompts
    system_prompt, user_prompt = build_str_generation_prompt(case, evidence_list)

    # Call Claude
    try:
        logger.info("Generating STR report for case %s using Claude", case_id)
        response = call_anthropic(
            messages=[{"role": "user", "content": user_prompt}],
            system=system_prompt,
            max_tokens=4096,
        )

        # Extract the response text
        response_text = response.content[0].text

        # Parse JSON from response
        # Try to extract JSON from markdown code block if present
        json_str = response_text
        if "```json" in json_str:
            json_str = json_str.split("```json")[1].split("```")[0].strip()
        elif "```" in json_str:
            json_str = json_str.split("```")[1].split("```")[0].strip()

        str_data = json.loads(json_str)
    except json.JSONDecodeError as e:
        logger.exception("Failed to parse Claude response as JSON")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse AI response: {str(e)}"
        )
    except Exception as e:
        logger.exception("Failed to call Claude for STR generation")
        raise HTTPException(status_code=500, detail="Failed to generate report with AI")

    # Build report record
    report_number = generate_report_number()
    now = datetime.now(timezone.utc).isoformat()

    report_row = {
        "case_id": case_id,
        "firm_id": case.get("firm_id"),
        "status": "draft",
        "report_number": report_number,
        "title": f"STR - {case.get('case_number', 'Unknown')}",
        "subject_name": str_data.get("subject_information", {}).get("name"),
        "subject_id": str_data.get("subject_information", {}).get("national_id"),
        "suspicion_summary": str_data.get("suspicion_summary_en"),
        "suspicion_summary_ar": str_data.get("suspicion_summary_ar"),
        "transaction_summary": str_data.get("transaction_summary_en"),
        "transaction_summary_ar": str_data.get("transaction_summary_ar"),
        "evidence_summary": str_data.get("evidence_summary_en"),
        "evidence_summary_ar": str_data.get("evidence_summary_ar"),
        "suspicion_indicators": str_data.get("suspicion_indicators", []),
        "recommended_actions": str_data.get("recommended_actions", []),
        "full_report_en": str_data.get("full_report_en"),
        "full_report_ar": str_data.get("full_report_ar"),
        "created_by": user["id"],
    }

    # Save report
    try:
        result = supabase_admin.table("str_reports").insert(report_row).execute()
        report = result.data[0]

        # Add timeline entry
        add_timeline_entry(
            case_id,
            "str_generated",
            user["id"],
            f"STR report {report_number} generated"
        )

        logger.info("STR report %s generated for case %s by user %s", report_number, case_id, user["id"])
        return report
    except Exception as e:
        logger.exception("Failed to save STR report for case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to save generated report")


@router.get("/{report_id}", response_model=STRReportOut)
def get_str_report(
    report_id: str,
    user: dict = Depends(get_current_user),
):
    """Get detailed information about an STR report."""
    try:
        result = supabase_admin.table("str_reports").select("*").eq("id", report_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Report not found")

        report = result.data[0]

        # Check firm access
        if user.get("role") != "super_admin" and report.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")

        return report
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get STR report %s", report_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve report")


@router.get("/case/{case_id}")
def list_str_reports(
    case_id: str,
    user: dict = Depends(get_current_user),
):
    """List all STR reports for a specific case."""
    # Verify case access
    try:
        case_result = supabase_admin.table("aml_cases").select("firm_id").eq("id", case_id).execute()
        if not case_result.data:
            raise HTTPException(status_code=404, detail="Case not found")

        case = case_result.data[0]
        if user.get("role") != "super_admin" and case.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to verify case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to verify case")

    try:
        result = supabase_admin.table("str_reports").select("*").eq(
            "case_id", case_id
        ).order("created_at", desc=True).execute()
        return {"reports": result.data, "count": len(result.data)}
    except Exception as e:
        logger.exception("Failed to list STR reports for case %s", case_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve reports")


@router.put("/{report_id}/review", response_model=STRReportOut)
def review_str_report(
    report_id: str,
    body: STRReviewRequest,
    user: dict = Depends(get_current_user),
):
    """Mark an STR report as reviewed.

    Sets status='reviewed', reviewed_by, and reviewed_at timestamp.
    """
    # Get existing report
    try:
        result = supabase_admin.table("str_reports").select("*").eq("id", report_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Report not found")

        report = result.data[0]

        # Check firm access
        if user.get("role") != "super_admin" and report.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get STR report %s", report_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve report")

    now = datetime.now(timezone.utc).isoformat()

    updates = {
        "status": "reviewed",
        "reviewed_by": user["id"],
        "reviewed_at": now,
        "updated_at": now,
    }

    try:
        result = supabase_admin.table("str_reports").update(updates).eq("id", report_id).execute()
        updated_report = result.data[0]

        # Add timeline entry
        add_timeline_entry(
            report["case_id"],
            "str_reviewed",
            user["id"],
            f"STR report {report.get('report_number')} marked as reviewed"
        )

        logger.info("STR report %s marked as reviewed by user %s", report_id, user["id"])
        return updated_report
    except Exception as e:
        logger.exception("Failed to update STR report %s", report_id)
        raise HTTPException(status_code=500, detail="Failed to update report")


@router.put("/{report_id}/submit", response_model=STRReportOut)
def submit_str_to_safiu(
    report_id: str,
    body: STRSubmitRequest,
    user: dict = Depends(get_current_user),
):
    """Submit an STR report to SAFIU.

    Sets status='submitted', submitted_at timestamp, and updates parent case
    with str_submitted_to_safiu=true.
    """
    # Get existing report
    try:
        result = supabase_admin.table("str_reports").select("*").eq("id", report_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Report not found")

        report = result.data[0]

        # Check firm access
        if user.get("role") != "super_admin" and report.get("firm_id") != user.get("firm_id"):
            raise HTTPException(status_code=403, detail="Access denied")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get STR report %s", report_id)
        raise HTTPException(status_code=500, detail="Failed to retrieve report")

    now = datetime.now(timezone.utc).isoformat()

    updates = {
        "status": "submitted",
        "submitted_at": now,
        "updated_at": now,
    }

    try:
        # Update report
        report_result = supabase_admin.table("str_reports").update(updates).eq("id", report_id).execute()
        updated_report = report_result.data[0]

        # Update parent case
        case_id = report.get("case_id")
        supabase_admin.table("aml_cases").update({
            "str_submitted_to_safiu": True,
            "updated_at": now,
        }).eq("id", case_id).execute()

        # Add timeline entry
        add_timeline_entry(
            case_id,
            "str_submitted_to_safiu",
            user["id"],
            f"STR report {report.get('report_number')} submitted to SAFIU"
        )

        logger.info("STR report %s submitted to SAFIU by user %s", report_id, user["id"])
        return updated_report
    except Exception as e:
        logger.exception("Failed to submit STR report %s to SAFIU", report_id)
        raise HTTPException(status_code=500, detail="Failed to submit report")
