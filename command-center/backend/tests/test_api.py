"""End-to-end API test: auth, gated grocery, eClass ingest + owner reads.

Runs the real app against a throwaway SQLite DB with `get_db` overridden.
    python -m tests.test_api
"""

from __future__ import annotations

import asyncio
import os
import tempfile

os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB", "test")
os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("AGENT_API_KEY", "test-agent-key")

from collections.abc import AsyncGenerator  # noqa: E402

from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app import models as _models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.services import user as user_service  # noqa: E402

_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
engine = create_async_engine(f"sqlite+aiosqlite:///{_db.name}")
Session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

OWNER = ("alden@example.com", "owner-pass-123")
ROOMMATE = ("sam@example.com", "roommate-pass-123")


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with Session() as session:
        yield session


async def _setup() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with Session() as session:
        await user_service.upsert_user(
            session, email=OWNER[0], password=OWNER[1], display_name="Alden", role="owner"
        )
        await user_service.upsert_user(
            session, email=ROOMMATE[0], password=ROOMMATE[1], display_name="Sam", role="roommate"
        )


def main() -> None:
    asyncio.run(_setup())
    app.dependency_overrides[get_db] = _override_get_db

    from fastapi.testclient import TestClient

    client = TestClient(app)
    failures: list[str] = []

    def check(label: str, cond: bool) -> None:
        print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
        if not cond:
            failures.append(label)

    KEY = {"X-API-Key": "test-agent-key"}

    # --- auth ---
    check("grocery without token -> 401", client.get("/api/v1/grocery").status_code == 401)
    check("login bad password -> 401",
          client.post("/api/v1/auth/login", json={"email": OWNER[0], "password": "nope"}).status_code == 401)

    r = client.post("/api/v1/auth/login", json={"email": OWNER[0], "password": OWNER[1]})
    check("owner login -> 200 + token", r.status_code == 200 and "access_token" in r.json())
    owner_auth = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.post("/api/v1/auth/login", json={"email": ROOMMATE[0], "password": ROOMMATE[1]})
    room_auth = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.get("/api/v1/auth/me", headers=owner_auth)
    check("/auth/me -> owner role", r.status_code == 200 and r.json()["role"] == "owner")

    # --- grocery (any authed user); added_by reflects the user ---
    r = client.post("/api/v1/grocery", json={"name": "Eggs"}, headers=room_auth)
    check("roommate adds grocery -> 201, initial S, not owner",
          r.status_code == 201 and r.json()["addedByInitial"] == "S" and r.json()["addedByOwner"] is False)

    # --- eClass ingest (API key) ---
    check("ingest without key -> 401",
          client.put("/api/v1/ingest/courses", json=[]).status_code == 401)
    r = client.put("/api/v1/ingest/courses", headers=KEY,
                   json=[{"id": 62950, "short_name": "S-L", "full_name": "Service-Learning Project", "hidden": False}])
    check("ingest courses -> upserted 1", r.status_code == 200 and r.json()["upserted"] == 1)

    client.post("/api/v1/ingest/grade-snapshots", headers=KEY,
                json={"course_id": 62950, "report": {"items": [{"name": "Total", "percentage": "100.00 %", "is_total": True}]}})
    client.post("/api/v1/ingest/grade-events", headers=KEY,
                json=[{"course_id": 62950, "kind": "graded", "item_name": "Proposal", "new": "100%"}])
    client.put("/api/v1/ingest/timeline", headers=KEY,
               json=[{"id": 1, "name": "Journal #2", "due": "2026-07-14T23:59:00", "module": "assign", "course_name": "S-L", "overdue": False}])

    # --- eClass reads (owner only) ---
    r = client.get("/api/v1/courses", headers=owner_auth)
    check("owner GET /courses -> totalPercent 100",
          r.status_code == 200 and r.json()[0]["totalPercent"] == 100.0 and r.json()[0]["fullName"] == "Service-Learning Project")

    r = client.get("/api/v1/grade-events", headers=owner_auth)
    check("owner GET /grade-events -> 1 (camelCase title)",
          r.status_code == 200 and len(r.json()) == 1 and "Proposal" in r.json()[0]["title"])

    r = client.get("/api/v1/deadlines", headers=owner_auth)
    check("owner GET /deadlines -> 1 (courseName mapped)",
          r.status_code == 200 and r.json()[0]["courseName"] == "S-L")

    check("roommate GET /courses -> 403", client.get("/api/v1/courses", headers=room_auth).status_code == 403)

    os.unlink(_db.name)
    print(f"\n{'ALL PASSED' if not failures else f'{len(failures)} FAILURE(S): ' + ', '.join(failures)}")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
