"""Grocery item model.

The shared apartment grocery list — the one tool both the owner and the
roommate can read and write (the others are owner-only). Uses an integer
primary key: the list is small, ordering is by insertion, and the frontend
treats ids as numbers.

`added_by_*` is denormalised (initial + owner flag) rather than a FK to
users for now, because grocery predates auth — once login lands these become
derivable from the session user, but the column shape won't need to change.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class GroceryItem(TimestampMixin, Base):
    __tablename__ = "grocery_items"

    # BigInteger on Postgres (→ identity/bigserial); Integer on SQLite so it
    # aliases the rowid and autoincrements (BigInteger PKs don't, on SQLite).
    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    quantity: Mapped[str | None] = mapped_column(String(80), default=None)
    done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    done_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)

    # Who added it (denormalised until auth exists).
    added_by_initial: Mapped[str] = mapped_column(String(2), default="A", nullable=False)
    added_by_owner: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def __repr__(self) -> str:  # pragma: no cover - debug aid
        return f"<GroceryItem {self.name!r} done={self.done}>"
