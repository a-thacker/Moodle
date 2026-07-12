# Personal Command Center

A modular dashboard of personal tools for daily life — grades, deadlines,
a shared grocery list, notifications, and more over time. Full vision and
roadmap: `docs/PROJECT_HANDOFF.md`.

| Piece | What it is |
|---|---|
| `eclass/` | Python client for Southern's eClass (Moodle) — docs below |
| `agent/` | Local sync agent: polls eClass, diffs grades, notifies (ntfy/macOS), pushes to Supabase |
| `hub/` | React dashboard on Netlify: login, grades + deadlines widgets, shared grocery list |
| `supabase/` | Database schema + migrations (Postgres, RLS, Realtime) |
| `docs/` | Project handoff, architecture notes |

## Cloud setup (one-time)

1. **Supabase:** create a project → SQL editor → run
   `supabase/migrations/001_initial_schema.sql`. In Auth settings disable
   signups, create the two users, and insert their `profiles` rows (see the
   comment in the SQL). Grab the URL + anon key + service-role key.
2. **Agent:** `cp .env.example .env`, fill in `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, and a long random `NTFY_TOPIC` (subscribe to
   it in the ntfy phone app). Schedule with
   `agent/launchd/edu.southern.command-center.agent.plist`.
3. **Hub:** push to GitHub, connect the repo in Netlify (`netlify.toml` does
   the rest), set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in the
   site's env vars. Local dev: `cd hub && cp .env.example .env && npm
   install && npm run dev`.

The service-role key stays in `.env` on this machine only — it never goes
to Netlify or into `hub/` code.

---

# eClass Client

A hybrid Python client for Southern's eClass (Moodle) instance. It
authenticates through Microsoft Entra ID SSO with Playwright, then does
everything else over plain HTTP — preferring Moodle's internal AJAX API and
falling back to HTML scraping only where Moodle doesn't expose structured
data.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
```

## Usage

```bash
python -m eclass.main login              # first-time interactive Microsoft login
python -m eclass.main courses            # list enrolled courses
python -m eclass.main grades 1234        # grade report for course 1234
python -m eclass.main timeline           # upcoming due dates
python -m eclass.main timeline --limit 20 --json
python -m eclass.main calendar           # upcoming calendar events
python -m eclass.main calendar --year 2026 --month 4
python -m eclass.main assignments        # upcoming assignments
python -m eclass.main logout             # end session, delete state.json
python -m eclass.main -v courses         # debug logging (endpoint, timing, source)
```

## Sync agent

The `agent/` package watches for grade changes. It fetches every visible
course's grade report, diffs it against the last snapshot in `snapshots/`,
notifies about anything new (ntfy when configured, else macOS/console),
and — with Supabase configured in `.env` — pushes courses, grade history,
change events, and the upcoming timeline for the Hub to display:

```bash
python -m agent check              # fetch, diff, notify, save, push
python -m agent check --notify console
python -m agent status             # stored snapshots + recent runs
```

The first run silently saves baselines. The agent never opens a browser:
if the eClass session has expired it sends a "please re-login" notification
and exits with code 2 — run `python -m eclass.main login` and the next
scheduled run picks up where it left off. A failed Supabase push logs a
warning but never aborts the local run.

Or from Python:

```python
from eclass import EclassClient

client = EclassClient()
client.login()  # reuses state.json; only opens a browser if expired

for course in client.get_courses():      # AJAX
    print(course)

report = client.get_grades(course.id)    # HTML, behind the same facade
print(report.course_total)

for event in client.get_timeline(limit=10):  # AJAX
    print(event)
```

## Architecture

```
                 ┌────────────────────────────────────┐
                 │            EclassClient            │  public API: typed models only
                 └───────┬──────────────────┬─────────┘
                         │                  │
                  AJAX source          HTML source
                 (eclass/ajax.py)    (client.get_page +
                         │            eclass/parser.py)
                         │                  │
                 /lib/ajax/service.php   server-rendered pages
                         │                  │
                 ┌───────┴──────────────────┴─────────┐
                 │   requests.Session (cookies from   │
                 │   Playwright's saved state.json)   │
                 └───────────────┬────────────────────┘
                                 │
                        eclass/auth.py — Playwright,
                        interactive Microsoft SSO
```

| Module | Responsibility |
|---|---|
| `auth.py` | Interactive Microsoft SSO via Playwright; persists `state.json` |
| `ajax.py` | Generic wrapper for Moodle external functions (`AjaxClient`) |
| `parser.py` | HTML extraction (sesskey, userid, grade report) |
| `client.py` | Session management + the public API facade |
| `models.py` | Typed dataclasses (`Course`, `GradeReport`, `TimelineEvent`, ...) |
| `exceptions.py` | `AuthenticationError`, `SessionExpired`, `MoodleAPIError`, `ParseError` |

### Authentication flow

1. `client.login()` loads cookies from `state.json` into `requests.Session`.
2. It probes `/my/` with redirects disabled: HTTP 200 means the session is
   alive; a redirect means it isn't. The **same probe response** is parsed
   once for `sesskey` and `userid`, which are then cached — session identity
   is never re-scraped from HTML unless the session changes.
3. Only if the probe fails does Playwright open a headed browser for the
   interactive Microsoft login, after which fresh cookies are saved and the
   probe repeats.
4. With `auto_relogin=True` (default), any request that hits an expired
   session triggers exactly one interactive re-login and one retry.

### The AJAX helper

`AjaxClient.call(method, args)` POSTs to `/lib/ajax/service.php` with the
sesskey and `info` query parameters, serializes the
`[{"index": 0, "methodname": ..., "args": ...}]` payload, validates the
response, and returns just the `data` payload. Moodle errors become typed
exceptions: session-related error codes (`invalidsesskey`,
`servicerequireslogin`, ...) raise `SessionExpired` (which the client can
recover from automatically); everything else raises `MoodleAPIError` with
the errorcode attached. `call_many([...])` batches several functions into
one HTTP request.

The sesskey is supplied by a *callable*, not a stored value, so a re-login
mid-process transparently feeds the new key into subsequent calls.

### How HTML and AJAX are combined

Every public method returns model objects; callers never see which source
served them. Current mapping:

| Method | Source | Why |
|---|---|---|
| `get_courses()` | AJAX `core_course_get_enrolled_courses_by_timeline_classification` | Clean JSON, same call the dashboard makes |
| `get_course(id)` | AJAX (filters `get_courses`) | |
| `get_grades(id)` | **HTML** `/course/user.php?mode=grade` | Moodle exposes no AJAX-allowed grade-report function |
| `get_timeline()` | AJAX `core_calendar_get_action_events_by_timesort` | |
| `get_calendar()` | AJAX `core_calendar_get_calendar_upcoming_view` (or `..._monthly_view` with year/month) | |
| `get_assignments()` | AJAX (derived from timeline, `module == "assign"`) | `mod_assign_get_assignments` is not AJAX-allowed on this instance |

### Adding a new Moodle method

1. Do the action in the browser with DevTools open; find the
   `service.php?...&info=<methodname>` request and copy its args.
2. Add a wrapper on `EclassClient`:

   ```python
   def get_notifications(self) -> list[Notification]:
       data = self._with_relogin(lambda: self.ajax.call(
           "message_popup_get_popup_notifications",
           {"useridto": self.userid, "limit": 20, "offset": 0},
       ))
       return [Notification.from_api(raw) for raw in data.get("notifications", [])]
   ```

3. Add a dataclass in `models.py` with a defensive `from_api()`.

That's the whole pattern. Wrap AJAX calls in `self._with_relogin(...)` so
expired sessions self-heal, and only fall back to `self.get_page(...)` +
a parser when no external function exists.

### Logging

`-v` on the CLI (or `logging.basicConfig(level=logging.DEBUG)` in code)
logs each request's source (`AJAX`/`HTML GET`), methodname or path, HTTP
status, and elapsed time. Cookies, sesskey values, and response bodies are
never logged.

## Security notes

- `state.json` contains your live session cookies — treat it like a
  password. It's in `.gitignore`; keep it that way.
- Everything runs against your own account with your own session; there is
  no stored password and no token with elevated scope.

## Debugging parse failures

If `parse_grade_report` raises, dump the raw page and look at the table:

```python
html = client.get_page("/course/user.php", mode="grade", id=1234, user=client.userid)
open("debug.html", "w").write(html)
```

Usually only a selector or a header alias in `parser._COLUMNS` needs a tweak.
