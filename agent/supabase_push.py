"""Pushing eClass data to Supabase over PostgREST.

Plain `requests` against Supabase's REST endpoint (`/rest/v1/...`) instead
of the supabase-py SDK: the agent only ever inserts/upserts a few rows per
run, and skipping the SDK keeps dependencies identical to the eclass
client (self-host preference: fewer moving parts).

Authenticated with the SERVICE-ROLE key, which bypasses Row Level Security
— this module is the only writer of the eClass tables, and the key never
leaves this machine (see supabase/schema.sql for the reader side).

Every public method raises `requests.RequestException` on failure; the
caller treats a failed push as a warning, never as a reason to abort the
local run.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

import requests

from eclass.models import Course, TimelineEvent

from .diff import GradeChange

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


class SupabaseWriter:
    """Writes courses, grade history, and timeline mirrors to Supabase."""

    def __init__(self, url: str, service_role_key: str) -> None:
        self._rest = f"{url.rstrip('/')}/rest/v1"
        self._session = requests.Session()
        self._session.headers.update(
            {
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json",
            }
        )

    # ------------------------------------------------------------------

    def _write(
        self,
        table: str,
        rows: list[dict[str, Any]],
        upsert_on: str | None = None,
    ) -> None:
        if not rows:
            return
        headers = {"Prefer": "return=minimal"}
        params: dict[str, str] = {}
        if upsert_on:
            headers["Prefer"] += ",resolution=merge-duplicates"
            params["on_conflict"] = upsert_on
        response = self._session.post(
            f"{self._rest}/{table}",
            json=rows,
            headers=headers,
            params=params,
            timeout=30,
        )
        response.raise_for_status()
        logger.debug("Supabase %s: wrote %d row(s)", table, len(rows))

    # ------------------------------------------------------------------

    def upsert_courses(self, courses: list[Course]) -> None:
        self._write(
            "courses",
            [
                {
                    "id": course.id,
                    "shortname": course.shortname,
                    "fullname": course.fullname,
                    "hidden": course.hidden,
                    "updated_at": _now(),
                }
                for course in courses
            ],
            upsert_on="id",
        )

    def insert_snapshot(self, course_id: int, report: dict[str, Any]) -> None:
        """One grade history row — called on baseline and on change only."""
        self._write(
            "grade_snapshots",
            [{"course_id": course_id, "report": report, "fetched_at": _now()}],
        )

    def insert_grade_events(
        self, course_id: int, changes: list[GradeChange]
    ) -> None:
        self._write(
            "grade_events",
            [
                {
                    "course_id": course_id,
                    "kind": change.kind,
                    "item_name": change.item_name,
                    "category": change.category,
                    "old": change.old,
                    "new": change.new,
                    "is_total": change.is_total,
                    "detected_at": _now(),
                }
                for change in changes
            ],
        )

    def replace_timeline(self, events: list[TimelineEvent]) -> None:
        """Make timeline_events mirror "what's upcoming right now"."""
        self._write(
            "timeline_events",
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
                    "updated_at": _now(),
                }
                for event in events
            ],
            upsert_on="id",
        )
        # Drop rows that are no longer upcoming (submitted, deleted, past).
        # PostgREST requires a filter on DELETE; id=gt.0 matches all rows
        # when the current set is empty (Moodle ids are positive).
        ids = ",".join(str(event.id) for event in events)
        params = {"id": f"not.in.({ids})"} if ids else {"id": "gt.0"}
        response = self._session.delete(
            f"{self._rest}/timeline_events", params=params, timeout=30
        )
        response.raise_for_status()
