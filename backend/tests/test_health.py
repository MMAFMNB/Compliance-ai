"""Tests for the root health-check endpoint."""


def test_health_returns_ok(client):
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "TAM Compliance AI"
    assert "version" in body


def test_health_contains_version_string(client):
    resp = client.get("/")
    assert resp.json()["version"] == "3.0.0"
