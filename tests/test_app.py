"""Smoke tests for the Flask app (used by Jenkins pytest stage)."""

import os
import tempfile

import pytest

from app import create_app


@pytest.fixture
def client(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("DATABASE_PATH", path)
    application = create_app()
    application.config["TESTING"] = True
    with application.test_client() as test_client:
        yield test_client


def test_health_endpoint(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.get_json()
    assert body["ok"] is True


def test_add_and_list_server(client):
    res = client.post(
        "/api/servers",
        json={"name": "Example", "url": "https://example.com"},
    )
    assert res.status_code == 201
    listed = client.get("/api/servers")
    data = listed.get_json()["data"]
    assert len(data) == 1
    assert data[0]["url"] == "https://example.com"


def test_duplicate_url_conflict(client):
    client.post("/api/servers", json={"name": "A", "url": "https://dup.test"})
    res = client.post("/api/servers", json={"name": "B", "url": "https://dup.test"})
    assert res.status_code == 409


def test_prometheus_metrics_endpoint(client):
    res = client.get("/metrics")
    assert res.status_code == 200
    body = res.data.decode()
    assert "# HELP" in body or "# TYPE" in body
