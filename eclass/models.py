"""Data models for the eClass client.

Plain dataclasses so the rest of the codebase passes around typed objects
instead of dicts. Models originating from AJAX responses get a
``from_api()`` classmethod that maps Moodle's JSON defensively (every
field via ``.get``), so schema drift degrades to ``None`` fields instead
of crashes. Every model has ``to_dict()`` for JSON export.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass
class Course:
    """A course the authenticated user is enrolled in."""

    id: int
    shortname: str
    fullname: str
    category: Optional[str] = None
    url: Optional[str] = None
    progress: Optional[int] = None  # percent complete, if Moodle reports it
    hidden: bool = False

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> "Course":
        """Build from ``core_course_get_enrolled_courses_*`` JSON."""
        return cls(
            id=int(raw["id"]),
            shortname=raw.get("shortname", ""),
            fullname=raw.get("fullname", ""),
            category=raw.get("coursecategory"),
            url=raw.get("viewurl"),
            progress=raw.get("progress"),
            hidden=bool(raw.get("hidden", False)),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def __str__(self) -> str:
        return f"[{self.id}] {self.fullname}"


@dataclass
class GradeItem:
    """A single row from the user grade report (parsed from HTML).

    All grade fields are kept as strings on purpose: Moodle renders things
    like "92.00", "A", "-", "18/20", or "Error" in these cells, so parsing
    them into floats eagerly loses information. Use :meth:`percentage_value`
    when you need a number.
    """

    name: str
    category: Optional[str] = None
    grade: Optional[str] = None
    grade_range: Optional[str] = None
    percentage: Optional[str] = None
    weight: Optional[str] = None
    feedback: Optional[str] = None
    contribution: Optional[str] = None
    is_total: bool = False

    def percentage_value(self) -> Optional[float]:
        """Return the percentage as a float (e.g. 92.5), or None."""
        if not self.percentage:
            return None
        text = self.percentage.replace("%", "").replace(",", "").strip()
        try:
            return float(text)
        except ValueError:
            return None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def __str__(self) -> str:
        grade = self.grade or "-"
        pct = f" ({self.percentage})" if self.percentage else ""
        return f"{self.name}: {grade}{pct}"


@dataclass
class GradeReport:
    """The full grade report for one course."""

    course_id: int
    items: list[GradeItem] = field(default_factory=list)

    @property
    def course_total(self) -> Optional[GradeItem]:
        """The final 'Course total' row, if present."""
        totals = [i for i in self.items if i.is_total]
        return totals[-1] if totals else None

    def to_dict(self) -> dict[str, Any]:
        return {
            "course_id": self.course_id,
            "items": [i.to_dict() for i in self.items],
        }


@dataclass
class TimelineEvent:
    """An upcoming action event from the dashboard timeline.

    Source: ``core_calendar_get_action_events_by_timesort``.
    """

    id: int
    name: str
    due: datetime
    module: Optional[str] = None          # e.g. "assign", "quiz", "forum"
    activity_name: Optional[str] = None   # e.g. "Homework 3"
    course_id: Optional[int] = None
    course_name: Optional[str] = None
    url: Optional[str] = None             # deep link to the activity
    overdue: bool = False

    @classmethod
    def from_api(cls, raw: dict[str, Any]) -> "TimelineEvent":
        course = raw.get("course") or {}
        action = raw.get("action") or {}
        timestamp = int(raw.get("timesort") or raw.get("timestart") or 0)
        return cls(
            id=int(raw["id"]),
            name=raw.get("name", ""),
            due=datetime.fromtimestamp(timestamp),
            module=raw.get("modulename"),
            activity_name=raw.get("activityname"),
            course_id=int(course["id"]) if course.get("id") is not None else None,
            course_name=course.get("fullname"),
            url=raw.get("url") or action.get("url"),
            overdue=bool(raw.get("overdue", False)),
        )

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["due"] = self.due.isoformat()
        return data

    def __str__(self) -> str:
        course = f" — {self.course_name}" if self.course_name else ""
        flag = " [OVERDUE]" if self.overdue else ""
        return f"{self.due:%a %b %d %I:%M %p}  {self.name}{course}{flag}"


@dataclass
class CalendarEvent:
    """A calendar event. Provisional model for the future ``get_calendar()``.

    Expected source: ``core_calendar_get_calendar_monthly_view`` or
    ``core_calendar_get_calendar_upcoming_view``.
    """

    id: int
    name: str
    start: datetime
    end: Optional[datetime] = None
    event_type: Optional[str] = None      # "course", "user", "site", ...
    course_id: Optional[int] = None
    course_name: Optional[str] = None
    location: Optional[str] = None
    url: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["start"] = self.start.isoformat()
        data["end"] = self.end.isoformat() if self.end else None
        return data


@dataclass
class Assignment:
    """An assignment. Provisional model for the future ``get_assignments()``.

    Likely source: ``mod_assign_get_assignments`` if it is AJAX-allowed on
    this Moodle instance; otherwise assignments can be derived from
    timeline events with ``module == "assign"``.
    """

    id: int
    name: str
    course_id: int
    due: Optional[datetime] = None
    cutoff: Optional[datetime] = None
    intro: Optional[str] = None
    url: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["due"] = self.due.isoformat() if self.due else None
        data["cutoff"] = self.cutoff.isoformat() if self.cutoff else None
        return data
