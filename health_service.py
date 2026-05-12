"""
HTTP health check logic.

Performs a timed GET request and classifies online/offline for the dashboard.
"""

from dataclasses import dataclass
from typing import Optional

import requests


@dataclass
class HealthResult:
    """Outcome of a single health check."""

    is_online: bool
    status_code: Optional[int]
    response_ms: Optional[float]
    error_message: Optional[str]


def normalize_url(url: str) -> str:
    u = url.strip()
    if not u:
        raise ValueError("URL is empty")
    if not (u.startswith("http://") or u.startswith("https://")):
        u = "https://" + u
    return u


def check_url(url: str, timeout_seconds: float = 12.0) -> HealthResult:
    """
    GET the URL and measure latency.

    We treat any HTTP response with status < 500 as "online" (reachable).
    Timeouts and connection errors count as offline.
    """
    try:
        # Stream=False: we only need headers/status for speed
        resp = requests.get(
            url,
            timeout=timeout_seconds,
            allow_redirects=True,
            headers={"User-Agent": "ServerHealthChecker/1.0"},
        )
        elapsed = resp.elapsed.total_seconds() * 1000.0
        code = resp.status_code
        online = code < 500
        err = None if online else f"HTTP {code}"
        return HealthResult(
            is_online=online,
            status_code=code,
            response_ms=round(elapsed, 2),
            error_message=err,
        )
    except requests.exceptions.Timeout:
        return HealthResult(
            is_online=False,
            status_code=None,
            response_ms=None,
            error_message="Request timed out",
        )
    except requests.exceptions.RequestException as e:
        return HealthResult(
            is_online=False,
            status_code=None,
            response_ms=None,
            error_message=str(e)[:500],
        )
