"""Assistant chat — system-aware, with persistent memory and task actions.

Two providers: Anthropic (Claude, when ANTHROPIC_API_KEY is set — fast and
capable) or local Ollama (free, slower on CPU). Each turn injects the user's
live Command Center context as the system prompt and replays recent history.
The model can act on data via ADD_TASK directives, which the backend executes.
"""

from __future__ import annotations

import logging
import re
from datetime import date, timedelta

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
    "practical. Use the LIVE CONTEXT below to answer specifically; if something "
    "isn't there, say so rather than inventing it.\n\n"
    "ADDING TASKS: When (and only when) the user in their most recent message "
    "asks you to add/create/schedule/remind them of something, put each new "
    "task on its own line at the very end of your reply, EXACTLY:\n"
    "  ADD_TASK: <title> @ YYYY-MM-DD   (for a specific day)\n"
    "  ADD_TASK: <title> @ every        (to add it to every day this week)\n"
    "  ADD_TASK: <title>                (no date)\n"
    "Rules: only add what THIS message asks for. NEVER re-add tasks from "
    "earlier in the conversation or from the context. Don't mention this format."
)
_HISTORY_LIMIT = 12
# Match a directive anywhere (models don't reliably put it on its own line).
_ADD_TASK_RE = re.compile(r"ADD_TASK:\s*([^\n]+)", re.IGNORECASE)
_DATE_RE = re.compile(r"@\s*(\d{4}-\d{2}-\d{2})\s*$")
_EVERY_RE = re.compile(r"@\s*every\s*$", re.IGNORECASE)
_TRAILING_AT_RE = re.compile(r"@\s*\S[^\n]*$")  # strip a leftover "@ Jul 15"


async def _load_history(session: AsyncSession, user_id) -> list[ChatMessage]:
    result = await session.execute(
        select(ChatMessage).where(ChatMessage.user_id == user_id)
        .order_by(ChatMessage.created_at.desc()).limit(_HISTORY_LIMIT)
    )
    return list(reversed(result.scalars().all()))


async def clear_history(session: AsyncSession, user_id) -> None:
    await session.execute(delete(ChatMessage).where(ChatMessage.user_id == user_id))
    await session.commit()


async def list_history(session: AsyncSession, user_id) -> list[ChatMessage]:
    result = await session.execute(
        select(ChatMessage).where(ChatMessage.user_id == user_id)
        .order_by(ChatMessage.created_at.asc()).limit(200)
    )
    return list(result.scalars().all())


def _week_days() -> list[date]:
    today = date.today()
    sunday = today - timedelta(days=(today.weekday() + 1) % 7)
    return [sunday + timedelta(days=i) for i in range(7)]


async def _apply_actions(session: AsyncSession, user: User, reply: str) -> str:
    """Extract ADD_TASK directives (wherever they appear), create the task(s),
    and strip the directives so the user never sees them. Skips tasks that
    already exist, to avoid the model re-adding things from context/history."""
    existing = {
        t.title.strip().lower()
        for t in await task_service.list_tasks(session, user.id)
        if not t.done
    }
    created: list[str] = []
    for m in _ADD_TASK_RE.finditer(reply):
        rest = m.group(1).strip()
        days: list[date | None] = [None]
        dm = _DATE_RE.search(rest)
        if dm:
            try:
                days = [date.fromisoformat(dm.group(1))]
                rest = rest[: dm.start()]
            except ValueError:
                pass
        elif _EVERY_RE.search(rest):
            days = list(_week_days())
            rest = _EVERY_RE.sub("", rest)
        rest = _TRAILING_AT_RE.sub("", rest).rstrip(" -—–|@·:").strip()
        if not rest or rest.lower() in existing:
            continue  # empty, or already on the list — don't duplicate
        for due in days:
            await task_service.create_task(session, user.id, TaskCreate(title=rest, due_date=due))
        created.append(rest + (" (every day this week)" if len(days) > 1 else (f" (due {days[0]:%b %d})" if days[0] else "")))

    out = _ADD_TASK_RE.sub("", reply).strip()
    if created:
        out += ("\n\n" if out else "") + "✓ Added to your tasks: " + "; ".join(created)
    return out


async def _call_anthropic(system: str, messages: list[dict], key: str, model: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
            json={"model": model, "max_tokens": 1024, "system": system, "messages": messages},
        )
        resp.raise_for_status()
        data = resp.json()
    return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()


async def _call_ollama(system: str, messages: list[dict], url: str, model: str) -> str:
    async with httpx.AsyncClient(timeout=180) as client:
        resp = await client.post(
            f"{url}/api/chat",
            json={"model": model, "messages": [{"role": "system", "content": system}, *messages], "stream": False},
        )
        resp.raise_for_status()
        data = resp.json()
    return (data.get("message", {}).get("content") or "").strip()


async def chat(session: AsyncSession, user: User, message: str) -> dict:
    settings = get_settings()
    if not settings.anthropic_api_key and not settings.ollama_model:
        return {
            "reply": "The assistant isn't configured yet — set ANTHROPIC_API_KEY (Claude) or OLLAMA_MODEL (local).",
            "available": False,
        }

    system = f"{_SYSTEM}\n\n--- LIVE CONTEXT ---\n{await build_user_context(session, user)}"
    history = await _load_history(session, user.id)
    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": message})

    try:
        if settings.anthropic_api_key:
            reply = await _call_anthropic(system, messages, settings.anthropic_api_key, settings.anthropic_model)
        else:
            reply = await _call_ollama(system, messages, settings.ollama_url, settings.ollama_model)
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Assistant call failed: %s", exc)
        return {"reply": f"Assistant is unreachable right now ({exc}).", "available": False}

    reply = await _apply_actions(session, user, reply or "(no response)")
    session.add(ChatMessage(user_id=user.id, role="user", content=message))
    session.add(ChatMessage(user_id=user.id, role="assistant", content=reply))
    await session.commit()
    return {"reply": reply, "available": True}
