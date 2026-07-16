"""Send a push notification via ntfy. Shared by the deterministic reminders
loop and the proactive-AI notifications loop. The topic name is the secret."""

from __future__ import annotations

import httpx


async def send(
    topic: str, server: str, title: str, message: str, *, tags: str | None = None
) -> None:
    """POST a notification to `{server}/{topic}`. Raises on HTTP error so the
    caller can decide whether to retry or just log.

    HTTP headers are latin-1 only, so `title` must stay ASCII — for an emoji use
    `tags` (an ntfy tag/emoji shortcode like "bulb"), which ntfy renders before
    the title. The message body is UTF-8 and may contain anything."""
    headers = {"Title": title}
    if tags:
        headers["Tags"] = tags
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{server.rstrip('/')}/{topic}",
            content=message.encode("utf-8"),
            headers=headers,
        )
        resp.raise_for_status()
