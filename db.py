"""
Database layer for Server Health Checker.

Uses SQLite with a small schema: servers (targets) and check_history (time series).
Beginners: this file isolates all SQL so routes stay readable.
"""

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Generator, Optional

# Default path; override with env DATABASE_PATH (e.g. in Docker)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, "database", "healthchecker.db")


def get_db_path() -> str:
    return os.environ.get("DATABASE_PATH", DEFAULT_DB_PATH)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@contextmanager
def get_connection() -> Generator[sqlite3.Connection, None, None]:
    """Yield a SQLite connection with row factory for dict-like rows."""
    path = get_db_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Create tables if they do not exist."""
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL,
                last_status_code INTEGER,
                last_response_ms REAL,
                last_online INTEGER NOT NULL DEFAULT 0,
                last_checked_at TEXT,
                last_error TEXT
            );

            CREATE TABLE IF NOT EXISTS check_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                status_code INTEGER,
                response_ms REAL,
                is_online INTEGER NOT NULL,
                checked_at TEXT NOT NULL,
                error_message TEXT,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_history_server_time
            ON check_history (server_id, checked_at DESC);
            """
        )


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def list_servers() -> list[dict[str, Any]]:
    with get_connection() as conn:
        cur = conn.execute(
            "SELECT * FROM servers ORDER BY created_at DESC"
        )
        return [row_to_dict(r) for r in cur.fetchall()]


def get_server(server_id: int) -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        cur = conn.execute("SELECT * FROM servers WHERE id = ?", (server_id,))
        row = cur.fetchone()
        return row_to_dict(row) if row else None


def add_server(name: str, url: str) -> int:
    now = utc_now_iso()
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO servers (name, url, created_at, last_online)
            VALUES (?, ?, ?, 0)
            """,
            (name.strip(), url.strip(), now),
        )
        return int(cur.lastrowid)


def delete_server(server_id: int) -> bool:
    with get_connection() as conn:
        cur = conn.execute("DELETE FROM servers WHERE id = ?", (server_id,))
        return cur.rowcount > 0


def update_server_last_check(
    server_id: int,
    status_code: Optional[int],
    response_ms: Optional[float],
    is_online: bool,
    error_message: Optional[str],
) -> None:
    now = utc_now_iso()
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE servers SET
                last_status_code = ?,
                last_response_ms = ?,
                last_online = ?,
                last_checked_at = ?,
                last_error = ?
            WHERE id = ?
            """,
            (
                status_code,
                response_ms,
                1 if is_online else 0,
                now,
                error_message,
                server_id,
            ),
        )


def insert_history(
    server_id: int,
    status_code: Optional[int],
    response_ms: Optional[float],
    is_online: bool,
    error_message: Optional[str],
) -> None:
    now = utc_now_iso()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO check_history
            (server_id, status_code, response_ms, is_online, checked_at, error_message)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                server_id,
                status_code,
                response_ms,
                1 if is_online else 0,
                now,
                error_message,
            ),
        )


def get_history(server_id: int, limit: int = 100) -> list[dict[str, Any]]:
    limit = max(1, min(limit, 500))
    with get_connection() as conn:
        cur = conn.execute(
            """
            SELECT * FROM check_history
            WHERE server_id = ?
            ORDER BY checked_at DESC
            LIMIT ?
            """,
            (server_id, limit),
        )
        return [row_to_dict(r) for r in cur.fetchall()]


def aggregate_stats() -> dict[str, Any]:
    """Counts for dashboard summary cards."""
    with get_connection() as conn:
        total = conn.execute("SELECT COUNT(*) AS c FROM servers").fetchone()["c"]
        online = conn.execute(
            "SELECT COUNT(*) AS c FROM servers WHERE last_online = 1"
        ).fetchone()["c"]
        checks = conn.execute("SELECT COUNT(*) AS c FROM check_history").fetchone()[
            "c"
        ]
    return {"total_servers": total, "online_now": online, "total_checks": checks}
