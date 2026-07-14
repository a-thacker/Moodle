"""Assistant chat via Ollama.

Talks to the local Ollama engine. Degrades gracefully: until a model is
pulled on the server and OLLAMA_MODEL is set, this returns a friendly
"unavailable" reply instead of erroring, so the omni-bar's AI mode is ready
the moment a model exists.
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are the assistant inside Alden's personal Command Center. Be concise "
    "and practical. You help with school, tasks, and planning."
)


async def chat(message: str) -> dict:
    settings = get_settings()
    if not settings.ollama_model:
        return {
            "reply": (
                "The assistant isn't available yet — no local model is loaded. "
                "Pull one on the server (e.g. `ollama pull llama3.2:3b`) and set "
                "OLLAMA_MODEL in the backend env."
            ),
            "available": False,
        }
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{settings.ollama_url}/api/generate",
                json={
                    "model": settings.ollama_model,
                    "system": _SYSTEM,
                    "prompt": message,
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        return {"reply": (data.get("response") or "").strip() or "(no response)", "available": True}
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Assistant call failed: %s", exc)
        return {"reply": f"Assistant is unreachable right now ({exc}).", "available": False}
