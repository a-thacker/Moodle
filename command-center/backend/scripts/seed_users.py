"""Seed the two accounts (owner + roommate) from environment variables.

Idempotent: creates the users, or updates their password/name/role if they
already exist. Run once (and whenever you rotate a password):

    docker compose exec backend python -m scripts.seed_users

Reads OWNER_EMAIL/OWNER_PASSWORD (+ _NAME) and the ROOMMATE_* equivalents.
The owner is required; the roommate is optional.
"""

from __future__ import annotations

import asyncio
import sys

from app.core.config import get_settings
from app.db.session import SessionFactory
from app.services import user as user_service


async def _seed() -> int:
    settings = get_settings()
    if not (settings.owner_email and settings.owner_password):
        print("ERROR: OWNER_EMAIL and OWNER_PASSWORD must be set.", file=sys.stderr)
        return 1

    async with SessionFactory() as session:
        owner = await user_service.upsert_user(
            session,
            email=settings.owner_email,
            password=settings.owner_password,
            display_name=settings.owner_name,
            role="owner",
        )
        print(f"owner seeded: {owner.email} ({owner.display_name})")

        if settings.roommate_email and settings.roommate_password:
            roommate = await user_service.upsert_user(
                session,
                email=settings.roommate_email,
                password=settings.roommate_password,
                display_name=settings.roommate_name,
                role="roommate",
            )
            print(f"roommate seeded: {roommate.email} ({roommate.display_name})")
        else:
            print("roommate skipped (ROOMMATE_EMAIL/ROOMMATE_PASSWORD unset)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_seed()))
