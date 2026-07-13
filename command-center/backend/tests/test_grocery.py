"""End-to-end grocery CRUD test against a throwaway SQLite database.

Runs the real FastAPI app and router with `get_db` overridden to a temp-file
SQLite engine (async), so the service + router + schemas are exercised for
real without needing Postgres. Run directly: `python -m tests.test_grocery`.
"""

from __future__ import annotations

import asyncio
import os
import tempfile

os.environ.setdefault("POSTGRES_USER", "test")
os.environ.setdefault("POSTGRES_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB", "test")
os.environ.setdefault("POSTGRES_HOST", "localhost")

from collections.abc import AsyncGenerator  # noqa: E402

from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app import models as _models  # noqa: E402,F401  (register tables on metadata)
from app.db.base import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402

_db_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
test_engine = create_async_engine(f"sqlite+aiosqlite:///{_db_file.name}")
TestSession = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)


async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSession() as session:
        yield session


async def _create_schema() -> None:
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def main() -> None:
    asyncio.run(_create_schema())
    app.dependency_overrides[get_db] = _override_get_db

    from fastapi.testclient import TestClient

    client = TestClient(app)
    failures: list[str] = []

    def check(label: str, cond: bool) -> None:
        print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
        if not cond:
            failures.append(label)

    # empty list
    r = client.get("/api/v1/grocery")
    check("GET empty list -> 200 []", r.status_code == 200 and r.json() == [])

    # add
    r = client.post("/api/v1/grocery", json={"name": "Eggs", "quantity": "2 dozen"})
    body = r.json()
    check("POST add -> 201", r.status_code == 201)
    check("response is camelCase (addedByInitial/addedByOwner present)",
          "addedByInitial" in body and "addedByOwner" in body)
    check("added item fields", body["name"] == "Eggs" and body["quantity"] == "2 dozen"
          and body["done"] is False)
    item_id = body["id"]

    # second item
    client.post("/api/v1/grocery", json={"name": "Coffee beans"})

    # list has 2, outstanding
    r = client.get("/api/v1/grocery")
    check("GET list -> 2 items", len(r.json()) == 2)

    # toggle done
    r = client.patch(f"/api/v1/grocery/{item_id}", json={"done": True})
    check("PATCH done=true", r.status_code == 200 and r.json()["done"] is True)

    # done items sort after outstanding
    r = client.get("/api/v1/grocery")
    check("done item sorts last", r.json()[-1]["id"] == item_id)

    # 404 on missing
    r = client.patch("/api/v1/grocery/999999", json={"done": True})
    check("PATCH missing -> 404", r.status_code == 404)

    # delete
    r = client.delete(f"/api/v1/grocery/{item_id}")
    check("DELETE -> 204", r.status_code == 204)
    r = client.get("/api/v1/grocery")
    check("list -> 1 after delete", len(r.json()) == 1)

    os.unlink(_db_file.name)
    print(f"\n{'ALL PASSED' if not failures else f'{len(failures)} FAILURE(S): ' + ', '.join(failures)}")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
