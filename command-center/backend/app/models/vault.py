"""Obsidian vault registration.

A `VaultRepo` is a git-backed Obsidian vault the owner has connected to the
Command Center. The backend clones/pulls the repo into a data volume and reads
the markdown from disk — Postgres holds only the *registration* (which repos
exist, their sync status, and whether the assistant may read them), never the
note bodies. The vault's real source of truth is git / Obsidian on the Mac.

Vaults are per-user: each row belongs to the account that added it, so the hub
only ever shows a user their own vaults.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

_AutoBigInt = BigInteger().with_variant(Integer, "sqlite")


class VaultRepo(Base):
    __tablename__ = "vault_repos"

    id: Mapped[int] = mapped_column(_AutoBigInt, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # Git remote (https or ssh). A private-repo token is applied at pull time
    # from VAULT_GIT_TOKEN — it is never stored on the row.
    git_url: Mapped[str] = mapped_column(String(500), nullable=False)
    branch: Mapped[str] = mapped_column(String(120), default="main", nullable=False)
    # Optional folder within the repo that is the vault root ("" = repo root).
    subpath: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    # Whether the assistant is allowed to read this vault's notes and fold them
    # into the planner. Off by default — the owner opts a vault in.
    ai_readable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Sync bookkeeping (updated after each clone/pull).
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    last_sync_ok: Mapped[bool | None] = mapped_column(Boolean, default=None)
    last_sync_error: Mapped[str | None] = mapped_column(Text, default=None)
    note_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
