"""User model.

The first-class account record. Authentication (password hashing, sessions)
lands in Phase 2 — `hashed_password` is nullable now so the table can exist
before auth is wired. `role` gates access the way the old Supabase RLS did
(`owner` vs `roommate`).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(320), unique=True, index=True, nullable=False
    )
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="owner", nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Each user's private ntfy topic (the topic name *is* the password — a long
    # random string). Generated on account creation; owner shares it so the
    # user can subscribe their phone. Null = no reminder channel.
    ntfy_topic: Mapped[str | None] = mapped_column(String(80), default=None)
    # Per-account UI preferences (sidebar order/visibility, dashboard tile
    # arrangement, weather location, …). A single JSON blob so it ports across
    # every device the user signs in on — the client owns the shape.
    preferences: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, server_default="{}", nullable=False
    )

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<User {self.email} ({self.role})>"
