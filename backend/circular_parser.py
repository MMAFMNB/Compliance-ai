"""AI-powered CMA circular parser: extract obligations, deadlines, and actions."""

import json
import logging
import re
from datetime import datetime, timezone

import anthropic

from api_utils import call_anthropic
from config import ANTHROPIC_API_KEY, MODEL
from database import supabase_admin

logger = logging.getLogger(__name__)

PARSE_PROMPT = """You are a Saudi CMA regulatory expert. Analyze this CMA publication and extract all compliance obligations.

Title: {title}
Type: {doc_type}
Source: {source_url}
Impact Summary: {impact_summary}

Extract ALL obligations, requirements, and action items from this publication. For each obligation provide:

1. "obligation": The requirement text in Arabic
2. "obligation_en": The requirement text in English
3. "category": One of: governance, aml_kyc, reporting, client_management, risk_management, operations, licensing, disclosure, market_conduct, technology
4. "deadline": The deadline or timeframe as text (e.g. "خلال 30 يوم عمل", "Within 30 business days", "Before 2026-06-30"), or null
5. "deadline_date": If a specific date can be determined, provide it as "YYYY-MM-DD", otherwise null
6. "priority": "high", "medium", or "low" based on urgency and severity
7. "affected_roles": List of affected roles from: compliance_officer, fund_manager, board_member, aml_officer, risk_manager, operations, legal, it_security

Return ONLY a JSON object:
{{
  "obligations": [
    {{
      "obligation": "...",
      "obligation_en": "...",
      "category": "...",
      "deadline": "...",
      "deadline_date": "YYYY-MM-DD" or null,
      "priority": "high|medium|low",
      "affected_roles": ["..."]
    }}
  ]
}}

If no specific obligations can be extracted, return {{"obligations": []}}.
Provide between 1 and 10 obligations. Focus on actionable requirements."""


def parse_circular(alert: dict) -> list[dict]:
    """Parse a CMA alert/circular and extract regulatory obligations using Claude.

    Returns a list of obligation dicts ready for DB insertion.
    """
    prompt = PARSE_PROMPT.format(
        title=alert.get("title", ""),
        doc_type=alert.get("doc_type", ""),
        source_url=alert.get("source_url", ""),
        impact_summary=alert.get("impact_summary", "No summary available"),
    )

    try:
        response = call_anthropic(
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = response.content[0].text.strip()
    except Exception:
        logger.exception("Claude API error while parsing alert %s", alert.get("id"))
        return []

    # Strip markdown fences
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1]
        raw_text = raw_text.rsplit("```", 1)[0].strip()

    # Extract JSON
    json_match = re.search(r"\{[\s\S]*\}", raw_text)
    if json_match:
        raw_text = json_match.group(0)

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        logger.error("Failed to parse circular JSON for alert %s: %s", alert.get("id"), raw_text[:300])
        return []

    obligations = parsed.get("obligations", [])
    if not isinstance(obligations, list):
        return []

    return obligations


def save_obligations(alert_id: str, obligations: list[dict]) -> int:
    """Save parsed obligations to the database. Returns count saved."""
    if not obligations:
        return 0

    rows = []
    for ob in obligations:
        rows.append({
            "alert_id": alert_id,
            "obligation": ob.get("obligation", ""),
            "obligation_en": ob.get("obligation_en"),
            "category": ob.get("category", "other"),
            "deadline": ob.get("deadline"),
            "deadline_date": ob.get("deadline_date"),
            "priority": ob.get("priority", "medium"),
            "affected_roles": ob.get("affected_roles", []),
            "status": "pending",
        })

    try:
        supabase_admin.table("regulatory_obligations").insert(rows).execute()
    except Exception:
        logger.exception("Failed to save obligations for alert %s", alert_id)
        return 0

    # Mark alert as parsed
    now = datetime.now(timezone.utc).isoformat()
    supabase_admin.table("alerts").update(
        {"is_parsed": True, "parsed_at": now}
    ).eq("id", alert_id).execute()

    return len(rows)


def process_unparsed_alerts(limit: int = 5) -> dict:
    """Find alerts that have impact summaries but haven't been parsed yet.

    Returns summary of processing results.
    """
    result = (
        supabase_admin.table("alerts")
        .select("*")
        .eq("is_processed", True)
        .eq("is_parsed", False)
        .order("created_at", desc=False)
        .limit(limit)
        .execute()
    )

    total_obligations = 0
    alerts_parsed = 0

    for alert in result.data:
        obligations = parse_circular(alert)
        saved = save_obligations(alert["id"], obligations)
        if saved > 0:
            alerts_parsed += 1
            total_obligations += saved
        logger.info(
            "Parsed alert %s: %d obligations extracted",
            alert["id"], saved,
        )

    return {
        "alerts_parsed": alerts_parsed,
        "total_obligations": total_obligations,
    }
