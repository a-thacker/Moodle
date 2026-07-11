# eClass Client

Python client for Southern's eClass (Moodle) instance. Authenticates through
Microsoft Entra ID SSO with Playwright, then does everything else over plain
HTTP with `requests`.

## Setup

```bash
pip install -r requirements.txt
playwright install chromium
```

## Usage

```bash
python -m eclass.main login              # first-time interactive Microsoft login
python -m eclass.main courses            # list enrolled courses (id, shortname, name)
python -m eclass.main grades 1234        # grade report for course 1234
python -m eclass.main grades 1234 --json # same, as JSON
```

Or from Python:

```python
from eclass import EclassClient

client = EclassClient()
client.authenticate()  # reuses state.json; only opens a browser if expired

for course in client.get_courses():
    print(course)

report = client.get_grades(course.id)
for item in report.items:
    print(item)
print(report.course_total)
```

## How it works

1. **auth.py** — opens a headed Chromium window at the Moodle login page,
   which redirects to Microsoft. You complete the login (MFA and all)
   manually. Once the browser lands back on eClass with a live session,
   the cookies are saved to `state.json`.
2. **client.py** — loads those cookies into a `requests.Session`, probes
   `/my/` to confirm the session is still alive, and only re-opens the
   browser when the Moodle session cookie has expired. It also lazily
   scrapes your `sesskey` and `userid` from the dashboard.
3. **parser.py** — turns the grade report HTML into typed objects. Cells
   are located by Moodle's `column-*` classes first and by header text
   position as a fallback, so minor theme/markup changes shouldn't break it.

Two implementation details worth knowing:

- `get_courses()` doesn't parse HTML — it calls Moodle's internal AJAX
  service (`/lib/ajax/service.php`) with your session cookie + sesskey,
  the same call the dashboard itself makes. This works without a web
  service token and returns clean JSON. The same technique unlocks a lot
  of the future features (calendar events, notifications, assignment
  lists) since most of the modern Moodle UI is driven by these AJAX
  methods.
- `get_grades()` also works with `/grade/report/user/index.php?id=<courseid>`,
  which shows your own grades without needing a userid — the parser handles
  both since they render the same table.

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
