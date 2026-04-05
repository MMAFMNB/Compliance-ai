"""Shared fixtures for the backend test suite.

Sets dummy environment variables BEFORE any application module is imported,
then patches Supabase clients and auth so no real external calls are made.
"""

import os
import sys

# ── 1. Set required environment variables BEFORE app import ────────────
os.environ["ANTHROPIC_API_KEY"] = "test-key"
os.environ["SUPABASE_URL"] = "https://fake.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZha2UiLCJyb2xlIjoiYW5vbiJ9."
    "FAKE"
)
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZha2UiLCJyb2xlIjoic2VydmljZV9yb2xlIn0."
    "FAKE"
)
os.environ["SUPABASE_JWT_SECRET"] = "fake-jwt-secret-for-testing"
os.environ["FRONTEND_URL"] = "http://localhost:3000"
os.environ["RAG_ENABLED"] = "false"

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ── 2. Helpers ─────────────────────────────────────────────────────────

def _make_fake_supabase():
    """Return a MagicMock that supports chained Supabase query calls.

    Example:  supabase_admin.table("x").select("*").eq("k","v").execute()
    """
    mock = MagicMock()

    execute_result = MagicMock()
    execute_result.data = []
    execute_result.count = 0

    chain = MagicMock()
    chain.execute.return_value = execute_result
    for method in (
        "select", "insert", "update", "upsert", "delete",
        "eq", "neq", "in_", "gte", "lte", "like", "not_", "is_",
        "order", "limit", "range", "single",
    ):
        getattr(chain, method).return_value = chain

    mock.table.return_value = chain
    mock.auth = MagicMock()
    return mock


FAKE_USER = {
    "id": "test-user-id",
    "email": "test@test.com",
    "full_name": "Test",
    "role": "compliance_officer",
    "firm_id": None,
    "language_preference": "ar",
}

# Every module that does `from database import supabase_admin` needs its
# own local binding patched.  We list them all so the fake propagates.
_SUPABASE_ADMIN_MODULES = [
    "database",
    "auth",
    "auth_routes",
    "calendar_routes",
    "chat",
    "conversations",
    "dashboard",
    "docgen",
    "feedback",
    "ingest",
    "rag",
    "review",
    "admin_routes",
    "circular_parser",
    "scraper",
]

# Modules that also import the public `supabase` client
_SUPABASE_PUBLIC_MODULES = [
    "database",
    "auth_routes",
    "admin_routes",
]

# ── 3. Fixtures ────────────────────────────────────────────────────────

@pytest.fixture()
def fake_supabase():
    """A fresh fake Supabase client; tests can customise .table() behaviour."""
    return _make_fake_supabase()


@pytest.fixture()
def client(fake_supabase):
    """FastAPI TestClient with every external dependency mocked.

    Patches supabase_admin (and supabase) in every module that imported them,
    overrides get_current_user, and stubs the Anthropic client.
    """
    patches = []

    for mod in _SUPABASE_ADMIN_MODULES:
        patches.append(patch(f"{mod}.supabase_admin", fake_supabase))

    for mod in _SUPABASE_PUBLIC_MODULES:
        patches.append(patch(f"{mod}.supabase", fake_supabase))

    patches.append(patch("api_utils.client", MagicMock()))

    # Enter all patches
    for p in patches:
        p.start()

    try:
        from main import app
        from auth import get_current_user

        app.dependency_overrides[get_current_user] = lambda: FAKE_USER

        with TestClient(app) as tc:
            yield tc

        app.dependency_overrides.clear()
    finally:
        for p in patches:
            p.stop()
