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
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest, Token
from app.schemas.user import UserRead
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
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


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
