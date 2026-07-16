"""Send a push notification via ntfy. Shared by the deterministic reminders
loop and the proactive-AI notifications loop. The topic name is the secret."""

from __future__ import annotations

import httpx


async def send(topic: str, server: str, title: str, message: str) -> None:
    """POST a notification to `{server}/{topic}`. Raises on HTTP error so the
    caller can decide whether to retry or just log."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{server.rstrip('/')}/{topic}",
            content=message.encode("utf-8"),
            headers={"Title": title},
        )
        resp.raise_for_status()
