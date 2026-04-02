"""Adaptive system prompt management — firm-specific prompt configurations and learning."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from api_utils import call_anthropic
from config import load_system_prompt
from database import supabase_admin

router = APIRouter(prefix="/api/prompts", tags=["prompts"])
logger = logging.getLogger(__name__)

# ─── Models ────────────────────────────────────────────────


class PromptConfigUpdate(BaseModel):
    """Input model for creating/updating a prompt config."""
    config_value: str
    config_value_ar: Optional[str] = None
    description: Optional[str] = None
    learned_from: Optional[str] = None


class PromptConfigOut(BaseModel):
    """Output model for a prompt config."""
    id: str
    firm_id: str
    config_key: str
    config_value: str
    config_value_ar: Optional[str] = None
    description: Optional[str] = None
    learned_from: Optional[str] = None
    is_active: bool
    created_at: str
    updated_at: str


class LearningEvent(BaseModel):
    """A learning event (feedback processed or config updated)."""
    id: str
    firm_id: str
    event_type: str  # "prompt_updated" or "feedback_processed"
    event_data: dict
    created_at: str


class FeedbackAnalysisSuggestion(BaseModel):
    """A suggested prompt config change based on feedback analysis."""
    config_key: str
    suggested_value: str
    suggested_value_ar: Optional[str] = None
    reason: str
    confidence: float  # 0.0 - 1.0
    sample_feedback_count: int


class AnalyzeFeedbackResponse(BaseModel):
    """Response from feedback analysis endpoint."""
    suggestions: list[FeedbackAnalysisSuggestion]
    analysis_summary: str
    period_days: int
    total_feedback_analyzed: int


# ─── Helpers ────────────────────────────────────────────────


def get_adaptive_prompt(firm_id: str) -> str:
    """Build the complete adaptive system prompt for a firm.

    Merges:
    1. Base regulatory knowledge (from system_prompt.txt)
    2. Firm-specific preferences (from prompt_configs)
    3. Firm knowledge context (from knowledge_base items)

    Args:
        firm_id: The firm ID to build prompt for.

    Returns:
        The assembled system prompt string.
    """
    # Load base system prompt
    base_prompt = load_system_prompt()

    # Fetch active prompt configs for the firm
    try:
        configs_result = (
            supabase_admin.table("prompt_configs")
            .select("*")
            .eq("firm_id", firm_id)
            .eq("is_active", True)
            .execute()
        )
        configs = configs_result.data or []
    except Exception as e:
        logger.warning("Failed to fetch prompt_configs for firm %s: %s", firm_id, e)
        configs = []

    # Fetch relevant knowledge_base items (top 20 by category)
    try:
        kb_result = (
            supabase_admin.table("knowledge_base")
            .select("category, content, content_ar")
            .eq("firm_id", firm_id)
            .eq("is_active", True)
            .order("category", desc=False)
            .limit(20)
            .execute()
        )
        kb_items = kb_result.data or []
    except Exception as e:
        logger.warning("Failed to fetch knowledge_base for firm %s: %s", firm_id, e)
        kb_items = []

    # Build the complete prompt
    sections = [base_prompt]

    # Add firm-specific preferences section
    if configs:
        sections.append("\n\n## Firm-Specific Preferences\n")
        for config in configs:
            key = config.get("config_key", "")
            value = config.get("config_value", "")
            value_ar = config.get("config_value_ar")
            description = config.get("description", "")

            section_text = f"### {key}"
            if description:
                section_text += f" ({description})"
            section_text += f"\n{value}"
            if value_ar:
                section_text += f"\nArabic: {value_ar}"

            sections.append(section_text)

    # Add firm knowledge context section
    if kb_items:
        sections.append("\n\n## Firm-Specific Knowledge Context\n")
        for item in kb_items:
            category = item.get("category", "")
            content = item.get("content", "")
            content_ar = item.get("content_ar")

            section_text = f"### {category}\n{content}"
            if content_ar:
                section_text += f"\nArabic: {content_ar}"

            sections.append(section_text)

    return "\n".join(sections)


# ─── Endpoints ─────────────────────────────────────────────


@router.get("/configs", response_model=list[PromptConfigOut])
def list_prompt_configs(
    user: dict = Depends(get_current_user),
):
    """List all active prompt configs for the user's firm."""
    firm_id = user.get("firm_id")
    if not firm_id:
        raise HTTPException(status_code=400, detail="User must have a firm_id")

    try:
        result = (
            supabase_admin.table("prompt_configs")
            .select("*")
            .eq("firm_id", firm_id)
            .eq("is_active", True)
            .order("created_at", desc=False)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.exception("Failed to list prompt configs for firm %s", firm_id)
        raise HTTPException(status_code=500, detail="Failed to list prompt configs")


@router.put("/configs/{key}", response_model=PromptConfigOut)
def upsert_prompt_config(
    key: str,
    body: PromptConfigUpdate,
    user: dict = Depends(get_current_user),
):
    """Create or update a prompt config (upsert).

    If config_key exists for firm, update it; otherwise create new.
    Logs a learning_event of type 'prompt_updated'.
    """
    firm_id = user.get("firm_id")
    if not firm_id:
        raise HTTPException(status_code=400, detail="User must have a firm_id")

    try:
        # Check if config already exists
        existing = (
            supabase_admin.table("prompt_configs")
            .select("id")
            .eq("firm_id", firm_id)
            .eq("config_key", key)
            .limit(1)
            .execute()
        )

        config_row = {
            "firm_id": firm_id,
            "config_key": key,
            "config_value": body.config_value,
            "config_value_ar": body.config_value_ar,
            "description": body.description,
            "learned_from": body.learned_from,
            "is_active": True,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        if existing.data:
            # Update existing
            config_id = existing.data[0]["id"]
            result = (
                supabase_admin.table("prompt_configs")
                .update(config_row)
                .eq("id", config_id)
                .execute()
            )
            logger.info("Updated prompt config %s for firm %s", key, firm_id)
        else:
            # Insert new
            config_row["created_at"] = datetime.now(timezone.utc).isoformat()
            result = (
                supabase_admin.table("prompt_configs")
                .insert(config_row)
                .execute()
            )
            config_id = result.data[0]["id"] if result.data else None
            logger.info("Created prompt config %s for firm %s", key, firm_id)

        # Log learning event
        try:
            supabase_admin.table("learning_events").insert({
                "firm_id": firm_id,
                "event_type": "prompt_updated",
                "event_data": {
                    "config_key": key,
                    "config_id": config_id,
                    "user_id": user.get("id"),
                },
            }).execute()
        except Exception as e:
            logger.warning("Failed to log learning_event: %s", e)

        if result.data:
            return result.data[0]
        raise HTTPException(status_code=500, detail="Failed to upsert prompt config")

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to upsert prompt config %s for firm %s", key, firm_id)
        raise HTTPException(status_code=500, detail="Failed to upsert prompt config")


@router.delete("/configs/{key}")
def deactivate_prompt_config(
    key: str,
    user: dict = Depends(get_current_user),
):
    """Deactivate a prompt config (soft delete)."""
    firm_id = user.get("firm_id")
    if not firm_id:
        raise HTTPException(status_code=400, detail="User must have a firm_id")

    try:
        result = (
            supabase_admin.table("prompt_configs")
            .update({"is_active": False})
            .eq("firm_id", firm_id)
            .eq("config_key", key)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Config not found")

        logger.info("Deactivated prompt config %s for firm %s", key, firm_id)

        return {"detail": f"Config '{key}' deactivated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to deactivate prompt config %s for firm %s", key, firm_id)
        raise HTTPException(status_code=500, detail="Failed to deactivate config")


@router.get("/build")
def build_adaptive_prompt(
    user: dict = Depends(get_current_user),
):
    """Build and return the complete adaptive system prompt for the firm.

    Combines:
    - Base regulatory knowledge (from system_prompt.txt)
    - Firm-specific preferences (from prompt_configs)
    - Firm knowledge context (from knowledge_base)

    This endpoint is meant to be called by chat.py before each AI call.
    """
    firm_id = user.get("firm_id")
    if not firm_id:
        raise HTTPException(status_code=400, detail="User must have a firm_id")

    try:
        prompt = get_adaptive_prompt(firm_id)
        return {
            "prompt": prompt,
            "firm_id": firm_id,
            "built_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.exception("Failed to build adaptive prompt for firm %s", firm_id)
        raise HTTPException(status_code=500, detail="Failed to build adaptive prompt")


@router.post("/analyze-feedback", response_model=AnalyzeFeedbackResponse)
def analyze_feedback_for_suggestions(
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(get_current_user),
):
    """Analyze recent feedback to suggest prompt config changes.

    Uses Claude to analyze patterns in feedback and suggest config updates.
    Suggestions are not auto-applied. Logs a learning_event of type
    'feedback_processed'.

    Args:
        days: Number of recent days to analyze feedback from.
        user: Current user (must have firm_id).

    Returns:
        Suggestions with confidence scores, plus analysis summary.
    """
    firm_id = user.get("firm_id")
    if not firm_id:
        raise HTTPException(status_code=400, detail="User must have a firm_id")

    try:
        # Fetch recent feedback for the firm
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        feedback_result = (
            supabase_admin.table("feedback")
            .select("feature, rating, comments, original_output, edited_output")
            .eq("firm_id", firm_id)
            .gte("created_at", cutoff)
            .order("created_at", desc=False)
            .execute()
        )
        feedback_items = feedback_result.data or []

        if not feedback_items:
            logger.info("No feedback found for firm %s in last %d days", firm_id, days)
            return AnalyzeFeedbackResponse(
                suggestions=[],
                analysis_summary="No feedback data available for analysis.",
                period_days=days,
                total_feedback_analyzed=0,
            )

        # Format feedback for Claude analysis
        feedback_text = "\n".join([
            f"- Feature: {fb.get('feature')}, Rating: {fb.get('rating')}, "
            f"Comments: {fb.get('comments') or '(none)'}"
            for fb in feedback_items
        ])

        # Call Claude to analyze patterns
        analysis_prompt = f"""Analyze this feedback from a compliance AI system and suggest 3-5 prompt configuration changes that would improve user satisfaction.

Recent Feedback (last {days} days):
{feedback_text}

For each suggestion:
1. Identify a specific prompt config key (e.g., "tone", "formality", "terminology", "focus_areas", "disclaimers")
2. Suggest the config value (what to add/change in the system prompt)
3. Explain the reason (what pattern in feedback drove this)
4. Estimate confidence (0.0-1.0) based on feedback frequency

Return a JSON array with objects like:
{{"config_key": "tone", "suggested_value": "more concise and direct", "reason": "users complained about lengthy responses", "confidence": 0.8}}

Also provide a brief analysis_summary (1-2 sentences) of the main themes you see."""

        response = call_anthropic(
            messages=[{"role": "user", "content": analysis_prompt}],
            max_tokens=2000,
        )

        response_text = response.content[0].text if response.content else ""
        logger.info("Claude analysis: %s", response_text[:200])

        # Parse JSON suggestions from response
        import json
        import re

        suggestions: list[FeedbackAnalysisSuggestion] = []
        analysis_summary = ""

        # Extract JSON array from response
        json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
        if json_match:
            try:
                suggestions_data = json.loads(json_match.group(0))
                for item in suggestions_data:
                    suggestions.append(FeedbackAnalysisSuggestion(
                        config_key=item.get("config_key", ""),
                        suggested_value=item.get("suggested_value", ""),
                        suggested_value_ar=item.get("suggested_value_ar"),
                        reason=item.get("reason", ""),
                        confidence=float(item.get("confidence", 0.5)),
                        sample_feedback_count=len(feedback_items),
                    ))
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning("Failed to parse Claude suggestions JSON: %s", e)

        # Extract summary text (look for line after "analysis_summary")
        summary_match = re.search(r'analysis_summary["\']?\s*[:=]\s*["\']?([^"\']*)["\']?', response_text)
        if summary_match:
            analysis_summary = summary_match.group(1).strip()
        else:
            # Use last part of response as summary
            lines = response_text.split('\n')
            analysis_summary = ' '.join([l.strip() for l in lines[-3:] if l.strip()])[:500]

        # Log learning event
        try:
            supabase_admin.table("learning_events").insert({
                "firm_id": firm_id,
                "event_type": "feedback_processed",
                "event_data": {
                    "feedback_count": len(feedback_items),
                    "suggestions_count": len(suggestions),
                    "user_id": user.get("id"),
                    "period_days": days,
                },
            }).execute()
        except Exception as e:
            logger.warning("Failed to log learning_event: %s", e)

        return AnalyzeFeedbackResponse(
            suggestions=suggestions,
            analysis_summary=analysis_summary,
            period_days=days,
            total_feedback_analyzed=len(feedback_items),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to analyze feedback for firm %s", firm_id)
        raise HTTPException(status_code=500, detail="Failed to analyze feedback")


@router.get("/history", response_model=list[LearningEvent])
def list_learning_events(
    limit: int = Query(50, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    """List learning events (prompt_updated and feedback_processed) for the firm."""
    firm_id = user.get("firm_id")
    if not firm_id:
        raise HTTPException(status_code=400, detail="User must have a firm_id")

    try:
        result = (
            supabase_admin.table("learning_events")
            .select("*")
            .eq("firm_id", firm_id)
            .in_("event_type", ["prompt_updated", "feedback_processed"])
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        logger.exception("Failed to list learning_events for firm %s", firm_id)
        raise HTTPException(status_code=500, detail="Failed to list learning events")
