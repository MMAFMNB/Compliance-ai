"""Tests for /api/alerts endpoints."""

from unittest.mock import MagicMock, patch


# ── GET /api/alerts ───────────────────────────────────────────────────

def test_list_alerts_empty(client, fake_supabase):
    """Returns an empty list when there are no alerts."""
    resp = client.get("/api/alerts")
    assert resp.status_code == 200
    body = resp.json()
    assert body["alerts"] == []
    assert body["total"] == 0
    assert body["unread"] == 0


# ── POST /api/alerts/{alert_id}/read ──────────────────────────────────

def test_mark_alert_read(client, fake_supabase):
    """Marking an alert as read returns status: read."""
    resp = client.post("/api/alerts/alert-1/read")
    assert resp.status_code == 200
    assert resp.json()["status"] == "read"


# ── POST /api/alerts/scrape ───────────────────────────────────────────

def test_trigger_scrape(client, fake_supabase):
    """POST /alerts/scrape invokes the scraper pipeline and returns results."""
    mock_result = {"news_found": 3, "total_saved": 3}

    with (
        patch("scraper.run_scraper", return_value=mock_result),
        patch("scheduler.sync_obligations_to_deadlines", return_value=1),
    ):
        resp = client.post("/api/alerts/scrape")

    assert resp.status_code == 200
    body = resp.json()
    assert body["news_found"] == 3
    assert body["deadlines_added"] == 1


# ── POST /api/alerts/process ──────────────────────────────────────────

def test_trigger_processing(client, fake_supabase):
    """POST /alerts/process returns count of processed alerts."""
    with patch("alerts.process_unprocessed_alerts", return_value=5):
        resp = client.post("/api/alerts/process")

    assert resp.status_code == 200
    assert resp.json()["processed"] == 5
