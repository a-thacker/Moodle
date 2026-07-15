"""Current weather for the hero tile, via Open-Meteo (free, no API key).

Fetched on demand and cached in-process for ~15 minutes so the dashboard can
poll cheaply. Failures return a graceful "unavailable" payload rather than
raising — the hero just keeps showing the label without a temperature.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_CACHE_TTL = 15 * 60  # seconds
_cache: dict[str, Any] = {}
_cache_at: float = 0.0

# WMO weather codes → (short text, Phosphor icon name). Grouped sensibly.
_WMO: dict[int, tuple[str, str]] = {
    0: ("Clear", "ph-sun"),
    1: ("Mostly clear", "ph-sun"),
    2: ("Partly cloudy", "ph-cloud-sun"),
    3: ("Overcast", "ph-cloud"),
    45: ("Fog", "ph-cloud-fog"),
    48: ("Rime fog", "ph-cloud-fog"),
    51: ("Light drizzle", "ph-cloud-rain"),
    53: ("Drizzle", "ph-cloud-rain"),
    55: ("Heavy drizzle", "ph-cloud-rain"),
    56: ("Freezing drizzle", "ph-cloud-snow"),
    57: ("Freezing drizzle", "ph-cloud-snow"),
    61: ("Light rain", "ph-cloud-rain"),
    63: ("Rain", "ph-cloud-rain"),
    65: ("Heavy rain", "ph-cloud-rain"),
    66: ("Freezing rain", "ph-cloud-snow"),
    67: ("Freezing rain", "ph-cloud-snow"),
    71: ("Light snow", "ph-cloud-snow"),
    73: ("Snow", "ph-cloud-snow"),
    75: ("Heavy snow", "ph-cloud-snow"),
    77: ("Snow grains", "ph-cloud-snow"),
    80: ("Rain showers", "ph-cloud-rain"),
    81: ("Rain showers", "ph-cloud-rain"),
    82: ("Heavy showers", "ph-cloud-rain"),
    85: ("Snow showers", "ph-cloud-snow"),
    86: ("Snow showers", "ph-cloud-snow"),
    95: ("Thunderstorm", "ph-cloud-lightning"),
    96: ("Thunderstorm", "ph-cloud-lightning"),
    99: ("Thunderstorm", "ph-cloud-lightning"),
}


def _describe(code: int) -> tuple[str, str]:
    return _WMO.get(code, ("—", "ph-cloud"))


async def get_weather() -> dict[str, Any]:
    """Current conditions for the configured location (cached ~15 min)."""
    global _cache, _cache_at
    now = time.monotonic()
    if _cache and (now - _cache_at) < _CACHE_TTL:
        return _cache

    settings = get_settings()
    params = {
        "latitude": settings.weather_latitude,
        "longitude": settings.weather_longitude,
        "current": "temperature_2m,weather_code,is_day,apparent_temperature",
        "daily": "temperature_2m_max,temperature_2m_min",
        "temperature_unit": "fahrenheit",
        "timezone": settings.timezone,
        "forecast_days": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get("https://api.open-meteo.com/v1/forecast", params=params)
            resp.raise_for_status()
            data = resp.json()
        cur = data["current"]
        daily = data["daily"]
        text, icon = _describe(int(cur["weather_code"]))
        _cache = {
            "available": True,
            "label": settings.weather_label,
            "temp": round(cur["temperature_2m"]),
            "feelsLike": round(cur.get("apparent_temperature", cur["temperature_2m"])),
            "high": round(daily["temperature_2m_max"][0]),
            "low": round(daily["temperature_2m_min"][0]),
            "text": text,
            "icon": icon,
            "isDay": bool(cur.get("is_day", 1)),
        }
        _cache_at = now
        return _cache
    except (httpx.HTTPError, KeyError, ValueError, IndexError) as exc:
        logger.warning("Weather fetch failed: %s", exc)
        return {"available": False, "label": settings.weather_label}
