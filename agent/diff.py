"""Diffing two grade-report snapshots into human-readable change events.

Works on ``GradeReport.to_dict()`` dictionaries (the shape stored in the
snapshot files), so old snapshots loaded from JSON and fresh reports from
the client compare without any round-tripping through models.

What counts as a change:

* an item that previously had no grade now has one          → ``graded``
* an item's grade or percentage moved                        → ``changed``
* an item gained or changed feedback                         → ``feedback``
* an item appears for the first time *with* a grade          → ``graded``

New items without a grade (instructors adding future assignments) and
items that disappear are deliberately ignored — they're noise, not news.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

# Renderings Moodle uses for "no grade yet".
_EMPTY_GRADES = {None, "", "-", "–", "—"}


@dataclass
class GradeChange:
    """One noteworthy difference between two snapshots of a course."""

    kind: str                       # "graded" | "changed" | "feedback"
    item_name: str
    category: Optional[str] = None
    old: Optional[str] = None
    new: Optional[str] = None
    is_total: bool = False

    def __str__(self) -> str:
        name = f"{self.item_name}"
        if self.kind == "graded":
            return f"{name}: graded {self.new}"
        if self.kind == "changed":
            return f"{name}: {self.old} → {self.new}"
        return f"{name}: new feedback"


def _display_grade(item: dict[str, Any]) -> Optional[str]:
    """The grade as a human would report it: '18/20 (90%)' or '92.00'."""
    grade = item.get("grade")
    pct = item.get("percentage")
    if grade in _EMPTY_GRADES:
        return None
    if pct and pct != grade:
        return f"{grade} ({pct})"
    return str(grade)


def _key_items(items: list[dict[str, Any]]) -> dict[tuple, dict[str, Any]]:
    """Index items by (category, name, duplicate-count) for stable pairing."""
    seen: dict[tuple, int] = {}
    keyed: dict[tuple, dict[str, Any]] = {}
    for item in items:
        base = (item.get("category"), item.get("name"), item.get("is_total"))
        n = seen.get(base, 0)
        seen[base] = n + 1
        keyed[base + (n,)] = item
    return keyed


def diff_reports(
    old: dict[str, Any], new: dict[str, Any]
) -> list[GradeChange]:
    """Compare two ``GradeReport.to_dict()`` payloads."""
    old_items = _key_items(old.get("items", []))
    new_items = _key_items(new.get("items", []))
    changes: list[GradeChange] = []

    for key, item in new_items.items():
        previous = old_items.get(key)
        name = item.get("name", "?")
        category = item.get("category")
        is_total = bool(item.get("is_total"))
        grade = _display_grade(item)

        if previous is None:
            if grade is not None:
                changes.append(
                    GradeChange("graded", name, category, None, grade, is_total)
                )
            continue

        old_grade = _display_grade(previous)
        if grade != old_grade:
            kind = "graded" if old_grade is None else "changed"
            changes.append(
                GradeChange(kind, name, category, old_grade, grade, is_total)
            )

        old_feedback = previous.get("feedback") or None
        new_feedback = item.get("feedback") or None
        if new_feedback and new_feedback != old_feedback:
            changes.append(
                GradeChange(
                    "feedback", name, category, old_feedback, new_feedback, is_total
                )
            )

    return changes
