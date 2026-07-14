"""Assistant chat via Ollama, made system-aware.

Each turn injects the user's live Command Center context (date, weather,
tasks, deadlines, grades, grocery) as the system prompt, and replays recent
conversation history so the assistant has persistent memory. Degrades
gracefully when no model is configured.
"""

from __future__ import annotations

import logging
import re
from datetime import date

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.chat import ChatMessage
from app.models.user import User
from app.schemas.task import TaskCreate
from app.services import task as task_service
from app.services.context import build_user_context

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are the assistant built into Alden's personal Command Center — a "
    "self-hosted dashboard for school and daily life. Be concise, direct, and "
    "practical. Use the user's data below to answer specifically; if something "
    "isn't in the data, say so rather than inventing it.\n\n"
    "You can add tasks to the user's list. ONLY when the user asks you to "
    "add/create/remind or schedule something, put each task on its own line "
    "at the very end of your reply in EXACTLY this format:\n"
    "ADD_TASK: <title> [@ YYYY-MM-DD]\n"
    "The date is optional. Do not use this format for anything else, and do "
    "not mention the format to the user."
)
_HISTORY_LIMIT = 12
_ADD_TASK_RE = re.compile(r"^\s*ADD_TASK:\s*(.+?)\s*$", re.IGNORECASE)
_DATE_RE = re.compile(r"@\s*(\d{4}-\d{2}-\d{2})\s*$")


async def _apply_actions(session: AsyncSession, user: User, reply: str) -> str:
    """Extract ADD_TASK directives, create the tasks, and replace the lines
    with a short confirmation so the user never sees the raw directives."""
    kept: list[str] = []
    created: list[str] = []
    for line in reply.splitlines():
        m = _ADD_TASK_RE.match(line)
        if not m:
            kept.append(line)
            continue
        rest = m.group(1).strip()
        due = None
        dm = _DATE_RE.search(rest)
        if dm:
            try:
                due = date.fromisoformat(dm.group(1))
                rest = rest[: dm.start()]
            except ValueError:
                due = None
        # Trim trailing separators the model may have used before the date.
        rest = rest.rstrip(" -—–|@·:").strip()
        if rest:
            await task_service.create_task(session, user.id, TaskCreate(title=rest, due_date=due))
            created.append(rest + (f" (due {due:%b %d})" if due else ""))

    out = "\n".join(kept).strip()
    if created:
        out += ("\n\n" if out else "") + "✓ Added to your tasks: " + "; ".join(created)
    return out


async def _load_history(session: AsyncSession, user_id) -> list[ChatMessage]:
    result = await session.execute(
        select(ChatMessage)
        .where(ChatMessage.user_id == user_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(_HISTORY_LIMIT)
    )
    return list(reversed(result.scalars().all()))


async def clear_history(session: AsyncSession, user_id) -> None:
    await session.execute(delete(ChatMessage).where(ChatMessage.user_id == user_id))
    await session.commit()


async def chat(session: AsyncSession, user: User, message: str) -> dict:
    settings = get_settings()
    if not settings.ollama_model:
        return {
            "reply": (
                "The assistant isn't available yet — no local model is loaded. "
                "Pull one (e.g. `ollama pull gemma3:4b`) and set OLLAMA_MODEL."
            ),
            "available": False,
        }

    context = await build_user_context(session, user)
    history = await _load_history(session, user.id)
    messages = [{"role": "system", "content": f"{_SYSTEM}\n\n--- LIVE CONTEXT ---\n{context}"}]
    messages += [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": message})

    try:
        async with httpx.AsyncClient(timeout=180) as client:
            resp = await client.post(
                f"{settings.ollama_url}/api/chat",
                json={"model": settings.ollama_model, "messages": messages, "stream": False},
            )
            resp.raise_for_status()
            reply = (resp.json().get("message", {}).get("content") or "").strip()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Assistant call failed: %s", exc)
        return {"reply": f"Assistant is unreachable right now ({exc}).", "available": False}

    reply = reply or "(no response)"
    reply = await _apply_actions(session, user, reply)
    session.add(ChatMessage(user_id=user.id, role="user", content=message))
    session.add(ChatMessage(user_id=user.id, role="assistant", content=reply))
    await session.commit()
    return {"reply": reply, "available": True}
