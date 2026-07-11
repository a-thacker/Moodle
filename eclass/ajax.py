"""Generic client for Moodle's internal AJAX API.

Every modern piece of the Moodle UI (dashboard, timeline, calendar,
notifications, ...) is driven by ``POST /lib/ajax/service.php``, which
exposes Moodle *external functions* — the same functions behind the token
web service API — but authenticated with the browser session:

* the Moodle session cookie (already on our ``requests.Session``)
* the ``sesskey`` query parameter

Request body (a JSON array; multiple calls can be batched)::

    [{"index": 0, "methodname": "<function>", "args": {...}}]

Response::

    [{"error": false, "data": {...}}]           on success
    [{"error": true,  "exception": {...}}]      on per-call failure
    {"error": "...", "errorcode": "..."}        on request-level failure

This module wraps all of that so feature code is one line::

    data = ajax.call("core_calendar_get_action_events_by_timesort", {...})

Adding support for a new Moodle feature is usually just: watch the network
tab, note the ``methodname`` and args, add a thin wrapper on the client.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable

import requests

from .exceptions import MoodleAPIError, SessionExpired

logger = logging.getLogger(__name__)

ENDPOINT = "/lib/ajax/service.php"

# Error codes that mean "your session/sesskey is dead", not "bad request".
_SESSION_ERROR_CODES = {
    "invalidsesskey",
    "servicerequireslogin",
    "requireloginerror",
    "sitepolicynotagreed",
}


class AjaxClient:
    """Thin, reusable wrapper around ``/lib/ajax/service.php``.

    Args:
        session: An authenticated ``requests.Session`` (cookies already set).
        base_url: Moodle root URL, no trailing slash.
        get_sesskey: Callable returning the current sesskey. A callable —
            not a value — so a re-login mid-process transparently yields
            the fresh sesskey on the next call.
    """

    def __init__(
        self,
        session: requests.Session,
        base_url: str,
        get_sesskey: Callable[[], str],
    ) -> None:
        self._session = session
        self._base_url = base_url.rstrip("/")
        self._get_sesskey = get_sesskey

    # ------------------------------------------------------------------

    def call(self, method: str, args: dict[str, Any]) -> Any:
        """Invoke a single Moodle external function and return its data.

        Raises:
            SessionExpired: the session cookie or sesskey is no longer valid.
            MoodleAPIError: Moodle rejected the call (bad args, no permission,
                unknown method, ...).
        """
        return self.call_many([(method, args)])[0]

    def call_many(self, calls: list[tuple[str, dict[str, Any]]]) -> list[Any]:
        """Invoke several external functions in one HTTP request.

        Returns the ``data`` payloads in the same order as ``calls``.
        """
        payload = [
            {"index": i, "methodname": method, "args": args}
            for i, (method, args) in enumerate(calls)
        ]
        info = calls[0][0] if len(calls) == 1 else f"batch:{len(calls)}"

        started = time.perf_counter()
        response = self._session.post(
            f"{self._base_url}{ENDPOINT}",
            params={"sesskey": self._get_sesskey(), "info": info},
            json=payload,
            timeout=30,
        )
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.debug(
            "AJAX %s -> HTTP %d in %.0f ms", info, response.status_code, elapsed_ms
        )
        response.raise_for_status()

        try:
            body = response.json()
        except ValueError as exc:
            raise MoodleAPIError(
                "AJAX endpoint returned non-JSON (session likely expired "
                "and Moodle served a login page instead)."
            ) from exc

        # Request-level failure: a bare object instead of a results array.
        if isinstance(body, dict):
            self._raise_for_error(
                message=str(body.get("error") or "Unknown AJAX error"),
                errorcode=body.get("errorcode"),
                method=info,
            )

        results: list[Any] = []
        for (method, _args), item in zip(calls, body):
            if item.get("error"):
                exception = item.get("exception") or {}
                self._raise_for_error(
                    message=exception.get("message") or str(item["error"]),
                    errorcode=exception.get("errorcode"),
                    method=method,
                )
            results.append(item.get("data"))
        return results

    # ------------------------------------------------------------------

    @staticmethod
    def _raise_for_error(message: str, errorcode: Any, method: str) -> None:
        code = str(errorcode) if errorcode else None
        if code in _SESSION_ERROR_CODES:
            raise SessionExpired(f"Moodle session rejected: {message} [{code}]")
        raise MoodleAPIError(message, errorcode=code, method=method)
