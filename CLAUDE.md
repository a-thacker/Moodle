# CLAUDE.md

## What this project actually is

This repo is NOT just an eClass grades tracker. The tracker is the first
module of a larger project: a **Personal Command Center** — a modular
dashboard of personal tools for daily life (grades, deadlines, a shared
grocery list with a roommate, notifications, and more over time).

**Read `docs/PROJECT_HANDOFF.md` before planning or building anything.**
It defines the full vision, the phased roadmap (Netlify/Supabase now →
self-hosted later → Ollama AI layer → physical device), the two-zone
architecture (local Sync Agent / cloud Hub), and standing preferences.

## Current state (update as things land)

- `eclass/` — finished Python client for eClass (Moodle). Do not rebuild.
  Note: `get_calendar()` and `get_assignments()` ARE implemented (2026-07-11),
  even though docs/PROJECT_HANDOFF.md §2 still calls them stubs.
  `mod_assign_get_assignments` is not AJAX-allowed on this instance;
  assignments derive from timeline events.
- `tracker/` — working grades tracker (fetch → diff → notify → snapshot),
  the seed of the Sync Agent described in the handoff. It already handles
  auth expiry unattended: `EclassClient(auto_relogin=False)` +
  `login(interactive=False)` — no browser ever opens on a schedule.
- `docs/PLAN.md` — the tracker-era architecture doc; superseded by
  docs/PROJECT_HANDOFF.md where they disagree.
- Hub (React/Netlify), Supabase schema, and ntfy are being built per the
  handoff's Phase 1.

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
