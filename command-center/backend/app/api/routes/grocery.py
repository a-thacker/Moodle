"""Grocery list endpoints (the shared tool).

    GET    /grocery         list items (outstanding first)
    POST   /grocery         add an item
    PATCH  /grocery/{id}    update (typically toggle `done`)
    DELETE /grocery/{id}    remove an item

Mounted under the versioned API prefix, so the full paths are /api/v1/grocery…
— matching the frontend's api.grocery client. No auth yet; that gate lands
with Phase 2 and will scope writes to the two known users.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.grocery import (
    GroceryItemCreate,
    GroceryItemRead,
    GroceryItemUpdate,
)
from app.services import grocery as grocery_service

router = APIRouter(prefix="/grocery", tags=["grocery"])


@router.get("", response_model=list[GroceryItemRead])
async def list_grocery(session: AsyncSession = Depends(get_db)) -> list[GroceryItemRead]:
    items = await grocery_service.list_items(session)
    return [GroceryItemRead.model_validate(item) for item in items]


@router.post("", response_model=GroceryItemRead, status_code=status.HTTP_201_CREATED)
async def add_grocery(
    payload: GroceryItemCreate, session: AsyncSession = Depends(get_db)
) -> GroceryItemRead:
    item = await grocery_service.create_item(session, payload)
    return GroceryItemRead.model_validate(item)


@router.patch("/{item_id}", response_model=GroceryItemRead)
async def update_grocery(
    item_id: int,
    payload: GroceryItemUpdate,
    session: AsyncSession = Depends(get_db),
) -> GroceryItemRead:
    item = await grocery_service.get_item(session, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grocery item not found")
    updated = await grocery_service.update_item(session, item, payload)
    return GroceryItemRead.model_validate(updated)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_grocery(
    item_id: int, session: AsyncSession = Depends(get_db)
) -> None:
    item = await grocery_service.get_item(session, item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grocery item not found")
    await grocery_service.delete_item(session, item)
