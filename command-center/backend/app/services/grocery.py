"""Grocery list business logic.

All database access for the grocery resource lives here; the router only
translates HTTP to these calls and back. Ordering matches the UI: outstanding
items first, newest within each group.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.grocery import GroceryItem
from app.schemas.grocery import GroceryItemCreate, GroceryItemUpdate


async def list_items(session: AsyncSession) -> list[GroceryItem]:
    result = await session.execute(
        select(GroceryItem).order_by(
            GroceryItem.done.asc(), GroceryItem.created_at.desc()
        )
    )
    return list(result.scalars().all())


async def get_item(session: AsyncSession, item_id: int) -> GroceryItem | None:
    return await session.get(GroceryItem, item_id)


async def create_item(
    session: AsyncSession, data: GroceryItemCreate
) -> GroceryItem:
    # added_by_* default to the owner until auth supplies the real user.
    item = GroceryItem(name=data.name.strip(), quantity=data.quantity)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return item


async def update_item(
    session: AsyncSession, item: GroceryItem, data: GroceryItemUpdate
) -> GroceryItem:
    fields = data.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"] is not None:
        item.name = fields["name"].strip()
    if "quantity" in fields:
        item.quantity = fields["quantity"]
    if "done" in fields and fields["done"] is not None:
        item.done = fields["done"]
        item.done_at = datetime.now() if fields["done"] else None
    await session.commit()
    await session.refresh(item)
    return item


async def delete_item(session: AsyncSession, item: GroceryItem) -> None:
    await session.delete(item)
    await session.commit()
