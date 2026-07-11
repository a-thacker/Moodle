"""HTML parsing for eClass (Moodle) pages.

Design notes on resilience
--------------------------
Moodle's markup shifts between versions and themes, so this parser avoids
hard-coding a single selector or column order:

* The grade table is located by its well-known class (``table.user-grade``)
  with a fallback that scans all tables for grade-report-looking headers.
* Cells are resolved *by CSS class* (``column-grade`` etc.) first, and by
  header-text position second, so either the classes or the column order
  can change without breaking everything.
* Category rows are detected by class, not position.

If parsing ever fails, save the raw HTML (``client.get_page(...)``) and
inspect it — usually only a selector or header alias needs updating.
"""

from __future__ import annotations

import re
from typing import Optional

from bs4 import BeautifulSoup, Tag

from .models import GradeItem


class ParseError(RuntimeError):
    """Raised when an expected structure can't be found in the HTML."""


# --------------------------------------------------------------------------
# Small page-level extractors
# --------------------------------------------------------------------------

_SESSKEY_PATTERNS = [
    re.compile(r'"sesskey"\s*:\s*"([A-Za-z0-9]+)"'),
    re.compile(r'sesskey=([A-Za-z0-9]{8,})'),
]

_USERID_PATTERNS = [
    re.compile(r'data-userid="(\d+)"'),
    re.compile(r'"userid"\s*:\s*(\d+)'),
    re.compile(r'/user/profile\.php\?id=(\d+)'),
]


def parse_sesskey(html: str) -> str:
    """Extract the Moodle sesskey from any authenticated page."""
    for pattern in _SESSKEY_PATTERNS:
        match = pattern.search(html)
        if match:
            return match.group(1)
    raise ParseError("Could not find sesskey — is the session authenticated?")


def parse_userid(html: str) -> int:
    """Extract the logged-in user's id from an authenticated page."""
    for pattern in _USERID_PATTERNS:
        match = pattern.search(html)
        if match:
            return int(match.group(1))
    raise ParseError("Could not find the logged-in user's id in the page.")


# --------------------------------------------------------------------------
# Grade report parsing
# --------------------------------------------------------------------------

# Maps our field names -> (Moodle cell-class suffix, header text aliases).
_COLUMNS: dict[str, tuple[str, tuple[str, ...]]] = {
    "name": ("itemname", ("grade item", "item", "name")),
    "weight": ("weight", ("calculated weight", "weight")),
    "grade": ("grade", ("grade",)),
    "grade_range": ("range", ("range",)),
    "percentage": ("percentage", ("percentage",)),
    "feedback": ("feedback", ("feedback",)),
    "contribution": ("contributiontocoursetotal", ("contribution to course total", "contribution")),
}


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _find_grade_table(soup: BeautifulSoup) -> Optional[Tag]:
    table = soup.select_one("table.user-grade")
    if table is not None:
        return table
    # Fallback: look for a table whose headers resemble a grade report.
    for candidate in soup.find_all("table"):
        headers = " | ".join(
            _clean(th.get_text(" ", strip=True)).lower()
            for th in candidate.find_all("th")
        )
        if "grade item" in headers or ("grade" in headers and "percentage" in headers):
            return candidate
    return None


def _header_positions(table: Tag) -> dict[str, int]:
    """Map our field names to logical column indices using header text."""
    header_row = None
    thead = table.find("thead")
    if thead is not None:
        header_row = thead.find("tr")
    if header_row is None:
        header_row = table.find("tr")
    if header_row is None:
        return {}

    # Collect (header text, logical index) pairs first.
    headers: list[tuple[str, int]] = []
    index = 0
    for cell in header_row.find_all(["th", "td"]):
        headers.append((_clean(cell.get_text(" ", strip=True)).lower(), index))
        index += int(cell.get("colspan") or 1)

    positions: dict[str, int] = {}
    claimed: set[int] = set()

    def match(predicate) -> None:
        for fieldname, (_cls, aliases) in _COLUMNS.items():
            if fieldname in positions:
                continue
            for text, idx in headers:
                if idx not in claimed and any(predicate(text, a) for a in aliases):
                    positions[fieldname] = idx
                    claimed.add(idx)
                    break

    # Exact matches first ("grade" must not claim the "grade item" column),
    # then prefix matches for headers with extra decoration.
    match(lambda text, alias: text == alias)
    match(lambda text, alias: text.startswith(alias))
    return positions


def _cells_by_position(row: Tag) -> dict[int, str]:
    """Return {logical column index: text}, accounting for colspans."""
    result: dict[int, str] = {}
    index = 0
    for cell in row.find_all(["th", "td"]):
        result[index] = _clean(cell.get_text(" ", strip=True))
        index += int(cell.get("colspan") or 1)
    return result


def _cell_by_class(row: Tag, class_suffix: str) -> Optional[str]:
    cell = row.select_one(f'[class*="column-{class_suffix}"]')
    if cell is None:
        return None
    return _clean(cell.get_text(" ", strip=True))


def _row_classes(row: Tag) -> str:
    classes = list(row.get("class") or [])
    for cell in row.find_all(["th", "td"], recursive=False):
        classes.extend(cell.get("class") or [])
    return " ".join(classes)


def parse_grade_report(html: str) -> list[GradeItem]:
    """Parse a Moodle user grade report page into GradeItem objects.

    Works for both ``/course/user.php?mode=grade&id=...&user=...`` and
    ``/grade/report/user/index.php?id=...`` — they render the same table.
    """
    soup = BeautifulSoup(html, "html.parser")
    table = _find_grade_table(soup)
    if table is None:
        raise ParseError(
            "No grade table found. The session may have expired, you may "
            "lack access to this course, or the page structure changed."
        )

    positions = _header_positions(table)

    body = table.find("tbody") or table
    rows = body.find_all("tr")

    items: list[GradeItem] = []
    current_category: Optional[str] = None

    for row in rows:
        cells = row.find_all(["th", "td"])
        if not cells:
            continue

        classes = _row_classes(row)

        # Category rows introduce a grouping (e.g. "Homework", "Exams").
        if "category" in classes:
            category_text = _clean(cells[0].get_text(" ", strip=True))
            if category_text:
                current_category = category_text
            continue

        # Resolve each field: by cell class first, by header position second.
        by_position = _cells_by_position(row)

        def field(fieldname: str) -> Optional[str]:
            class_suffix, _aliases = _COLUMNS[fieldname]
            value = _cell_by_class(row, class_suffix)
            if value is None and fieldname in positions:
                value = by_position.get(positions[fieldname])
            if value in ("", "-", "\u00a0"):
                return None
            return value

        name = field("name")
        if not name:
            continue  # spacer / fill rows

        # Total rows: "Category total" / "Course total" text, or Moodle's
        # aggregation cell classes (baggt/baggb) on older themes.
        is_total = "total" in name.lower() or "baggt" in classes or "baggb" in classes

        items.append(
            GradeItem(
                name=name,
                category=current_category,
                grade=field("grade"),
                grade_range=field("grade_range"),
                percentage=field("percentage"),
                weight=field("weight"),
                feedback=field("feedback"),
                contribution=field("contribution"),
                is_total=is_total,
            )
        )

    if not items:
        raise ParseError("Grade table was found but no grade rows were parsed.")
    return items
