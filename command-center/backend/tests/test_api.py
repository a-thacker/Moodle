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

    # --- tasks (per-user) ---
    r = client.post("/api/v1/tasks", json={"title": "Write reflection essay", "due_date": "2026-07-18"}, headers=owner_auth)
    body = r.json()
    check("create task -> 201, camelCase dueDate",
          r.status_code == 201 and body["dueDate"] == "2026-07-18" and body["done"] is False)
    task_id = body["id"]
    r = client.patch(f"/api/v1/tasks/{task_id}", json={"done": True}, headers=owner_auth)
    check("toggle task done -> doneAt set", r.status_code == 200 and r.json()["doneAt"] is not None)
    check("owner lists 1 task", len(client.get("/api/v1/tasks", headers=owner_auth).json()) == 1)
    check("roommate sees no owner tasks", len(client.get("/api/v1/tasks", headers=room_auth).json()) == 0)
    check("roommate can't touch owner task -> 404",
          client.patch(f"/api/v1/tasks/{task_id}", json={"done": False}, headers=room_auth).status_code == 404)
    check("delete task -> 204", client.delete(f"/api/v1/tasks/{task_id}", headers=owner_auth).status_code == 204)

    # --- projects (per-user; group tasks, derive progress) ---
    r = client.post("/api/v1/projects", json={"name": "Capstone", "color": "#8b7cf0"}, headers=owner_auth)
    proj = r.json()
    check("create project -> 201, camelCase, taskCount 0",
          r.status_code == 201 and proj["name"] == "Capstone" and proj["taskCount"] == 0 and proj["status"] == "active")
    pid = proj["id"]

    r = client.post("/api/v1/tasks", json={"title": "Draft proposal", "project_id": pid}, headers=owner_auth)
    check("create task in project -> projectId set", r.status_code == 201 and r.json()["projectId"] == pid)
    ptask_id = r.json()["id"]

    r = client.get("/api/v1/projects", headers=owner_auth)
    check("GET /projects -> taskCount 1, doneCount 0",
          len(r.json()) == 1 and r.json()[0]["taskCount"] == 1 and r.json()[0]["doneCount"] == 0)

    client.patch(f"/api/v1/tasks/{ptask_id}", json={"done": True}, headers=owner_auth)
    check("complete the task -> project doneCount 1",
          client.get("/api/v1/projects", headers=owner_auth).json()[0]["doneCount"] == 1)

    r = client.patch(f"/api/v1/projects/{pid}", json={"status": "done"}, headers=owner_auth)
    check("patch project done -> status+doneAt", r.status_code == 200 and r.json()["status"] == "done" and r.json()["doneAt"] is not None)

    check("roommate sees no owner projects", len(client.get("/api/v1/projects", headers=room_auth).json()) == 0)
    check("roommate can't patch owner project -> 404",
          client.patch(f"/api/v1/projects/{pid}", json={"name": "x"}, headers=room_auth).status_code == 404)

    check("delete project -> 204", client.delete(f"/api/v1/projects/{pid}", headers=owner_auth).status_code == 204)
    check("task survives the project delete (unfiled)",
          any(t["id"] == ptask_id for t in client.get("/api/v1/tasks", headers=owner_auth).json()))

    # --- task kinds + eClass assignments-as-tasks ---
    r = client.post("/api/v1/tasks", json={"title": "Water plants", "kind": "reminder", "due_date": "2026-08-10"}, headers=owner_auth)
    check("create reminder -> kind reminder, source manual",
          r.status_code == 201 and r.json()["kind"] == "reminder" and r.json()["source"] == "manual")

    r = client.put("/api/v1/ingest/assignments", headers=KEY, json=[
        {"id": 9001, "name": "Essay 1", "due": "2026-08-15T23:59:00-04:00", "module": "assign", "course_name": "ENGL", "overdue": False},
        {"id": 9002, "name": "Quiz 2", "due": "2026-08-12T10:00:00-04:00", "module": "quiz", "course_name": "BIO", "overdue": False},
    ])
    check("ingest assignments -> synced 2", r.status_code == 200 and r.json()["synced"] == 2)

    eclass_tasks = [t for t in client.get("/api/v1/tasks", headers=owner_auth).json() if t["source"] == "eclass"]
    check("assignments -> eClass tasks (kind task, school, dated)",
          len(eclass_tasks) == 2 and all(t["kind"] == "task" and t["category"] == "school" and t["dueDate"] for t in eclass_tasks))
    essay = next(t for t in eclass_tasks if t["title"] == "Essay 1")
    check("assignment due time = local wall-clock 23:59", essay["dueTime"] == "23:59:00")

    client.patch(f"/api/v1/tasks/{essay['id']}", json={"done": True}, headers=owner_auth)
    client.put("/api/v1/ingest/assignments", headers=KEY, json=[
        {"id": 9001, "name": "Essay 1 (revised)", "due": "2026-08-15T23:59:00-04:00", "module": "assign", "course_name": "ENGL", "overdue": False},
    ])
    eclass2 = [t for t in client.get("/api/v1/tasks", headers=owner_auth).json() if t["source"] == "eclass"]
    essay2 = next(t for t in eclass2 if t["id"] == essay["id"])
    check("re-ingest: no dup, preserves done, updates title",
          len(eclass2) == 2 and essay2["title"] == "Essay 1 (revised)" and essay2["done"] is True)

    # --- calendar: eClass ingest (API key) -> owner's eclass source ---
    # The agent sends tz-aware times (local offset); they must be stored as
    # naive local wall-clock (10:00 EDT -> "10:00:00", not UTC-shifted 14:00).
    r = client.put("/api/v1/ingest/calendar", headers=KEY, json=[
        {"id": 5001, "name": "Exam 1", "start": "2026-08-01T10:00:00-04:00",
         "end": "2026-08-01T11:00:00-04:00", "course_name": "BIO", "location": "Hall A"},
        {"id": 5002, "name": "Lab due", "start": "2026-08-03T23:59:00-04:00", "course_name": "BIO"},
    ])
    check("ingest calendar -> synced 2", r.status_code == 200 and r.json()["synced"] == 2)

    r = client.get("/api/v1/calendar/events", headers=owner_auth)
    ev = r.json()
    check("owner GET /calendar/events -> 2 (camelCase, eclass source)",
          r.status_code == 200 and len(ev) == 2 and ev[0]["courseName"] == "BIO"
          and ev[0]["allDay"] is False and ev[0]["source"] == "eclass")
    check("tz-aware start normalized to naive local wall-clock",
          ev[0]["start"] == "2026-08-01T10:00:00")

    r = client.get("/api/v1/calendar/sources", headers=owner_auth)
    srcs = r.json()
    check("owner GET /calendar/sources -> 1 eclass source, eventCount 2",
          r.status_code == 200 and len(srcs) == 1 and srcs[0]["kind"] == "eclass"
          and srcs[0]["eventCount"] == 2)

    # Re-ingest a smaller set: upsert updates title, reconcile prunes the rest.
    client.put("/api/v1/ingest/calendar", headers=KEY, json=[
        {"id": 5001, "name": "Exam 1 (moved)", "start": "2026-08-01T10:00:00", "course_name": "BIO"},
    ])
    r = client.get("/api/v1/calendar/events", headers=owner_auth)
    check("re-ingest prunes to 1 + updates title",
          len(r.json()) == 1 and r.json()[0]["title"] == "Exam 1 (moved)")

    check("roommate GET /calendar/events -> 403 (no capability)",
          client.get("/api/v1/calendar/events", headers=room_auth).status_code == 403)

    # .ics parsing + RRULE expansion, exercised directly (no network).
    from datetime import date  # noqa: PLC0415
    from zoneinfo import ZoneInfo  # noqa: PLC0415

    from app.services.calendar_ics import parse_ics  # noqa: PLC0415
    sample_ics = (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n"
        "BEGIN:VEVENT\r\nUID:weekly-1\r\nSUMMARY:Standup\r\n"
        "DTSTART:20260801T090000Z\r\nDTEND:20260801T091500Z\r\n"
        "RRULE:FREQ=WEEKLY;COUNT=3\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
    )
    occ = parse_ics(sample_ics, ZoneInfo("America/New_York"), date(2026, 7, 31))
    check(".ics RRULE expands to 3 distinct occurrences",
          len(occ) == 3 and len({e.external_uid for e in occ}) == 3
          and all(e.title == "Standup" for e in occ))

    os.unlink(_db.name)
    print(f"\n{'ALL PASSED' if not failures else f'{len(failures)} FAILURE(S): ' + ', '.join(failures)}")
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
