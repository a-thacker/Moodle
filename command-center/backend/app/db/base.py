"""SQLAlchemy declarative base and shared column mixins.

`Base` is the single declarative base every model inherits from; its
`metadata` is what Alembic autogenerates migrations against. Common columns
(surrogate id, timestamps) live in mixins so models stay small and
consistent.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


class UUIDPrimaryKeyMixin:
    """A UUID primary key, generated application-side."""

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    """`created_at` / `updated_at`, maintained by the database."""

    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now(), nullable=False
    )
