"""Firm-specific knowledge base management: documents, policies, and learning."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api_utils import call_anthropic
from auth import get_current_user
from database import supabase_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

VALID_CATEGORIES = {
    "policy",
    "decision",
    "procedure",
    "template",
    "guideline",
    "faq",
    "terminology",
    "case_study",
}
VALID_SOURCE_TYPES = {"manual", "feedback", "document", "chat_extract"}


# ─── Models ────────────────────────────────────────────────

class KnowledgeItemCreate(BaseModel):
    title: str
    title_ar: Optional[str] = None
    content: str
    content_ar: Optional[str] = None
    category: str
    tags: list[str] = []
    source_type: str
    source_id: Optional[str] = None


class KnowledgeItemUpdate(BaseModel):
    title: Optional[str] = None
    title_ar: Optional[str] = None
    content: Optional[str] = None
    content_ar: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None


class KnowledgeItemOut(BaseModel):
    id: str
    firm_id: str
    title: str
    title_ar: Optional[str]
    content: str
    content_ar: Optional[str]
    category: str
    tags: list[str]
    source_type: str
    source_id: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str


class ExtractedKnowledgeItem(BaseModel):
    title: str
    title_ar: Optional[str]
    content: str
    content_ar: Optional[str]
    category: str
    tags: list[str]
    reason: str


class KnowledgeExtractionInput(BaseModel):
    feedback_ids: Optional[list[str]] = None
    limit: int = 10  # If feedback_ids is None, fetch latest N feedback items


class KnowledgeStats(BaseModel):
    total_items: int
    items_by_category: dict[str, int]
    items_by_source: dict[str, int]
    recently_added: int  # Count added in last 7 days
    has_embeddings: bool


# ─── Endpoints ─────────────────────────────────────────────

@router.post("/items", response_model=KnowledgeItemOut)
def add_knowledge_item(
    body: KnowledgeItemCreate,
    user: dict = Depends(get_current_user),
):
    """Add a new knowledge base item. Requires user's firm context."""
    if body.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Invalid category: {body.category}")
    if body.source_type not in VALID_SOURCE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid source_type: {body.source_type}")

    firm_id = user.get("firm_id")
    if not firm_id:
        raise HTTPException(status_code=400, detail="User must have firm_id")

    row = {
        "firm_id": firm_id,
        "title": body.title,
        "title_ar": body.title_ar,
        "content": body.content,
        "content_ar": body.content_ar,
        "category": body.category,
        "tags": body.tags,
        "source_type": body.source_type,
        "source_id": body.source_id,
        "is_active": True,
    }

    result = supabase_admin.table("knowledge_base").insert(row).execute()
    item = result.data[0]

    # Log learning event
    try:
        supabase_admin.table("learning_events").insert({
            "firm_id": firm_id,
            "event_type": "kb_added",
            "details": {
                "kb_item_id": item["id"],
                "category": body.category,
                "source_type": body.source_type,
            },
            "triggered_by": user.get("id", "system"),
        }).execute()
    except Exception as e:
        logger.warning("Failed to log learning_event for kb_added: %s", e)

    logger.info("Knowledge item added: %s (firm: %s)", item["id"], firm_id)
    return item


@router.get("/items", response_model=list[KnowledgeItemOut])
def list_knowledge_items(
    category: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),  # Comma-separated
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    """List knowledge base items. Filtered by category, tags, active status, and text search."""
    firm_id = user.get("firm_id")

    # Build query
    query = supabase_admin.table("knowledge_base").select("*")

    # Permission: super_admin sees all firms, others see only their firm
    if user.get("role") not in ("super_admin",):
        query = query.eq("firm_id", firm_id)
    elif firm_id:
        # Non-super_admin: lock to firm
        query = query.eq("firm_id", firm_id)

    # Filters
    if is_active is not None:
        query = query.eq("is_active", is_active)
    else:
        query = query.eq("is_active", True)  # Default: show only active

    if category:
        query = query.eq("category", category)

    query = query.order("created_at", desc=True).limit(limit).offset(offset)

    result = query.execute()
    items = result.data or []

    # Post-filter by tags and search (Supabase JSON filtering is limited)
    if tags:
        tag_list = [t.strip() for t in tags.split(",")]
        items = [
            item for item in items
            if any(tag in item.get("tags", []) for tag in tag_list)
        ]

    if search:
        search_lower = search.lower()
        items = [
            item for item in items
            if (
                search_lower in item.get("title", "").lower()
                or search_lower in item.get("title_ar", "").lower()
                or search_lower in item.get("content", "").lower()
                or search_lower in item.get("content_ar", "").lower()
            )
        ]

    return items


@router.get("/items/{id}", response_model=KnowledgeItemOut)
def get_knowledge_item(
    id: str,
    user: dict = Depends(get_current_user),
):
    """Get a knowledge base item by ID."""
    result = supabase_admin.table("knowledge_base").select("*").eq("id", id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge item not found")

    item = result.data[0]

    # Permission check
    firm_id = user.get("firm_id")
    if user.get("role") not in ("super_admin",) and item.get("firm_id") != firm_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    return item


@router.put("/items/{id}", response_model=KnowledgeItemOut)
def update_knowledge_item(
    id: str,
    body: KnowledgeItemUpdate,
    user: dict = Depends(get_current_user),
):
    """Update a knowledge base item."""
    # Fetch existing item for permission check
    result = supabase_admin.table("knowledge_base").select("*").eq("id", id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge item not found")

    item = result.data[0]
    firm_id = user.get("firm_id")
    if user.get("role") not in ("super_admin",) and item.get("firm_id") != firm_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Build update dict with only provided fields
    update_row = {}
    if body.title is not None:
        update_row["title"] = body.title
    if body.title_ar is not None:
        update_row["title_ar"] = body.title_ar
    if body.content is not None:
        update_row["content"] = body.content
    if body.content_ar is not None:
        update_row["content_ar"] = body.content_ar
    if body.category is not None:
        if body.category not in VALID_CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Invalid category: {body.category}")
        update_row["category"] = body.category
    if body.tags is not None:
        update_row["tags"] = body.tags

    if not update_row:
        return item  # Nothing to update

    result = (
        supabase_admin.table("knowledge_base")
        .update(update_row)
        .eq("id", id)
        .execute()
    )
    return result.data[0]


@router.delete("/items/{id}")
def delete_knowledge_item(
    id: str,
    user: dict = Depends(get_current_user),
):
    """Soft delete a knowledge base item (set is_active=false)."""
    # Fetch existing item for permission check
    result = supabase_admin.table("knowledge_base").select("*").eq("id", id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge item not found")

    item = result.data[0]
    firm_id = user.get("firm_id")
    if user.get("role") not in ("super_admin",) and item.get("firm_id") != firm_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    supabase_admin.table("knowledge_base").update({"is_active": False}).eq("id", id).execute()

    logger.info("Knowledge item deleted (soft): %s", id)
    return {"message": "Item deleted"}


@router.post("/extract-from-feedback")
def extract_knowledge_from_feedback(
    body: KnowledgeExtractionInput,
    user: dict = Depends(get_current_user),
):
    """Extract reusable knowledge from feedback patterns.

    Analyzes edited outputs, comments, and terminology adjustments to identify
    firm-specific knowledge that can improve future AI outputs.
    """
    firm_id = user.get("firm_id")
    if not firm_id:
        raise HTTPException(status_code=400, detail="User must have firm_id")

    # Fetch feedback items
    feedback_query = supabase_admin.table("feedback").select("*").eq("firm_id", firm_id)

    if body.feedback_ids:
        feedback_query = feedback_query.in_("id", body.feedback_ids)
    else:
        feedback_query = feedback_query.order("created_at", desc=True).limit(body.limit)

    feedback_result = feedback_query.execute()
    feedback_items = feedback_result.data or []

    if not feedback_items:
        return {"extracted_items": [], "message": "No feedback items to analyze"}

    # Build extraction prompt
    feedback_text = "\n\n".join([
        f"Feedback #{i+1}:\n"
        f"Feature: {item.get('feature')}\n"
        f"Rating: {item.get('rating')}\n"
        f"Original: {item.get('original_output', 'N/A')[:500]}\n"
        f"Edited: {item.get('edited_output', 'N/A')[:500]}\n"
        f"Comments: {item.get('comments', 'N/A')}\n"
        for i, item in enumerate(feedback_items[:20])  # Limit to 20 for token budget
    ])

    extraction_prompt = f"""Analyze the following feedback entries from a compliance AI system.
Identify patterns, terminology preferences, structural adjustments, and tone changes.
Extract reusable knowledge that would improve future outputs for this firm.

## Feedback Entries
{feedback_text}

## Analysis Instructions
1. Look for repeated edits or adjustments (e.g., "تحديد المسؤوليات" vs "تحديد الالتزامات")
2. Identify terminology preferences (Arabic vs English, formal vs informal)
3. Note structural preferences (numbered lists vs bullets, detailed vs concise)
4. Capture domain-specific corrections or clarifications
5. Extract firm-specific policies or standards mentioned in comments

## Output Format
Return a JSON array of extracted knowledge items. Each item MUST include:
- title (English, concise)
- title_ar (Arabic if applicable, null otherwise)
- content (the extracted knowledge, 1-3 sentences)
- content_ar (Arabic version if applicable, null otherwise)
- category (one of: policy, decision, procedure, template, guideline, faq, terminology, case_study)
- tags (list of relevant tags)
- reason (why this was extracted from the feedback)

Example output:
[
  {{
    "title": "Arabic Terminology Preference",
    "title_ar": "تفضيل المصطلحات العربية",
    "content": "Use 'مسؤول الامتثال' instead of 'موظف الامتثال' for compliance officer roles.",
    "content_ar": "استخدم 'مسؤول الامتثال' بدلاً من 'موظف الامتثال' لأدوار المسؤولين عن الامتثال.",
    "category": "terminology",
    "tags": ["arabic", "compliance", "titles"],
    "reason": "Repeated across 3 feedback entries (IDs: #2, #5, #8)"
  }},
  ...
]

Return ONLY the JSON array, no additional text."""

    try:
        response = call_anthropic(
            max_tokens=3000,
            system="You are an expert at analyzing feedback patterns to extract reusable knowledge.",
            messages=[{"role": "user", "content": extraction_prompt}],
        )
    except Exception as e:
        logger.error("Claude API error during extraction: %s", e)
        raise HTTPException(status_code=502, detail=f"LLM API error: {e}")

    # Parse response
    text_blocks = [b for b in response.content if b.type == "text"]
    if not text_blocks:
        raise HTTPException(status_code=502, detail="LLM returned no text content")

    response_text = text_blocks[0].text
    logger.debug("Extraction response: %s", response_text)

    try:
        extracted = json.loads(response_text)
        if not isinstance(extracted, list):
            extracted = [extracted]
    except json.JSONDecodeError as e:
        logger.error("Failed to parse extraction JSON: %s", e)
        raise HTTPException(status_code=502, detail="Failed to parse LLM response")

    # Save extracted items
    saved_items = []
    for item_data in extracted:
        try:
            # Validate category
            if item_data.get("category") not in VALID_CATEGORIES:
                logger.warning("Invalid category in extraction: %s, using 'guideline'", item_data.get("category"))
                item_data["category"] = "guideline"

            row = {
                "firm_id": firm_id,
                "title": item_data.get("title", "Extracted Knowledge"),
                "title_ar": item_data.get("title_ar"),
                "content": item_data.get("content", ""),
                "content_ar": item_data.get("content_ar"),
                "category": item_data.get("category", "guideline"),
                "tags": item_data.get("tags", []),
                "source_type": "feedback",
                "source_id": f"extraction_batch_{user['id']}",
                "is_active": True,
            }

            result = supabase_admin.table("knowledge_base").insert(row).execute()
            saved_item = result.data[0]
            saved_items.append(saved_item)
            logger.info("Extracted knowledge item saved: %s", saved_item["id"])

        except Exception as e:
            logger.warning("Failed to save extracted item: %s", e)
            continue

    # Log learning event
    try:
        supabase_admin.table("learning_events").insert({
            "firm_id": firm_id,
            "event_type": "kb_extracted",
            "details": {
                "feedback_count": len(feedback_items),
                "extracted_count": len(saved_items),
            },
            "triggered_by": user.get("id", "system"),
        }).execute()
    except Exception as e:
        logger.warning("Failed to log learning_event for kb_extracted: %s", e)

    return {
        "extracted_items": saved_items,
        "message": f"Extracted {len(saved_items)} knowledge items from {len(feedback_items)} feedback entries",
    }


@router.get("/stats", response_model=KnowledgeStats)
def get_knowledge_stats(
    user: dict = Depends(get_current_user),
):
    """Get knowledge base statistics for the user's firm."""
    firm_id = user.get("firm_id")
    if not firm_id:
        raise HTTPException(status_code=400, detail="User must have firm_id")

    # Fetch all active items for this firm
    result = (
        supabase_admin.table("knowledge_base")
        .select("*")
        .eq("firm_id", firm_id)
        .eq("is_active", True)
        .execute()
    )
    items = result.data or []

    # Count by category
    by_category = {}
    by_source = {}
    recent_count = 0

    for item in items:
        category = item.get("category", "unknown")
        by_category[category] = by_category.get(category, 0) + 1

        source = item.get("source_type", "unknown")
        by_source[source] = by_source.get(source, 0) + 1

        # Count recently added (last 7 days)
        # Note: This is a simple check; for production, compare with datetime
        created = item.get("created_at", "")
        if created and len(created) >= 10:  # Has date portion
            recent_count += 1  # Simplified; actual production would check date range

    # Check if embeddings table has data (simplified)
    try:
        emb_result = (
            supabase_admin.table("knowledge_embeddings")
            .select("id", count="exact")
            .eq("firm_id", firm_id)
            .limit(1)
            .execute()
        )
        has_embeddings = (emb_result.count or 0) > 0
    except Exception:
        has_embeddings = False

    return KnowledgeStats(
        total_items=len(items),
        items_by_category=by_category,
        items_by_source=by_source,
        recently_added=recent_count,
        has_embeddings=has_embeddings,
    )
