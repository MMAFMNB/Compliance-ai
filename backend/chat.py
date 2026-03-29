import json
import logging
import time
import uuid

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from auth import get_current_user
from config import ANTHROPIC_API_KEY, MODEL, load_system_prompt
from database import supabase_admin
from models import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
SYSTEM_PROMPT = load_system_prompt()

MAX_CONTEXT_MESSAGES = 20

_rag_available: bool | None = None


def _is_rag_available() -> bool:
    """Check if chunks have been ingested into the database.

    Only caches True (once chunks exist, they stay). Re-checks on False
    so that ingesting documents mid-session activates RAG without restart.
    """
    global _rag_available
    if _rag_available is True:
        return True

    result = supabase_admin.table("chunks").select("id", count="exact").limit(1).execute()
    has_chunks = (result.count or 0) > 0
    if has_chunks:
        _rag_available = True
    return has_chunks


def _get_rag_system_prompt(user_message: str) -> str:
    """Build system prompt with RAG context if available."""
    import os
    if os.getenv("RAG_ENABLED", "false").lower() != "true":
        return SYSTEM_PROMPT

    if not _is_rag_available():
        return SYSTEM_PROMPT

    try:
        from rag import rag_query, build_rag_context, build_rag_prompt
        chunks = rag_query(user_message)
        if not chunks:
            return SYSTEM_PROMPT

        rag_context = build_rag_context(chunks)
        augmented_prompt, _ = build_rag_prompt(SYSTEM_PROMPT, rag_context, [], user_message)
        return augmented_prompt
    except Exception:
        logger.exception("RAG pipeline failed, falling back to base system prompt")
        return SYSTEM_PROMPT


def _get_conversation_messages(conversation_id: str) -> list[dict]:
    """Fetch the last N messages for a conversation from the database."""
    result = (
        supabase_admin.table("messages")
        .select("role, content")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .execute()
    )
    messages = [{"role": m["role"], "content": m["content"]} for m in result.data]
    return messages[-MAX_CONTEXT_MESSAGES:]


def _save_message(conversation_id: str, role: str, content: str) -> None:
    """Persist a message to the database."""
    supabase_admin.table("messages").insert(
        {
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
        }
    ).execute()


def _ensure_conversation(conversation_id: str | None, user_id: str) -> str:
    """Return existing conversation_id or create a new conversation."""
    if conversation_id:
        result = (
            supabase_admin.table("conversations")
            .select("id")
            .eq("id", conversation_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if result.data:
            return conversation_id
        raise HTTPException(status_code=404, detail="Conversation not found")

    new_id = str(uuid.uuid4())
    supabase_admin.table("conversations").insert(
        {"id": new_id, "user_id": user_id}
    ).execute()
    return new_id


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest, user: dict = Depends(get_current_user)):
    """Non-streaming chat endpoint. Uses RAG context when available."""
    conv_id = _ensure_conversation(request.conversation_id, user["id"])

    _save_message(conv_id, "user", request.message)
    messages = _get_conversation_messages(conv_id)

    system_prompt = _get_rag_system_prompt(request.message)

    start = time.perf_counter()
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
        )
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"LLM API error: {e}")

    latency_ms = int((time.perf_counter() - start) * 1000)
    text_blocks = [b for b in response.content if b.type == "text"]
    if not text_blocks:
        raise HTTPException(status_code=502, detail="LLM returned no text content")
    assistant_text = text_blocks[0].text

    _save_message(conv_id, "assistant", assistant_text)

    return ChatResponse(response=assistant_text, conversation_id=conv_id)


@router.post("/chat/stream")
def chat_stream(request: ChatRequest, user: dict = Depends(get_current_user)):
    """Streaming chat endpoint using SSE. Uses RAG context when available."""
    conv_id = _ensure_conversation(request.conversation_id, user["id"])

    _save_message(conv_id, "user", request.message)
    messages = _get_conversation_messages(conv_id)

    system_prompt = _get_rag_system_prompt(request.message)

    def generate():
        full_response = ""
        start = time.perf_counter()

        try:
            yield f"data: {json.dumps({'type': 'conversation_id', 'conversation_id': conv_id})}\n\n"

            with client.messages.stream(
                model=MODEL,
                max_tokens=4096,
                system=system_prompt,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    full_response += text
                    yield f"data: {json.dumps({'type': 'text', 'text': text})}\n\n"

            latency_ms = int((time.perf_counter() - start) * 1000)
            try:
                _save_message(conv_id, "assistant", full_response)
            except Exception:
                logger.exception("Failed to persist assistant message for conversation %s", conv_id)

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except anthropic.APIError as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        except Exception as e:
            logger.exception("Unexpected error during streaming for conversation %s", conv_id)
            yield f"data: {json.dumps({'type': 'error', 'error': 'Internal server error'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
