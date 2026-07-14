"""Assistant endpoint (owner only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_owner
from app.db.session import get_db
from app.models.user import User
from app.services import assistant as assistant_service

router = APIRouter(prefix="/assistant", tags=["assistant"], dependencies=[Depends(require_owner)])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ChatReply(BaseModel):
    reply: str
    available: bool


class ChatMessageOut(BaseModel):
    role: str
    content: str


@router.get("/history", response_model=list[ChatMessageOut])
async def history(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_owner),
) -> list[ChatMessageOut]:
    msgs = await assistant_service.list_history(session, user.id)
    return [ChatMessageOut(role=m.role, content=m.content) for m in msgs]


@router.post("/chat", response_model=ChatReply)
async def chat(
    payload: ChatRequest,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_owner),
) -> ChatReply:
    result = await assistant_service.chat(session, user, payload.message)
    return ChatReply(**result)


@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
async def clear_history(
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_owner),
) -> None:
    await assistant_service.clear_history(session, user.id)
