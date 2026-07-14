"""Push eClass data to the self-hosted Command Center FastAPI backend.

Drop-in replacement for :class:`SupabaseWriter`: same method names, so the
agent's run loop doesn't care which target it's using. Authenticated with the
shared agent API key (``X-API-Key``); hits the ``/api/v1/ingest/*`` endpoints.

Every method raises ``requests.RequestException`` on failure; the caller
treats a failed push as a warning, never a reason to abort the local run.
"""

from __future__ import annotations

import logging
from typing import Any

import requests

from eclass.models import Course, TimelineEvent

from .diff import GradeChange

logger = logging.getLogger(__name__)


class BackendWriter:
    """Writes courses, grade history, change events, and the timeline to the
    Command Center backend."""

    def __init__(self, api_url: str, api_key: str) -> None:
        self._base = f"{api_url.rstrip('/')}/api/v1/ingest"
        self._session = requests.Session()
        self._session.headers.update({"X-API-Key": api_key})

    def _send(self, method: str, path: str, payload: Any) -> None:
        response = self._session.request(
            method, f"{self._base}{path}", json=payload, timeout=30
        )
        response.raise_for_status()
        logger.debug("backend %s %s -> %s", method, path, response.status_code)

    def upsert_courses(self, courses: list[Course]) -> None:
        self._send(
            "PUT",
            "/courses",
            [
                {
                    "id": c.id,
                    "short_name": c.shortname,
                    "full_name": c.fullname,
                    "hidden": c.hidden,
                }
                for c in courses
            ],
        )

    def insert_snapshot(self, course_id: int, report: dict[str, Any]) -> None:
        self._send(
            "POST", "/grade-snapshots", {"course_id": course_id, "report": report}
        )

    def insert_grade_events(
        self, course_id: int, changes: list[GradeChange]
    ) -> None:
        self._send(
            "POST",
            "/grade-events",
            [
                {
                    "course_id": course_id,
                    "kind": change.kind,
                    "item_name": change.item_name,
                    "category": change.category,
                    "old": change.old,
                    "new": change.new,
                    "is_total": change.is_total,
                }
                for change in changes
            ],
        )

    def replace_timeline(self, events: list[TimelineEvent]) -> None:
        self._send(
            "PUT",
            "/timeline",
            [
                {
                    "id": event.id,
                    "name": event.name,
                    "due": event.due.astimezone().isoformat(timespec="seconds"),
                    "module": event.module,
                    "course_id": event.course_id,
                    "course_name": event.course_name,
                    "url": event.url,
                    "overdue": event.overdue,
                }
                for event in events
            ],
        )
