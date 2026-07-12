"""Snapshot persistence for the sync agent.

One JSON file per course under the snapshot directory, holding the last
seen ``GradeReport.to_dict()`` plus a little metadata. JSON on disk (not a
database) on purpose: snapshots are small, human-readable, and diffable
with ordinary tools when something looks wrong.

``runs.log`` gets one line per completed run; over time the gap between a
login and the first ``SessionExpired`` measures the real eClass session
lifetime (an open question in HANDOFF.md).
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

DEFAULT_SNAPSHOT_DIR = Path("snapshots")


class SnapshotStore:
    """Reads and writes per-course grade snapshots."""

    def __init__(self, directory: Path | str = DEFAULT_SNAPSHOT_DIR) -> None:
        self.directory = Path(directory)

    def _path(self, course_id: int) -> Path:
        return self.directory / f"grades-{course_id}.json"

    def load(self, course_id: int) -> Optional[dict[str, Any]]:
        """The last saved snapshot for a course, or None on first run."""
        path = self._path(course_id)
        try:
            with path.open() as fh:
                return json.load(fh)
        except FileNotFoundError:
            return None
        except (OSError, ValueError) as exc:
            # A corrupt snapshot becomes a fresh baseline, not a crash.
            logger.warning("Ignoring unreadable snapshot %s: %s", path, exc)
            return None

    def save(
        self, course_id: int, course_name: str, report: dict[str, Any]
    ) -> None:
        """Persist a fresh snapshot (atomically, via a temp file)."""
        self.directory.mkdir(parents=True, exist_ok=True)
        path = self._path(course_id)
        payload = {
            "course_id": course_id,
            "course_name": course_name,
            "fetched_at": datetime.now().isoformat(timespec="seconds"),
            "report": report,
        }
        tmp = path.with_suffix(".json.tmp")
        with tmp.open("w") as fh:
            json.dump(payload, fh, indent=2)
        tmp.replace(path)

    def list_snapshots(self) -> list[dict[str, Any]]:
        """All stored snapshots' metadata (without the report bodies)."""
        if not self.directory.is_dir():
            return []
        results = []
        for path in sorted(self.directory.glob("grades-*.json")):
            try:
                with path.open() as fh:
                    data = json.load(fh)
            except (OSError, ValueError):
                continue
            results.append(
                {
                    "course_id": data.get("course_id"),
                    "course_name": data.get("course_name"),
                    "fetched_at": data.get("fetched_at"),
                    "items": len(data.get("report", {}).get("items", [])),
                }
            )
        return results

    def log_run(self, summary: str) -> None:
        """Append one line to runs.log."""
        self.directory.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().isoformat(timespec="seconds")
        with (self.directory / "runs.log").open("a") as fh:
            fh.write(f"{stamp} {summary}\n")

    def read_run_log(self, tail: int = 10) -> list[str]:
        """The last ``tail`` lines of runs.log."""
        try:
            lines = (self.directory / "runs.log").read_text().splitlines()
        except FileNotFoundError:
            return []
        return lines[-tail:]
