# CLAUDE.md

## What this project actually is

This repo is NOT just an eClass grades tracker. The tracker is the first
module of a larger project: a **Personal Command Center** — a modular
dashboard of personal tools for daily life (grades, deadlines, a shared
grocery list with a roommate, notifications, and more over time).

**Read `docs/PROJECT_HANDOFF.md` AND `server_handoff.txt` before planning or
building anything.** PROJECT_HANDOFF.md has the original vision + roadmap.
`server_handoff.txt` is the NEWER direction and takes precedence where they
conflict.

### ARCHITECTURE PIVOT (2026-07-13): self-hosted, Postgres is source of truth
The project moved off Netlify/Supabase to a **self-hosted stack** on an
Ubuntu server (`athacker-cc`, reached via Tailscale; user builds locally in
`command-center/` and syncs to `~/command-center` there). New stack:
FastAPI + PostgreSQL + Alembic + Ollama, all in Docker Compose. **Postgres
is the single source of truth; the backend is the only thing that touches
it** — frontend and the future LLM go through the API. Build backend-first;
AI (Ollama tool-calling) is a later phase, not now.

- `command-center/` — the self-hosted app (FastAPI backend + React/Vite/TS
  frontend, Docker Compose). This is where active work happens. Deploy with
  `command-center/deploy.sh` (rsync to `cc` → `docker compose up -d --build`;
  the backend entrypoint runs Alembic migrations).
- `Personal command center redesign new/` — Nocturne dark-UI redesign mockups.
  Visual reference for the frontend.
- The old Netlify/Supabase `hub/` + `supabase/` were removed 2026-07-16 (fully
  superseded by command-center; the agent pushes to the FastAPI backend now).

## Current state (update as things land)

- `eclass/` — finished Python client for eClass (Moodle). Do not rebuild.
  Note: `get_calendar()` and `get_assignments()` ARE implemented (2026-07-11),
  even though docs/PROJECT_HANDOFF.md §2 still calls them stubs.
  `mod_assign_get_assignments` is not AJAX-allowed on this instance;
  assignments derive from timeline events.
- `agent/` — the Sync Agent (fetch → diff → notify → snapshot → push to the
  Command Center backend). Handles auth expiry unattended:
  `EclassClient(auto_relogin=False)` + `login(interactive=False)` — no browser
  ever opens on a schedule. Push (CC backend) + ntfy are optional, env-configured
  via `.env` (CC_API_URL/CC_API_KEY). Runs on the Mac via launchd. Pushes courses,
  grades, the timeline mirror, AND the eClass **calendar** (2026-07-31) — the
  calendar (`get_calendar()`) is now the primary school-events source since the
  timeline is often empty.
- **Calendar** (2026-07-31) — a provider-agnostic, per-user calendar layer:
  `calendar_sources` (a user's feeds: `eclass` agent-fed, or `ics` a read-only
  Google/Apple feed URL) + `calendar_events` (imported mirrors, upserted by
  `(source_id, external_uid)`). `.ics` feeds are fetched on a background loop
  (`services/calendar_ics.py`, `icalendar` + `recurring_ical_events`); eClass
  events map to the owner. Read-only imports show in the Calendar view AND overlay
  the Planner (never copied into `tasks` — an "add as task" button spins off a
  real to-do). `calendar` is an owner-grant capability, so a non-owner (e.g. Dad)
  can have Apple/Google feeds with no eClass infrastructure.
- `docs/PLAN.md` — the tracker-era architecture doc; superseded by
  docs/PROJECT_HANDOFF.md where they disagree.

## Non-negotiables

- `state.json` never leaves this machine; the backend gets derived data only.
  The backend never touches eClass directly — only the local agent does.
- Anything scheduled/unattended must never open a browser: on
  `SessionExpired`, notify Alden to re-login manually and back off.
- DB changes ship as idempotent, hand-authored Alembic migrations under
  `command-center/backend/alembic/versions/`, safe to re-run (the entrypoint
  applies them on deploy). No secrets in client code or git, ever.
- Access is per-user **capabilities**, not roles: two roles only — `owner`
  (admin) and `user`. The catalog + defaults live in
  `command-center/backend/app/core/capabilities.py`; the owner grants extras
  per person in the Settings → People screen. A user sees only granted tools
  (grades/grocery/calendar are owner-grant, not defaults).

## Conventions

- Python 3.10+, typed dataclasses with `to_dict()`, typed exceptions —
  match the existing `eclass/` style.
- Test against the live server with `eclass/.venv/bin/python` from the
  repo root (session cookies in `state.json` — read-only calls only).
- On public ntfy.sh the topic name is the password: a long random string.
  Each user has their own auto-generated `users.ntfy_topic` (the owner shares
  it from the People screen); never commit topics.
