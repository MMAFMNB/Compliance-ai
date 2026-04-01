"""Tests for /api/calendar endpoints."""


def test_list_deadlines_empty(client, fake_supabase):
    """Returns empty list when no deadlines exist."""
    resp = client.get("/api/calendar/deadlines")
    assert resp.status_code == 200
    body = resp.json()
    assert body["deadlines"] == []
    assert body["total"] == 0


def test_list_deadlines_filter_by_category(client, fake_supabase):
    """Category query parameter is accepted."""
    resp = client.get("/api/calendar/deadlines", params={"category": "aml"})
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["deadlines"], list)


def test_get_upcoming(client, fake_supabase):
    """GET /upcoming returns a valid response."""
    resp = client.get("/api/calendar/upcoming", params={"days": 30})
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["upcoming"], list)
    assert "total" in body
