"""Assistant endpoint (owner only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import require_owner
from app.services import assistant as assistant_service

router = APIRouter(prefix="/assistant", tags=["assistant"], dependencies=[Depends(require_owner)])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class ChatReply(BaseModel):
    reply: str
    available: bool


@router.post("/chat", response_model=ChatReply)
async def chat(payload: ChatRequest) -> ChatReply:
    result = await assistant_service.chat(payload.message)
    return ChatReply(**result)
