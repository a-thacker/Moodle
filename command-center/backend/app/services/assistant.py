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
from app.services.when import parse_when

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are the assistant built into Alden's personal Command Center — a "
    "self-hosted dashboard for school and daily life. Be concise, direct, and "
    "practical. Use the LIVE CONTEXT below to answer specifically; if something "
    "isn't there, say so rather than inventing it.\n\n"
    "ADDING TASKS: When (and only when) the user in their most recent message "
    "asks you to add/create/schedule/remind them of something, add a line at "
    "the end of your reply for each task, EXACTLY:\n"
    "  ADD_TASK: <title> <when>\n"
    "where <when> is optional and may be natural language — e.g. 'tomorrow', "
    "'next tuesday 2pm', 'friday -3pm', '2026-08-01', or 'every' (= every day "
    "this week). The system resolves the date/time and cleans the title, so "
    "keep the whole request on one ADD_TASK line.\n"
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
        every = bool(_EVERY_RE.search(rest))
        if every:
            rest = _EVERY_RE.sub("", rest)
        # Resolve natural-language date/time ("next tuesday -2pm", ...).
        title, due, tm = parse_when(rest)
        title = _TRAILING_AT_RE.sub("", title).rstrip(" -—–|@·:").strip()
        if not title or title.lower() in existing:
            continue  # empty, or already on the list — don't duplicate
        days: list[date | None] = list(_week_days()) if every else [due]
        for d in days:
            await task_service.create_task(
                session, user.id, TaskCreate(title=title, due_date=d, due_time=tm)
            )
        when_txt = (
            " (every day this week)" if every
            else (f" (due {due:%b %d}" + (f" {tm:%-I:%M %p}" if tm else "") + ")" if due else (f" ({tm:%-I:%M %p})" if tm else ""))
        )
        created.append(title + when_txt)

    out = _ADD_TASK_RE.sub("", reply).strip()
    if created:
        out += ("\n\n" if out else "") + "✓ Added to your tasks: " + "; ".join(created)
    return out


async def _call_claude_bridge(url: str, message: str, user_id) -> dict:
    """POST to the host Claude bridge. It runs headless `claude -p` on the
    subscription and manages its own per-user conversation memory (via
    --resume), so we neither replay history nor parse ADD_TASK — Claude acts on
    the data directly through the `cc` CLI."""
    async with httpx.AsyncClient(timeout=260) as client:
        resp = await client.post(
            f"{url.rstrip('/')}/chat",
            json={"message": message, "user_id": str(user_id)},
        )
        resp.raise_for_status()
        return resp.json()


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


def _flatten(system: str, messages: list[dict]) -> str:
    """Fold the system prompt + conversation into a single prompt for a CLI
    that takes one string (codex exec)."""
    parts = [system, ""]
    for m in messages:
        who = "User" if m["role"] == "user" else "Assistant"
        parts.append(f"{who}: {m['content']}")
    parts.append("Assistant:")
    return "\n".join(parts)


async def _call_codex_bridge(url: str, prompt: str, user_id) -> str:
    """POST to the host Codex bridge, which runs the `codex` CLI on the ChatGPT
    subscription and returns the assistant's text."""
    async with httpx.AsyncClient(timeout=200) as client:
        resp = await client.post(
            f"{url.rstrip('/')}/chat",
            json={"prompt": prompt, "user_id": str(user_id)},
        )
        resp.raise_for_status()
        data = resp.json()
    return (data.get("reply") or "").strip()


async def _call_openai(system: str, messages: list[dict], key: str, model: str, base_url: str) -> str:
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json={"model": model, "messages": [{"role": "system", "content": system}, *messages]},
        )
        resp.raise_for_status()
        data = resp.json()
    return (data["choices"][0]["message"]["content"] or "").strip()


async def chat(session: AsyncSession, user: User, message: str) -> dict:
    settings = get_settings()

    # The OWNER's assistant is the host Claude bridge (subscription, free, and
    # it can act on the dashboard via `cc`). It owns conversation memory, so we
    # just relay the message and persist both turns for the UI history.
    if user.role == "owner" and settings.claude_bridge_url:
        try:
            result = await _call_claude_bridge(settings.claude_bridge_url, message, user.id)
        except httpx.HTTPError as exc:
            logger.warning("Claude bridge call failed: %s", exc)
            return {"reply": f"Assistant is unreachable right now ({exc}).", "available": False}
        reply = (result.get("reply") or "(no response)").strip()
        session.add(ChatMessage(user_id=user.id, role="user", content=message))
        session.add(ChatMessage(user_id=user.id, role="assistant", content=reply))
        await session.commit()
        return {"reply": reply, "available": bool(result.get("available", True))}

    # Everyone else (the sibling) uses a context-injected chat model. Preferred
    # is the Codex bridge (his ChatGPT subscription); OpenAI API / Anthropic /
    # Ollama are fallbacks. The backend builds context + parses ADD_TASK either
    # way, so the model only has to produce text.
    if not (settings.codex_bridge_url or settings.openai_api_key or settings.anthropic_api_key or settings.ollama_model):
        return {
            "reply": "The assistant isn't configured yet — set CODEX_BRIDGE_URL (ChatGPT subscription), OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_MODEL.",
            "available": False,
        }

    system = f"{_SYSTEM}\n\n--- LIVE CONTEXT ---\n{await build_user_context(session, user)}"
    history = await _load_history(session, user.id)
    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": message})

    try:
        if settings.codex_bridge_url:
            reply = await _call_codex_bridge(settings.codex_bridge_url, _flatten(system, messages), user.id)
        elif settings.openai_api_key:
            reply = await _call_openai(system, messages, settings.openai_api_key, settings.openai_model, settings.openai_base_url)
        elif settings.anthropic_api_key:
            reply = await _call_anthropic(system, messages, settings.anthropic_api_key, settings.anthropic_model)
        else:
            reply = await _call_ollama(system, messages, settings.ollama_url, settings.ollama_model)
    except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
        logger.warning("Assistant call failed: %s", exc)
        return {"reply": f"Assistant is unreachable right now ({exc}).", "available": False}

    reply = await _apply_actions(session, user, reply or "(no response)")
    session.add(ChatMessage(user_id=user.id, role="user", content=message))
    session.add(ChatMessage(user_id=user.id, role="assistant", content=reply))
    await session.commit()
    return {"reply": reply, "available": True}
