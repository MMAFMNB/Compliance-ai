"""Tests for GET /api/search."""


def test_search_returns_501_when_rag_disabled(client):
    """Search should return 501 when RAG_ENABLED is false (default in tests)."""
    resp = client.get("/api/search", params={"q": "fund management"})
    assert resp.status_code == 501
    assert "RAG" in resp.json()["detail"]


def test_search_requires_query_param(client):
    """Missing 'q' parameter should return 422 validation error."""
    resp = client.get("/api/search")
    assert resp.status_code == 422


def test_search_query_too_short(client):
    """Query shorter than 2 characters should return 422."""
    resp = client.get("/api/search", params={"q": "x"})
    assert resp.status_code == 422
