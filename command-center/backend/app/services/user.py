"""User persistence and authentication logic."""

from __future__ import annotations

import secrets
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.user import User


def generate_ntfy_topic() -> str:
    """A private ntfy topic for a new user. The topic name is the password, so
    it's a long unguessable random string (prefixed for readability)."""
    return f"cc-{secrets.token_urlsafe(24)}"


async def get_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await session.get(User, user_id)


async def list_users(session: AsyncSession) -> list[User]:
    """All accounts, oldest first — for the owner's provisioning screen."""
    result = await session.execute(select(User).order_by(User.created_at.asc()))
    return list(result.scalars().all())


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


async def update_preferences(
    session: AsyncSession, user: User, patch: dict[str, Any]
) -> dict[str, Any]:
    """Shallow-merge `patch` into the user's preferences and persist. Reassigns
    a fresh dict (not an in-place mutation) so SQLAlchemy flags the JSON column
    as dirty. A key set to null is removed."""
    merged = {**(user.preferences or {})}
    for key, value in patch.items():
        if value is None:
            merged.pop(key, None)
        else:
            merged[key] = value
    user.preferences = merged
    await session.commit()
    await session.refresh(user)
    return user.preferences


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
    # New accounts get their own private ntfy topic; never rotate an existing
    # one (the user may already have their phone subscribed to it).
    if not user.ntfy_topic:
        user.ntfy_topic = generate_ntfy_topic()
    await session.commit()
    await session.refresh(user)
    return user
