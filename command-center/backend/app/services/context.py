"""Builds the assistant's situational context — a compact snapshot of the
user's Command Center (date, weather, tasks, deadlines, grades, grocery) that
is injected into every prompt so the model can answer about *their* data.
"""

from __future__ import annotations

import logging
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.user import User
from app.services import eclass as eclass_service
from app.services import grocery as grocery_service
from app.services import task as task_service

logger = logging.getLogger(__name__)

# Collegedale, TN
_LAT, _LON, _PLACE = 35.05, -85.05, "Collegedale, TN"

_WEATHER_CODES = {
    0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "fog", 51: "light drizzle", 53: "drizzle", 55: "drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain", 71: "light snow",
    73: "snow", 75: "heavy snow", 80: "rain showers", 81: "rain showers",
    82: "heavy showers", 95: "thunderstorm", 96: "thunderstorm", 99: "thunderstorm",
}


async def current_weather() -> str | None:
    """Live weather from Open-Meteo (no API key). None if unreachable."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": _LAT, "longitude": _LON,
                    "current": "temperature_2m,weather_code",
                    "temperature_unit": "fahrenheit", "timezone": "auto",
                },
            )
            resp.raise_for_status()
            cur = resp.json().get("current", {})
        temp = cur.get("temperature_2m")
        if temp is None:
            return None
        desc = _WEATHER_CODES.get(cur.get("weather_code"), "")
        return f"{round(temp)}°F, {desc}".strip(", ")
    except (httpx.HTTPError, ValueError) as exc:
        logger.info("Weather unavailable: %s", exc)
        return None


async def build_user_context(session: AsyncSession, user: User) -> str:
    now = datetime.now(ZoneInfo(get_settings().timezone))
    lines = [
        f"Current date/time: {now:%A, %B %d, %Y, %-I:%M %p}.",
        f"User: {user.display_name} ({user.role}). Location: {_PLACE}.",
    ]

    weather = await current_weather()
    if weather:
        lines.append(f"Weather now: {weather}.")

    tasks = [t for t in await task_service.list_tasks(session, user.id) if not t.done]
    if tasks:
        lines.append(f"Open tasks ({len(tasks)}):")
        for t in tasks[:25]:
            due = f" — due {t.due_date:%b %d}" if t.due_date else ""
            lines.append(f"  - {t.title}{due}")
    else:
        lines.append("Open tasks: none.")

    if user.role == "owner":
        deadlines = await eclass_service.list_deadlines(session)
        if deadlines:
            lines.append("Upcoming eClass deadlines:")
            for d in deadlines[:10]:
                lines.append(f"  - {d.title} ({d.course_name}) — due {d.due:%b %d}")

        courses = await eclass_service.list_courses(session)
        if courses:
            lines.append("Courses / current grade:")
            for c in courses:
                pct = f"{c.total_percent}%" if c.total_percent is not None else "n/a"
                lines.append(f"  - {c.full_name}: {pct}")

    grocery = [g for g in await grocery_service.list_items(session) if not g.done]
    if grocery:
        names = ", ".join(g.name for g in grocery[:25])
        lines.append(f"Grocery to buy: {names}.")

    return "\n".join(lines)
