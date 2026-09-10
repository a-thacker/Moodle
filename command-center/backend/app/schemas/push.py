"""Web Push schemas.

`PushSubscriptionIn` mirrors the shape a browser's `PushSubscription.toJSON()`
produces, so the frontend can post the subscription verbatim. `expirationTime`
and any other extra keys are ignored.
"""

from __future__ import annotations

from pydantic import BaseModel


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribeIn(BaseModel):
    endpoint: str


class VapidKeyOut(BaseModel):
    public_key: str
