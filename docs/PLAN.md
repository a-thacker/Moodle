# Project Plan — eClass Companion

*The larger project the `eclass/` client was built for: a personal tool that
watches eClass on your behalf and tells you when something changes — new
grades, feedback, upcoming due dates — without you opening Moodle.*

## The shape of the system

```
            ┌─────────────────────────────────────────────┐
            │                 scheduler                   │  launchd / cron:
            │        runs `python -m tracker check`       │  every N hours
            └──────────────────────┬──────────────────────┘
                                   │
            ┌──────────────────────▼──────────────────────┐
            │              tracker (new code)             │
            │                                             │
            │  fetch ──► snapshot store ──► diff ──► notify│
            │  (client)   (JSON on disk)   (engine)  (mac/ │
            │                                       console)│
            └──────────────────────┬──────────────────────┘
                                   │ typed models only
            ┌──────────────────────▼──────────────────────┐
            │            eclass/ (finished)               │
            │   EclassClient — SSO auth, AJAX + HTML      │
            └─────────────────────────────────────────────┘
```

Four components, one new package:

| Component | Where | Role |
|---|---|---|
| Data access | `eclass/` (done) | The existing client. Only its public methods are used. |
| Snapshot store | `tracker/storage.py` | Persists the last-seen `to_dict()` of each course's grade report as JSON under `snapshots/`. Human-readable, diffable, trivially debuggable. |
| Diff engine | `tracker/diff.py` | Compares the fresh grade report against the stored snapshot and emits typed change events: item newly graded, grade changed, feedback added, course total moved. |
| Notifier | `tracker/notify.py` | Small protocol with two implementations to start: console output and native macOS notifications (`osascript`). Email/push (e.g. ntfy) can be added later behind the same interface. |
| CLI / orchestration | `tracker/main.py` | `python -m tracker check` does one fetch→diff→notify→save cycle across all enrolled courses. First run saves baselines silently. |

## The design constraint that shapes everything: manual re-auth

The eClass session in `state.json` eventually expires, and renewing it
requires a human completing Microsoft SSO in a real browser. An unattended
scheduled job must therefore **never** trigger the interactive login (it
would open a browser on a machine nobody is looking at, or hang).

Design response:

- The tracker constructs the client with `auto_relogin=False`.
- On `SessionExpired`, the tracker sends a notification — *"eClass session
  expired — run `python -m eclass.main login`"* — and exits cleanly. The
  human re-auths once; the next scheduled run resumes normally.
- Every successful run appends a timestamped line to `snapshots/runs.log`.
  Over time the gap between "state.json created" and "first SessionExpired"
  measures the real session lifetime — the open question the handoff
  flagged — which then informs how often re-auth is actually needed.

## Grades tracker cycle (`tracker check`)

1. `client.login()` (cookie reuse only — see above).
2. `get_courses()` → for each visible course, `get_grades(course.id)`.
3. Load `snapshots/grades-<course_id>.json` if it exists.
4. Diff: match grade items by name+category; report changed `grade`,
   `percentage`, or `feedback`, newly appearing items with a grade, and
   course-total movement.
5. Notify once per course with a compact summary of its changes.
6. Overwrite the snapshot with the fresh report (only after a successful
   diff, so a crash never loses the baseline).
7. A course fetch that fails (e.g. `ParseError` on one course) is logged
   and skipped — one bad grade page must not abort the whole run.

## Due dates / calendar

`get_timeline()` already returns upcoming events, and `get_calendar()` /
`get_assignments()` are being implemented now (see below). A later
`tracker remind` command can notify about items due within N hours — same
storage/notify machinery, so it's cheap to add once grades tracking works.

## Client stubs — implementation notes (verified live, 2026-07-11)

- `get_calendar()`: `core_calendar_get_calendar_upcoming_view` **is**
  AJAX-allowed on this instance, as is
  `core_calendar_get_calendar_monthly_view` (events live under
  `weeks[].days[].events[]`). Implemented with the upcoming view as the
  default and an optional monthly mode.
- `get_assignments()`: `mod_assign_get_assignments` is **not** AJAX-allowed
  here (`servicenotavailable`), so assignments are derived from timeline
  events with `module == "assign"` — the fallback the stub already named.

## Scheduling (macOS)

`launchd` is the native choice (survives sleep better than cron). A
`StartInterval` job every ~4 hours during semester is plenty:

```xml
<!-- ~/Library/LaunchAgents/edu.southern.eclass-tracker.plist -->
<key>ProgramArguments</key>
<array>
  <string>/path/to/.venv/bin/python</string>
  <string>-m</string><string>tracker</string><string>check</string>
</array>
<key>StartInterval</key><integer>14400</integer>
<key>WorkingDirectory</key><string>/path/to/Moodle</string>
```

## Security

- `state.json` and `snapshots/` both contain personal data; both stay
  gitignored. Nothing in the tracker logs cookies, sesskeys, or raw pages.
- Everything continues to run as one user against their own account.

## Build order

1. ✅ eClass client (done — see HANDOFF.md).
2. `get_calendar()` + `get_assignments()` (small, unblocks due-date work).
3. `tracker/` grades tracker (storage → diff → notify → CLI).
4. Later: `tracker remind` for due dates; ntfy/email notifier; measured
   session lifetime → tuned schedule.
