"""Refresh the Claude usage tile from the host Claude bridge.

The server's own Claude (via the bridge's `/usage` endpoint) reports the real
account-wide session/weekly limits. We pull them on the notification loop so the
dashboard tile stays current without depending on the Mac. Only the `limits`
block is updated; any other keys already on the row are preserved.
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings
from app.models.usage import ClaudeUsage
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def refresh_from_bridge(session: AsyncSession) -> bool:
    """Fetch limits from the Claude bridge and store them. Returns True on a
    successful update. No-op (False) if the bridge is unset/unreachable."""
    url = get_settings().claude_bridge_url
    if not url:
        return False
    try:
        async with httpx.AsyncClient(timeout=100) as client:
            resp = await client.get(f"{url.rstrip('/')}/usage")
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.info("Usage refresh failed: %s", exc)
        return False
    if not data.get("available") or not data.get("limits"):
        return False

    row = await session.get(ClaudeUsage, 1)
    merged = {
        **(row.data if row and row.data else {}),
        "limits": data["limits"],
        "fetchedAt": data.get("fetchedAt"),
    }
    if row is None:
        session.add(ClaudeUsage(id=1, data=merged))
    else:
        row.data = merged
    await session.commit()
    logger.info("Usage refreshed from bridge: %s", data["limits"])
    return True
