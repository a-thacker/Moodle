"""User persistence and authentication logic."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.user import User


async def get_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def authenticate(
    session: AsyncSession, email: str, password: str
) -> User | None:
    """Return the user if the email exists, is active, and the password
    matches; otherwise None."""
    user = await get_by_email(session, email)
    if user is None or not user.is_active or user.hashed_password is None:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


async def set_password(session: AsyncSession, user: User, new_password: str) -> None:
    user.hashed_password = hash_password(new_password)
    await session.commit()


async def upsert_user(
    session: AsyncSession, *, email: str, password: str, display_name: str, role: str
) -> User:
    """Create the user, or update password/name/role if the email exists.
    Used by the seed script."""
    user = await get_by_email(session, email)
    if user is None:
        user = User(email=email)
        session.add(user)
    user.display_name = display_name
    user.role = role
    user.hashed_password = hash_password(password)
    user.is_active = True
    await session.commit()
    await session.refresh(user)
    return user
