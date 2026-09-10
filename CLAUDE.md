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
FastAPI + PostgreSQL + Alembic, all in Docker Compose. **Postgres
is the single source of truth; the backend is the only thing that touches
it** — the frontend goes through the API. Build backend-first. (An on-server
LLM/Ollama phase was planned but is **shelved indefinitely** as of 2026-08-25;
if AI is ever revived it'll be via a hosted API, e.g. Anthropic — not local
Ollama. OpenNotebook is the likely path for a future notes/research module.)

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
  grades, the eClass **calendar** (informational events → `calendar_events`), AND
  eClass **assignments → the owner's tasks** (`/ingest/assignments`). As of
  2026-08-25 the agent pushes **only real assignments** (timeline events with
  `module == "assign"`; the `/ingest/assignments` service re-filters defensively);
  other timeline/calendar events stay in `calendar_events` (the Planner's opt-in
  Events overlay), not tasks.
- **Notifications — silent by default** (reworked 2026-08-25, replacing the old
  `kind` model) — a task is a quiet checklist item unless opted in. Task columns:
  `alert` (on → it pings), `alert_time` (fire once at this time; NULL = ride the
  digest + midday/evening re-pings), `important` (⭐, the only thing that
  resurfaces once overdue). No more per-task daily nag. What fires: one-shot timed
  alerts; a **morning digest** at `remind_hour` (due-today + open alert tasks +
  ⭐-overdue, skipped if empty); **1 PM / 6 PM** re-pings of no-time alert tasks.
  The three slots are gated per user by `users.slot_at`. eClass assignments are
  `source=eclass`, silent, deduped by `external_id`, done-state preserved, never
  pruned. The `kind` column was dropped (migration 0021, which also clears the
  old undone eClass calendar-event pollution). See `services/reminders.py`; the
  frontend surfaces alert/important as per-card 🔔/⭐ toggles.
- **Task notifications moved to Web Push** (2026-09-10) — the daily task
  reminders above are now delivered to the installed **PWA over Web Push
  (VAPID)**, not ntfy; ntfy stays for the *other* nudges (proactive AI in
  `services/proactive.py`, the owner broadcast in `admin.py`). New
  `push_subscriptions` table (migration 0022; one row per browser/device a user
  turned notifications on for) + `services/webpush.py` (send via `pywebpush`,
  runs in a thread; 404/410 → prune) + `/api/v1/push/*` (`vapid-public-key`,
  `subscribe`, `unsubscribe`). Config: `VAPID_PUBLIC_KEY` (code default, safe to
  ship), `VAPID_PRIVATE_KEY` (secret, env-only; empty disables Web Push),
  `VAPID_SUBJECT`. `reminders.py` now iterates users with ≥1 push subscription
  and fans each notification out to all their subscriptions. Frontend: a
  push handler injected into the Workbox SW (`public/push-sw.js` via
  `workbox.importScripts`), `src/push.ts` (permission + subscribe), and an
  "Enable notifications on this device" control in Settings → Notifications.
  **iOS: Web Push only works in the home-screen-installed PWA (iOS 16.4+).**
- **Calendar** (2026-07-31) — a provider-agnostic, per-user calendar layer:
  `calendar_sources` (a user's feeds: `eclass` agent-fed, or `ics` a read-only
  Google/Apple feed URL) + `calendar_events` (imported mirrors, upserted by
  `(source_id, external_uid)`). `.ics` feeds are fetched on a background loop
  (`services/calendar_ics.py`, `icalendar` + `recurring_ical_events`); eClass
  events map to the owner. Read-only imports overlay the Planner behind an opt-in
  **Events** toggle (never copied into `tasks` — an "add as task" button spins off
  a real to-do). **The standalone Calendar tab was removed from the nav 2026-08-25**;
  the backend layer + `calendar` capability stay intact (dormant) so it can be
  reintegrated later. `calendar` is an owner-grant capability, so a non-owner
  (e.g. Dad) can have Apple/Google feeds with no eClass infrastructure.
- **Projects** (2026-08-04) — a per-user module that groups tasks under a goal
  (`projects` table + `tasks.project_id` FK, ON DELETE SET NULL). Progress is
  derived from the project's tasks (done/total). Reuses the tasks API for
  membership; a project task still shows in the Planner. **The Projects tab was
  removed from the nav 2026-08-25** (table + API kept, dormant).
- **Nav slimmed** (2026-08-25) — the Calendar, Projects, and **Notes** tabs were
  removed from the launcher rail + command palette at the owner's request; all
  backend code/tables are kept (dormant), so removal is frontend-only and
  reversible. Notes/Obsidian is retired (OpenNotebook is the intended future
  replacement). Tasks now live solely in the reworked **Planner**: filter chips
  (All / School / Personal), per-card 🔔/⭐, a prominent **Unscheduled** capture
  zone, and the Events overlay toggle.
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
