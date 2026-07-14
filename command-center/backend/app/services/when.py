"""Resolve natural-language dates and times out of a task title.

Server-side so it works no matter how capable the model is: "meeting with
Andrew next tuesday -2pm" → title "meeting with Andrew", date=<next Tue>,
time=14:00. The frontend does the same for the quick-add boxes.
"""

from __future__ import annotations

import re
from datetime import date, datetime, time, timedelta

_WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
    "mon": 0, "tue": 1, "tues": 1, "wed": 2, "thu": 3, "thur": 3,
    "thurs": 3, "fri": 4, "sat": 5, "sun": 6,
}

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
_MONTH_NAMES = (
    "january|february|march|april|may|june|july|august|september|october|"
    "november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec"
)
# "July 21", "Jul 21 2026", "July 21, 2026"
_MONTH_DATE = re.compile(
    r"\b(" + _MONTH_NAMES + r")\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b",
    re.IGNORECASE,
)

_TIME_12 = re.compile(r"(?:^|[\s@\-])(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", re.IGNORECASE)
_TIME_24 = re.compile(r"(?:^|[\s@\-])(\d{1,2}):(\d{2})\b")
_ISO = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
_IN_N_DAYS = re.compile(r"\bin\s+(\d{1,2})\s+days?\b", re.IGNORECASE)
_NEXT_WD = re.compile(r"\b(next\s+)?(" + "|".join(_WEEKDAYS) + r")\b", re.IGNORECASE)
_REL = re.compile(r"\b(today|tomorrow|tonight)\b", re.IGNORECASE)


def _resolve_time(text: str) -> tuple[str, time | None]:
    m = _TIME_12.search(text)
    if m:
        hour = int(m.group(1)) % 12
        if m.group(3).lower() == "pm":
            hour += 12
        minute = int(m.group(2) or 0)
        return text[: m.start()] + text[m.end():], time(hour % 24, minute)
    m = _TIME_24.search(text)
    if m:
        hour, minute = int(m.group(1)), int(m.group(2))
        if 0 <= hour < 24 and 0 <= minute < 60:
            return text[: m.start()] + text[m.end():], time(hour, minute)
    return text, None


def _resolve_date(text: str, today: date) -> tuple[str, date | None]:
    m = _ISO.search(text)
    if m:
        try:
            return text[: m.start()] + text[m.end():], date.fromisoformat(m.group(1))
        except ValueError:
            pass
    m = _MONTH_DATE.search(text)
    if m:
        mon = _MONTHS[m.group(1).lower()[:3]]
        day = int(m.group(2))
        year = int(m.group(3)) if m.group(3) else today.year
        try:
            d = date(year, mon, day)
            if not m.group(3) and d < today:  # no year given and already past → next year
                d = date(year + 1, mon, day)
            return text[: m.start()] + text[m.end():], d
        except ValueError:
            pass
    m = _IN_N_DAYS.search(text)
    if m:
        return text[: m.start()] + text[m.end():], today + timedelta(days=int(m.group(1)))
    m = _REL.search(text)
    if m:
        word = m.group(1).lower()
        d = today if word in ("today", "tonight") else today + timedelta(days=1)
        return text[: m.start()] + text[m.end():], d
    m = _NEXT_WD.search(text)
    if m:
        target = _WEEKDAYS[m.group(2).lower()]
        delta = (target - today.weekday()) % 7
        if delta == 0:
            delta = 7  # "tuesday" when today is tuesday → the coming one
        if m.group(1):  # "next"
            delta += 7
        return text[: m.start()] + text[m.end():], today + timedelta(days=delta)
    return text, None


def parse_when(text: str, today: date | None = None) -> tuple[str, date | None, time | None]:
    today = today or datetime.now().date()
    text, t = _resolve_time(text)
    text, d = _resolve_date(text, today)
    # Tidy leftover filler / weekday words / punctuation left by a resolved date.
    text = re.sub(r"\b(on|at|for|by|this|next)\b", " ", text, flags=re.IGNORECASE)
    if d is not None:
        text = re.sub(r"\b(" + "|".join(_WEEKDAYS) + r")\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"[,;]", " ", text)
    text = re.sub(r"\s{2,}", " ", text).strip(" -—–|@·:,").strip()
    return text, d, t
