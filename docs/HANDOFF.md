# eClass Client — Status Brief

*Context for planning: this is a working, self-contained Python module that
already retrieves data from Southern Adventist University's eClass (Moodle).
Treat it as a finished building block to slot into the larger project, not
something to design from scratch.*

## What it is

A **hybrid Moodle client**: it logs into eClass through Microsoft Entra ID
SSO, then pulls data by preferring Moodle's internal AJAX API and falling
back to HTML scraping only where Moodle exposes no structured endpoint.
Callers get typed Python objects, never raw HTML or JSON.

## What works today

- **Authentication** via Microsoft SSO. Playwright opens a browser once for
  a manual login (password + MFA), then saves the session cookies to
  `state.json`. Subsequent runs reuse that file with no browser — a browser
  only reopens when the session actually expires.
- **`get_courses()`** — list of enrolled courses (AJAX).
- **`get_course(id)`** — one course by id (AJAX).
- **`get_grades(course_id)`** — full grade report: assignments, grades,
  percentages, categories, feedback, course total (HTML parsing).
- **`get_timeline(limit, start, end)`** — upcoming due dates / action
  events (AJAX).
- **`logout()`** — ends the session and deletes `state.json`.
- A **CLI** (`python -m eclass.main <command>`) and a **Python API**
  (`from eclass import EclassClient`) — same features either way.

## Stubbed but not built (deliberately)

`get_calendar()` and `get_assignments()` exist as methods that raise
`NotImplementedError`, each with a note naming the exact Moodle AJAX method
to use when implemented. They're placeholders so the API surface is stable.

## How it's built (the important part for planning)

Clean separation into small modules under `eclass/`:

| Module | Role |
|---|---|
| `auth.py` | Playwright / Microsoft SSO login; writes `state.json` |
| `ajax.py` | Generic reusable wrapper for Moodle's AJAX API |
| `parser.py` | HTML scraping (grade report, sesskey, userid) |
| `client.py` | Session management + the public API everything calls |
| `models.py` | Typed dataclasses (`Course`, `GradeReport`, `TimelineEvent`, ...) |
| `exceptions.py` | `AuthenticationError`, `SessionExpired`, `MoodleAPIError`, `ParseError` |

**The extensibility story:** adding any new Moodle feature (notifications,
forums, calendar, files) is a repeatable 3-step pattern — watch the browser's
network tab for the AJAX method name, add a one-method wrapper on the client
that calls the generic AJAX helper, add a dataclass for the result. HTML
scraping is the exception, used only when Moodle has no AJAX equivalent.

## What the larger project can rely on

- **A stable interface.** Depend on `EclassClient`'s public methods; the
  HTML-vs-AJAX detail is hidden, so those internals can change without
  breaking callers.
- **Typed return values.** Every method returns dataclasses with a
  `.to_dict()` for easy JSON/serialization (useful for a database, an API,
  push notifications, etc.).
- **Self-healing sessions.** Expired sessions trigger one automatic
  re-login and retry.
- **Typed errors** to catch and branch on.

## Constraints / things to know

- **Interactive first login.** The very first login (and any re-login after
  expiry) needs a human to complete Microsoft SSO in a real browser window —
  it can't be fully headless/unattended. Anything scheduled or server-side
  in the bigger project has to account for a periodic manual re-auth. (How
  long an eClass session survives is not yet measured.)
- **`state.json` is a live credential.** It holds session cookies — treat it
  like a password, keep it gitignored, and store it securely wherever this
  runs.
- **Personal-account scope.** This reads one user's own account via their own
  browser session. No web service token, no admin/API scope, no other users.
- **Dependencies:** Playwright (+ a Chromium download), requests,
  BeautifulSoup. Python 3.10+ (uses modern type-hint syntax).
- eClass base URL: `https://eclass.e.southern.edu`.

## Likely integration points for the bigger project

- **Grades tracker:** call `get_grades()` on a schedule, diff against the
  last stored `to_dict()` snapshot to detect grade changes → push
  notification.
- **Due-date / calendar features:** `get_timeline()` already returns
  structured upcoming events; `get_calendar()` is the next method to build.
- The re-auth constraint above is the main thing to design around for any
  always-on/automated component.
