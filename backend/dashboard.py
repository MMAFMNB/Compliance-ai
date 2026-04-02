"""Dashboard API: stats, audit trail, and reporting."""

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from auth import get_current_user
from database import supabase_admin

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class DashboardStats(BaseModel):
    total_conversations: int
    total_messages: int
    total_documents: int
    total_chunks: int
    total_reviews: int
    total_alerts: int
    unread_alerts: int
    recent_topics: list[str]


class AuditEntry(BaseModel):
    id: str
    type: str  # "chat", "review", "search"
    summary: str
    created_at: str


class AuditResponse(BaseModel):
    entries: list[AuditEntry]
    total: int


@router.get("/stats", response_model=DashboardStats)
def get_stats(user: dict = Depends(get_current_user)):
    """Get dashboard statistics for the current user."""
    user_id = user["id"]

    # Conversation count
    convs = (
        supabase_admin.table("conversations")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )

    # Message count
    msgs = (
        supabase_admin.table("messages")
        .select("id, conversation_id", count="exact")
        .execute()
    )
    # Filter messages by user's conversations
    user_conv_ids = (
        supabase_admin.table("conversations")
        .select("id")
        .eq("user_id", user_id)
        .execute()
    )
    conv_ids = [c["id"] for c in user_conv_ids.data]
    user_msg_count = 0
    if conv_ids:
        user_msgs = (
            supabase_admin.table("messages")
            .select("id", count="exact")
            .in_("conversation_id", conv_ids)
            .execute()
        )
        user_msg_count = user_msgs.count or 0

    # Document + chunk counts (global)
    docs = supabase_admin.table("documents").select("id", count="exact").execute()
    chunks = supabase_admin.table("chunks").select("id", count="exact").execute()

    # Review count
    reviews = (
        supabase_admin.table("document_reviews")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .execute()
    )

    # Alert counts
    alerts = supabase_admin.table("alerts").select("id", count="exact").execute()
    reads = (
        supabase_admin.table("alert_reads")
        .select("alert_id")
        .eq("user_id", user_id)
        .execute()
    )
    total_alerts = alerts.count or 0
    unread_alerts = total_alerts - len(reads.data)

    # Recent topics from user's last 10 conversations (first message preview)
    recent_topics = []
    if conv_ids:
        recent_convs = (
            supabase_admin.table("conversations")
            .select("id")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )
        for conv in recent_convs.data:
            first_msg = (
                supabase_admin.table("messages")
                .select("content")
                .eq("conversation_id", conv["id"])
                .eq("role", "user")
                .order("created_at", desc=False)
                .limit(1)
                .execute()
            )
            if first_msg.data:
                recent_topics.append(first_msg.data[0]["content"][:80])

    return DashboardStats(
        total_conversations=convs.count or 0,
        total_messages=user_msg_count,
        total_documents=docs.count or 0,
        total_chunks=chunks.count or 0,
        total_reviews=reviews.count or 0,
        total_alerts=total_alerts,
        unread_alerts=max(0, unread_alerts),
        recent_topics=recent_topics,
    )


@router.get("/audit", response_model=AuditResponse)
def get_audit_trail(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: dict = Depends(get_current_user),
):
    """Get the user's audit trail: recent chats and reviews."""
    user_id = user["id"]
    entries = []

    # Recent conversations
    convs = (
        supabase_admin.table("conversations")
        .select("id, created_at, messages(content, role)")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    for conv in convs.data:
        msgs = conv.get("messages", [])
        preview = msgs[0]["content"][:80] if msgs else "..."
        entries.append(
            AuditEntry(
                id=conv["id"],
                type="chat",
                summary=preview,
                created_at=conv["created_at"],
            )
        )

    # Recent reviews
    reviews = (
        supabase_admin.table("document_reviews")
        .select("id, filename, total_findings, non_compliant, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    for rev in reviews.data:
        summary = f"{rev['filename']} \u2014 {rev['total_findings']} findings, {rev['non_compliant']} non-compliant"
        entries.append(
            AuditEntry(
                id=rev["id"],
                type="review",
                summary=summary,
                created_at=rev["created_at"],
            )
        )

    # Sort all entries by date
    entries.sort(key=lambda e: e.created_at, reverse=True)
    total = len(entries)
    entries = entries[offset : offset + limit]

    return AuditResponse(entries=entries, total=total)
