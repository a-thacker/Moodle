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

- `command-center/` — the new self-hosted app (see its own README). This is
  where active backend work happens.
- `hub/` + `supabase/` — the OLD Netlify/Supabase Hub. Being superseded by
  command-center. Don't extend it; the agent will later repoint from
  Supabase to the FastAPI backend.
- `Personal command center redesign/` — Nocturne dark-UI redesign
  (`DESIGN_HANDOFF.md`). Visual source of truth for the NEW frontend
  (React+Vite+TypeScript talking to FastAPI, not Supabase). Not yet ported.

## Current state (update as things land)

- `eclass/` — finished Python client for eClass (Moodle). Do not rebuild.
  Note: `get_calendar()` and `get_assignments()` ARE implemented (2026-07-11),
  even though docs/PROJECT_HANDOFF.md §2 still calls them stubs.
  `mod_assign_get_assignments` is not AJAX-allowed on this instance;
  assignments derive from timeline events.
- `agent/` — the Sync Agent (fetch → diff → notify → snapshot → Supabase
  push). Handles auth expiry unattended: `EclassClient(auto_relogin=False)`
  + `login(interactive=False)` — no browser ever opens on a schedule.
  Cloud pieces (Supabase, ntfy) are optional and env-configured via `.env`.
- `hub/` — React/Vite dashboard (login, grades + deadlines widgets,
  realtime grocery list), deployed via netlify.toml. Builds clean; not yet
  connected to a real Supabase project.
- `supabase/` — schema.sql + migration 001, not yet applied (waiting on
  Alden to create the Supabase project and the two auth users).
- `docs/PLAN.md` — the tracker-era architecture doc; superseded by
  docs/PROJECT_HANDOFF.md where they disagree.

## Non-negotiables

- `state.json` never leaves this machine; Supabase gets derived data only.
  Cloud code never touches eClass directly — only the local agent does.
- Anything scheduled/unattended must never open a browser: on
  `SessionExpired`, notify Alden to re-login manually and back off.
- Supabase work always ships `supabase/schema.sql` + idempotent versioned
  migrations (`supabase/migrations/NNN_*.sql`), safe to re-run.
- Netlify config/secrets come from env vars injected at build; provide
  `netlify.toml` when needed. No secrets in client code or git, ever.
- Row Level Security from day one: the roommate's user sees shared tools
  (grocery list, later chores/expenses) — never grades.
- Every design choice must preserve a clean migration path to self-hosting
  (Docker-friendly, no hard vendor lock-in).

## Conventions

- Python 3.10+, typed dataclasses with `to_dict()`, typed exceptions —
  match the existing `eclass/` style.
- Test against the live server with `eclass/.venv/bin/python` from the
  repo root (session cookies in `state.json` — read-only calls only).
- On public ntfy.sh the topic name is the password: long random string,
  supplied via env var, never committed.
