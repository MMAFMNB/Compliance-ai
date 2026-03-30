from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class Language(str, Enum):
    Arabic = "ar"
    English = "en"


class UserRole(str, Enum):
    super_admin = "super_admin"
    firm_admin = "firm_admin"
    compliance_officer = "compliance_officer"
    analyst = "analyst"
    auditor = "auditor"
    read_only = "read_only"


# ─── Auth ───────────────────────────────────────────────────

class SignUpRequest(BaseModel):
    email: str
    password: str
    name: str
    organization: str = "TAM Capital"
    language_pref: Language = Language.Arabic


class CreateProfileRequest(BaseModel):
    """Create a profile row for an already-registered Supabase auth user."""
    user_id: str
    email: str
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
    firm_id: Optional[str] = None
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
    created_at: str


class ConversationDetail(BaseModel):
    id: str
    created_at: str
    messages: list[MessageOut]
