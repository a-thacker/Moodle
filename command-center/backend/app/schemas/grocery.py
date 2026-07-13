"""Pydantic schemas for the grocery list.

`GroceryItemRead` serialises with camelCase aliases so the JSON matches the
frontend's `GroceryItem` TypeScript type verbatim (addedByInitial,
addedByOwner) while the ORM keeps snake_case columns.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class GroceryItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    quantity: str | None = Field(default=None, max_length=80)


class GroceryItemUpdate(BaseModel):
    """All fields optional — a PATCH may set just `done`."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    quantity: str | None = Field(default=None, max_length=80)
    done: bool | None = None


class GroceryItemRead(_CamelModel):
    id: int
    name: str
    quantity: str | None
    done: bool
    added_by_initial: str
    added_by_owner: bool
