"""Data models for the eClass client.

Plain dataclasses so the rest of the codebase passes around typed objects
instead of dicts. Every model has a ``to_dict()`` for easy JSON export.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
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

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def __str__(self) -> str:
        return f"[{self.id}] {self.fullname}"


@dataclass
class GradeItem:
    """A single row from the user grade report.

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
