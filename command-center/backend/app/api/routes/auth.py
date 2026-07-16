"""Authentication endpoints.

    POST /auth/login   email + password  → bearer token
    GET  /auth/me      current user (requires token)

Signups are intentionally absent: the two accounts are seeded server-side
(scripts/seed_users.py), matching the old Hub's "no public signup" rule.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.capabilities import available_capabilities, link_url
from app.core.config import get_settings
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest, Token
from app.schemas.user import LinkInfo, UserRead
from app.services import entitlement as entitlement_service
from app.services import user as user_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
async def login(
    payload: LoginRequest, session: AsyncSession = Depends(get_db)
) -> Token:
    user = await user_service.authenticate(session, payload.email, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserRead)
async def me(
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    settings = get_settings()
    caps = await entitlement_service.effective_for(session, current_user)
    available = available_capabilities(settings)
    available_keys = {c.key for c in available}
    # Drop any capability whose tool isn't available here (e.g. a link whose URL
    # isn't configured), so the client never renders a dead entry.
    caps &= available_keys
    links = [
        LinkInfo(key=c.key, label=c.label, icon=c.icon, url=link_url(c, settings))
        for c in available
        if c.kind == "link" and c.key in caps
    ]
    return UserRead.model_validate(current_user).model_copy(
        update={"capabilities": sorted(caps), "links": links}
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: ChangePasswordRequest,
    session: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if current_user.hashed_password is None or not verify_password(
        payload.current_password, current_user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    await user_service.set_password(session, current_user, payload.new_password)
