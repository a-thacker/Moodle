"""Claude usage endpoints.

    PUT /ingest/claude-usage   (agent API key)  — store the latest summary
    GET /claude-usage          (owner)          — read it for the dashboard
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_agent_key, require_owner
from app.db.session import get_db
from app.models.usage import ClaudeUsage

router = APIRouter(tags=["usage"])


@router.put("/ingest/claude-usage", dependencies=[Depends(require_agent_key)])
async def ingest_usage(
    payload: dict[str, Any], session: AsyncSession = Depends(get_db)
) -> dict[str, str]:
    row = await session.get(ClaudeUsage, 1)
    if row is None:
        session.add(ClaudeUsage(id=1, data=payload))
    else:
        row.data = payload
    await session.commit()
    return {"status": "ok"}


@router.get("/claude-usage", dependencies=[Depends(require_owner)])
async def get_usage(session: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    row = await session.get(ClaudeUsage, 1)
    if row is None:
        return {}
    return {**row.data, "updatedAt": row.updated_at.isoformat()}
