"""Pydantic schemas for the User resource.

Separate from the ORM model on purpose: the API contract can evolve
independently of the database, and secrets (`hashed_password`) never leak
into a response because `UserRead` simply doesn't declare them.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    role: str = Field(default="owner", max_length=32)


class UserCreate(UserBase):
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime
