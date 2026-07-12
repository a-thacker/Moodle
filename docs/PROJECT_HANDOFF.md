# Personal Command Center — Project Handoff

*This document is the master brief for building the architecture of this project.
It captures the full vision, what already exists, the phased roadmap, standing
technical preferences, and what to build first. Read it fully before scaffolding
anything.*

---

## 1. The Vision

A self-hosted **Personal Command Center**: a modular dashboard ("the Hub") that
ties together small tools Alden builds to automate and improve daily life as a
college student. The test environment is Alden's college apartment; the long-term
destination is a proper home network with dedicated hardware.

Guiding principles:

- **Modular.** Each tool is a small, independent app/module. The Hub composes them.
- **Ownable.** Start hosted (Netlify) for speed, but every design decision must
  keep a clean migration path to fully self-hosted (Raspberry Pi / Mac mini,
  Docker, home firewall). No vendor lock-in that blocks that move.
- **Private by default.** This is a personal system. MVP: password-protected.
  Later: self-hosted behind the home network/firewall. A small number of tools
  (e.g., grocery list) are deliberately shared with one roommate.
- **Notification-driven.** ntfy is the connective tissue — every tool can push
  alerts to Alden's phone.
- **Eventually intelligent.** Later phases add a locally hosted LLM (Ollama)
  that observes the system's data (schedule, grades, habits) and proactively
  notifies/suggests. Even later: a physical 3D-printed device (custom "Alexa").

Target: a usable Phase 1 system **by end of summer 2026**, ready for daily use
during the upcoming (final) school year.

---

## 2. What Already Exists — the eClass Client (DONE, do not rebuild)

A working, self-contained **Python module** that retrieves data from Southern
Adventist University's eClass (Moodle). Treat it as a finished building block.
It lives in this repo/folder already.

### Summary of capabilities

- **Auth:** Microsoft Entra ID SSO via Playwright. First login is interactive
  (manual password + MFA in a real browser); session cookies persist to
  `state.json` and are reused headlessly until expiry. Expired sessions
  self-heal with one automatic re-login + retry (which may require the human).
- **Working methods** on `EclassClient`:
  - `get_courses()` — enrolled courses (AJAX)
  - `get_course(id)` — one course (AJAX)
  - `get_grades(course_id)` — full grade report incl. assignments, percentages,
    categories, feedback, course total (HTML parsing)
  - `get_timeline(limit, start, end)` — upcoming due dates / action events (AJAX)
  - `logout()`
- **Stubs** (raise `NotImplementedError`, AJAX method names documented inline):
  `get_calendar()`, `get_assignments()`.
- **Interfaces:** CLI (`python -m eclass.main <command>`) and Python API
  (`from eclass import EclassClient`).
- **Typed everything:** dataclasses (`Course`, `GradeReport`, `TimelineEvent`, …)
  with `.to_dict()` for JSON/DB serialization; typed exceptions
  (`AuthenticationError`, `SessionExpired`, `MoodleAPIError`, `ParseError`).

### Module layout (under `eclass/`)

| Module | Role |
|---|---|
| `auth.py` | Playwright / Microsoft SSO login; writes `state.json` |
| `ajax.py` | Generic reusable wrapper for Moodle's AJAX API |
| `parser.py` | HTML scraping (grade report, sesskey, userid) |
| `client.py` | Session management + public API |
| `models.py` | Typed dataclasses |
| `exceptions.py` | Typed errors |

### Extending it (repeatable 3-step pattern)

1. Watch the browser network tab for the Moodle AJAX method name.
2. Add a one-method wrapper on the client calling the generic AJAX helper.
3. Add a dataclass for the result. (HTML scraping only when no AJAX exists.)

### Hard constraints to design around

- **Interactive first login / re-login.** Nothing that touches eClass can be
  fully unattended forever. Any scheduled component must detect
  `SessionExpired` / `AuthenticationError`, pause gracefully, and **notify
  Alden via ntfy to re-authenticate** rather than crash or retry-loop.
  Session lifetime is unmeasured — instrument this early (log session age at
  expiry) to inform scheduling.
- **`state.json` is a live credential.** Gitignore it, never sync it to any
  shared/cloud location, store securely. It grants full access to Alden's
  eClass account.
- **Personal scope only.** One user's own account. No web-service token, no
  admin API.
- **Deps:** Python 3.10+, Playwright (+ Chromium), requests, BeautifulSoup.
- Base URL: `https://eclass.e.southern.edu`.

---

## 3. System Architecture (target for Phase 1, designed for Phases 2–4)

Two deployment zones, by design:

### Zone A — Local (Alden's Mac, later a dedicated server)

Anything touching `state.json` / eClass **must stay local**. Cloud functions
cannot do interactive SSO and must never hold the session cookie.

- **eClass Sync Agent** (Python): scheduled job (launchd on macOS now; cron/
  systemd or Docker later) that:
  1. Calls `get_grades()` per course + `get_timeline()`.
  2. Diffs against the last stored snapshot (`.to_dict()` comparison).
  3. On change: writes the new snapshot + pushes the delta to the Hub's
     backend (Supabase) and fires an ntfy notification ("New grade in CPTR-124:
     92% on Lab 6").
  4. On auth failure: ntfy alert asking for manual re-login; back off until done.
- **ntfy**: start with the public ntfy.sh instance using a long random topic
  name (topic names are effectively passwords — generate accordingly); Phase 2
  moves to a self-hosted ntfy server.
- **Syncthing** (companion, not a dependency): syncs config, notes, and data
  backups across devices. Tool data directories should live in a synced folder
  **except** secrets like `state.json`, which stay machine-local.

### Zone B — Cloud (Netlify + Supabase), migration-ready

- **The Hub** — web dashboard (React) hosted on Netlify.
  - Tile/grid homepage; one tile per tool + at-a-glance widgets (next deadline,
    latest grade change, grocery count).
  - **Access control (MVP):** a simple login gate. Options in order of
    preference: (a) Supabase Auth with signups disabled and exactly two
    manually created users (Alden + roommate, with per-tool visibility so the
    roommate only sees shared tools), or (b) single shared password checked by
    a Netlify Function against an env var. Choose (a) — the roommate
    distinction is needed anyway for the grocery list.
  - No secrets in client code, ever. Anything secret goes through a Netlify
    Function reading env vars.
- **Supabase** — Postgres + Realtime.
  - Stores grade snapshots/history (written by the local Sync Agent via the
    service-role key, which lives only on the local machine), grocery list,
    and future tool data.
  - Realtime subscriptions power live grocery-list sync between Alden and
    roommate.
  - Row Level Security from day one: roommate's user can only read/write the
    shared tables (grocery list, later chores/expenses), not grades.

### Data flow (Phase 1)

```
eClass ──(Playwright/AJAX)──► Sync Agent (local, scheduled)
                                  │  diff snapshots
                                  ├──► Supabase (grade history, timeline)
                                  └──► ntfy ──► phones
Supabase ◄──(Realtime)──► Hub dashboard (Netlify) ◄── Alden + roommate
```

---

## 4. Standing Technical Preferences (apply to all work)

1. **Supabase projects always include:** a `schema.sql` setup file, and an
   **idempotent, versioned migration block** for every database structure
   change (e.g., numbered migrations that are safe to re-run).
2. **Netlify hosting with env-var config:** all config/secrets supplied via
   Netlify environment variables injected at build time (the established
   pattern: a `build.js` that injects values). Never hardcode values or prompt
   manual entry. Provide a `netlify.toml` and build step when needed.
3. **Self-host readiness:** prefer tech that runs identically in Docker.
   Document any Netlify/Supabase-specific coupling and its migration path
   (e.g., Supabase → self-hosted Supabase or plain Postgres later).
4. Keep secrets out of git: `.gitignore` from the first commit must cover
   `state.json`, `.env`, snapshots containing personal data if applicable.

---

## 5. Roadmap

### Phase 1 — Foundation (build now, finish by end of summer)

1. **Repo architecture** (first task for Claude Code):
   - Monorepo layout, e.g.:
     ```
     /eclass/          # existing Python client (do not restructure)
     /agent/           # sync agent: scheduler, diffing, supabase + ntfy push
     /hub/             # React dashboard (Netlify)
     /supabase/        # schema.sql + /migrations
     /docs/            # this file, ADRs, setup guides
     netlify.toml
     ```
2. **Sync Agent**: grades + timeline polling, snapshot diffing, Supabase
   writes, ntfy alerts, auth-expiry handling, launchd job for macOS.
3. **Supabase schema**: users/roles, grade_snapshots, grade_events (diffs),
   timeline_events, grocery_items. RLS policies. `schema.sql` + migration 001.
4. **Hub MVP**: login (Supabase Auth, 2 users), dashboard shell, Grades widget
   (history + latest changes), Deadlines widget (timeline), Grocery List tool
   (shared, Realtime, ntfy ping on add).
5. **Notifications settings panel** in the Hub (choose which events ping).

### Phase 2 — Self-host & harden (fall)

- Move Hub + services to a home server (Docker Compose for hub, agent,
  self-hosted ntfy). Home network only; document firewall approach.
- Implement `get_calendar()` / `get_assignments()` in the eClass client.
- Measure eClass session lifetime; tune sync schedule.

### Phase 3 — Intelligence (Ollama)

- Local Ollama instance; an "assistant" module that reads Supabase data
  (schedule, grades, habits) and generates proactive ntfy notifications
  ("3 assignments due Friday — want a study plan?").
- Small Ollama console tool in the Hub.
- Possible Claude API integration for heavier tasks (Alden has a Claude
  subscription) — keep the LLM layer provider-agnostic.

### Phase 4 — Physical interface

- 3D-printed device (small computer, e.g., Pi) connected to the system:
  status display / voice or button interface to the assistant.

### Backlog of tool ideas (build as motivation strikes)

Chore rotation (shared), expense splitter (shared), meal planner tied to
grocery list, assignment timeline visualizer, study-session logger, weather
alerts, concert tracker, Skull King stats tracker, GPA calculator fed by the
grades data, package tracker, server status monitor.

---

## 6. First Instructions to Claude Code

1. Read this document and the existing `eclass/` module before writing code.
2. Propose the repo structure and the Supabase schema (as `schema.sql` +
   migration 001) for review **before** implementing.
3. Then build in this order: Sync Agent → Supabase schema applied → Hub shell
   with auth → Grades/Deadlines widgets → Grocery list.
4. At every step, respect the constraints in §2 (auth interactivity,
   `state.json` secrecy) and the preferences in §4.
