"""Pydantic schemas for capabilities and per-user entitlements (admin surface)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class NewUser(BaseModel):
    """Owner-provisioned account. Always created as a plain `user`; the owner
    grants extra tools afterward from the People screen."""

    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class CapabilityInfo(BaseModel):
    """One entry of the capability catalog, for the provisioning UI."""

    key: str
    label: str
    icon: str
    default_for_new_user: bool
    always: bool
    kind: str


class UserEntitlements(BaseModel):
    """A user plus their effective capabilities and raw overrides. Owner-only
    surface, so it also carries the user's private ntfy topic to share."""

    id: uuid.UUID
    email: str
    display_name: str
    role: str
    is_active: bool
    capabilities: list[str]
    overrides: dict[str, bool]
    ntfy_topic: str | None = None


class EntitlementUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overrides: dict[str, bool]
