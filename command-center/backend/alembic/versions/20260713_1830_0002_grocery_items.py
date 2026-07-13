"""grocery items table

Revision ID: 0002_grocery
Revises: 0001_initial
Create Date: 2026-07-13

Hand-authored to match app.models.grocery.GroceryItem.
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_grocery"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "grocery_items",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("quantity", sa.String(length=80), nullable=True),
        sa.Column("done", sa.Boolean(), nullable=False),
        sa.Column("done_at", sa.DateTime(), nullable=True),
        sa.Column("added_by_initial", sa.String(length=2), nullable=False),
        sa.Column("added_by_owner", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("grocery_items")
