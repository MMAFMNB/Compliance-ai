from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from database import supabase_admin
from models import ConversationPreview, ConversationDetail, MessageOut

router = APIRouter(prefix="/api", tags=["conversations"])


@router.get("/conversations", response_model=list[ConversationPreview])
def list_conversations(user: dict = Depends(get_current_user)):
    """List all conversations for the current user, most recent first."""
    result = (
        supabase_admin.table("conversations")
        .select("id, created_at, messages(content, role)")
        .eq("user_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )

    previews = []
    for conv in result.data:
        msgs = conv.get("messages", [])
        preview_text = msgs[0]["content"][:100] if msgs else ""
        previews.append(
            ConversationPreview(
                id=conv["id"],
                created_at=conv["created_at"],
                preview=preview_text,
                message_count=len(msgs),
            )
        )

    return previews


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: str, user: dict = Depends(get_current_user)
):
    """Get a specific conversation with all messages."""
    result = (
        supabase_admin.table("conversations")
        .select("id, created_at")
        .eq("id", conversation_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv = result.data[0]

    msgs = (
        supabase_admin.table("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .execute()
    )

    return ConversationDetail(
        id=conv["id"],
        created_at=conv["created_at"],
        messages=[MessageOut(**m) for m in msgs.data],
    )


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: str, user: dict = Depends(get_current_user)
):
    """Delete a conversation and all its messages."""
    result = (
        supabase_admin.table("conversations")
        .select("id")
        .eq("id", conversation_id)
        .eq("user_id", user["id"])
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Conversation not found")

    supabase_admin.table("conversations").delete().eq("id", conversation_id).execute()
    return {"status": "deleted"}
