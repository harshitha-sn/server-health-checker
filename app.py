"""
Server Health Checker — Flask application entrypoint.

Exposes the HTML dashboard and JSON REST API for monitoring targets.
"""

import logging
import re
from typing import Any

from flask import Flask, jsonify, render_template, request
from prometheus_flask_exporter import PrometheusMetrics

import db
from health_service import HealthResult, check_url, normalize_url

logger = logging.getLogger(__name__)


def create_app() -> Flask:
    app = Flask(
        __name__,
        static_folder="static",
        template_folder="templates",
    )
    app.config["JSON_SORT_KEYS"] = False

    # Prometheus metrics at /metrics (use PROMETHEUS_MULTIPROC_DIR with Gunicorn multi-worker)
    PrometheusMetrics(app, path="/metrics")

    @app.errorhandler(404)
    def not_found(_e):
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": "Not found"}), 404
        return render_template("index.html"), 404

    @app.errorhandler(500)
    def server_error(_e):
        logger.exception("Unhandled server error")
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": "Internal server error"}), 500
        return render_template("index.html"), 500

    @app.route("/")
    def index():
        return render_template("index.html")

    # ----- REST API -----

    @app.route("/api/health", methods=["GET"])
    def api_health():
        """Liveness probe for Docker / load balancers."""
        return jsonify({"ok": True, "service": "server-health-checker"})

    @app.route("/api/stats", methods=["GET"])
    def api_stats():
        try:
            stats = db.aggregate_stats()
            return jsonify({"ok": True, "data": stats})
        except Exception as e:
            logger.exception("api_stats")
            return jsonify({"ok": False, "error": str(e)}), 500

    @app.route("/api/servers", methods=["GET"])
    def api_list_servers():
        try:
            servers = db.list_servers()
            return jsonify({"ok": True, "data": servers})
        except Exception as e:
            logger.exception("api_list_servers")
            return jsonify({"ok": False, "error": str(e)}), 500

    @app.route("/api/servers", methods=["POST"])
    def api_add_server():
        payload = request.get_json(silent=True) or {}
        name = (payload.get("name") or "").strip() or "Untitled"
        url_raw = (payload.get("url") or "").strip()
        if not url_raw:
            return jsonify({"ok": False, "error": "url is required"}), 400
        try:
            url = normalize_url(url_raw)
        except ValueError as ve:
            return jsonify({"ok": False, "error": str(ve)}), 400
        if not _looks_like_url(url):
            return jsonify({"ok": False, "error": "Invalid URL format"}), 400
        try:
            sid = db.add_server(name, url)
            return jsonify({"ok": True, "data": {"id": sid}}), 201
        except Exception as e:
            if "UNIQUE constraint failed" in str(e):
                return jsonify({"ok": False, "error": "That URL is already monitored"}), 409
            logger.exception("api_add_server")
            return jsonify({"ok": False, "error": str(e)}), 500

    @app.route("/api/servers/<int:server_id>", methods=["DELETE"])
    def api_delete_server(server_id: int):
        try:
            ok = db.delete_server(server_id)
            if not ok:
                return jsonify({"ok": False, "error": "Server not found"}), 404
            return jsonify({"ok": True})
        except Exception as e:
            logger.exception("api_delete_server")
            return jsonify({"ok": False, "error": str(e)}), 500

    @app.route("/api/servers/<int:server_id>/check", methods=["POST"])
    def api_check_one(server_id: int):
        row = db.get_server(server_id)
        if not row:
            return jsonify({"ok": False, "error": "Server not found"}), 404
        result = _run_and_persist_check(server_id, row["url"])
        return jsonify({"ok": True, "data": _result_payload(result)})

    @app.route("/api/check-all", methods=["POST"])
    def api_check_all():
        servers = db.list_servers()
        results: list[dict[str, Any]] = []
        for s in servers:
            r = _run_and_persist_check(int(s["id"]), s["url"])
            results.append({"server_id": s["id"], **_result_payload(r)})
        return jsonify({"ok": True, "data": results})

    @app.route("/api/servers/<int:server_id>/history", methods=["GET"])
    def api_history(server_id: int):
        if not db.get_server(server_id):
            return jsonify({"ok": False, "error": "Server not found"}), 404
        try:
            limit = int(request.args.get("limit", 60))
        except ValueError:
            limit = 60
        rows = db.get_history(server_id, limit=limit)
        # Oldest-first for charts
        rows_chrono = list(reversed(rows))
        return jsonify({"ok": True, "data": rows_chrono})

    # One-time schema creation (safe to call repeatedly).
    db.init_db()

    return app


def _looks_like_url(url: str) -> bool:
    return bool(re.match(r"^https?://[^\s]+$", url, re.I))


def _run_and_persist_check(server_id: int, url: str) -> HealthResult:
    result = check_url(url)
    db.update_server_last_check(
        server_id,
        result.status_code,
        result.response_ms,
        result.is_online,
        result.error_message,
    )
    db.insert_history(
        server_id,
        result.status_code,
        result.response_ms,
        result.is_online,
        result.error_message,
    )
    return result


def _result_payload(r: HealthResult) -> dict[str, Any]:
    return {
        "is_online": r.is_online,
        "status_code": r.status_code,
        "response_ms": r.response_ms,
        "error_message": r.error_message,
    }


app = create_app()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    db.init_db()
    app.run(host="0.0.0.0", port=int(__import__("os").environ.get("PORT", "5000")))
