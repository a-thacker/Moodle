"""Shared API dependencies: authentication and authorization.

- `get_current_user` decodes the bearer JWT and loads the user.
- `require_owner` narrows that to the owner role (grades/eClass data).
- `require_agent_key` guards the machine-to-machine ingest endpoints with a
  shared API key (the sync agent has no user session).
"""

from __future__ import annotations

import uuid

import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User
from app.services import entitlement as entitlement_service
from app.services import user as user_service

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=True)

_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_access_token(token)
        subject = payload.get("sub")
        if subject is None:
            raise _credentials_error
        user_id = uuid.UUID(subject)
    except (jwt.PyJWTError, ValueError):
        raise _credentials_error

    user = await user_service.get_by_id(session, user_id)
    if user is None or not user.is_active:
        raise _credentials_error
    return user


async def require_owner(user: User = Depends(get_current_user)) -> User:
    if user.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Owner access required",
        )
    return user


def require_capability(capability: str):
    """Dependency factory: allow the request only if the user's effective
    capability set (role default + per-user overrides) includes `capability`.
    This is the server-side half of the entitlements model — the UI hides tools
    a user lacks, and this stops them hitting the endpoints directly."""

    async def _guard(
        session: AsyncSession = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> User:
        caps = await entitlement_service.effective_for(session, user)
        if capability not in caps:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"'{capability}' is not enabled for this account",
            )
        return user

    return _guard


# The assistant tool is capability-gated (owner → Claude bridge, other users →
# Codex/OpenAI); whoever has the capability gets it.
require_ai_user = require_capability("assistant")


async def require_agent_key(
    x_api_key: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    """Guard ingest endpoints with the shared agent API key."""
    if not settings.agent_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ingest is not configured (AGENT_API_KEY unset)",
        )
    if x_api_key != settings.agent_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )
