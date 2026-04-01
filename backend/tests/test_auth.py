"""Tests for /api/auth endpoints."""

from tests.conftest import FAKE_USER


# ── GET /api/auth/me ───────────────────────────────────────────────────

def test_get_me(client):
    """GET /me returns the current user profile."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == FAKE_USER["id"]
    assert body["email"] == FAKE_USER["email"]
    assert body["role"] == "compliance_officer"


# ── POST /api/auth/logout ─────────────────────────────────────────────

def test_logout(client):
    """POST /logout returns logged_out status."""
    resp = client.post("/api/auth/logout")
    assert resp.status_code == 200
    assert resp.json()["status"] == "logged_out"


# ── POST /api/auth/profile ────────────────────────────────────────────

def test_create_profile(client, fake_supabase):
    """POST /profile creates a user profile row."""
    resp = client.post(
        "/api/auth/profile",
        json={
            "user_id": "uid-123",
            "email": "profile@example.com",
            "name": "Profile User",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "created"
    assert body["user_id"] == "uid-123"
