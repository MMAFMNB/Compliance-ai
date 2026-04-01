"""Tests for GET /api/dashboard/stats."""


def test_dashboard_stats_empty(client, fake_supabase):
    """Dashboard stats with no data returns all zeros."""
    resp = client.get("/api/dashboard/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_conversations"] == 0
    assert body["total_messages"] == 0
    assert body["total_documents"] == 0
    assert body["total_chunks"] == 0
    assert body["total_reviews"] == 0
    assert body["total_alerts"] == 0
    assert body["unread_alerts"] == 0
    assert body["recent_topics"] == []


def test_dashboard_audit_empty(client, fake_supabase):
    """Dashboard audit with no data returns empty entries."""
    resp = client.get("/api/dashboard/audit")
    assert resp.status_code == 200
    body = resp.json()
    assert body["entries"] == []
