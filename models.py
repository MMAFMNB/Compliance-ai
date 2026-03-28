from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class Language(str, Enum):
    Arabic = "ar"
    English = "en"


# ─── Auth ───────────────────────────────────────────────────

class SignUpRequest(BaseModel):
    email: str
    password: str
    name: str
    organization: str = "TAM Capital"
    language_pref: Language = Language.Arabic


class SignInRequest(BaseModel):
    email: str
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    organization: Optional[str] = None
    language_pref: Optional[Language] = None


class UserProfile(BaseModel):
    id: str
    email: str
    name: str
    organization: str
    role: str
    language_pref: Language


# ─── Chat ───────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    language: Optional[Language] = None


class ChatResponse(BaseModel):
    response: str
    conversation_id: str


# ─── Conversations ──────────────────────────────────────────

class ConversationPreview(BaseModel):
    id: str
    created_at: str
    preview: str
    message_count: int


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    citations: Optional[dict] = None
    model: Optional[str] = None
    latency_ms: Optional[int] = None
    created_at: str


class ConversationDetail(BaseModel):
    id: str
    created_at: str
    messages: list[MessageOut]
