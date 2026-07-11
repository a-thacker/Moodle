"""The main eClass client — a *hybrid* Moodle client.

Two data sources sit behind one public API:

* **AJAX** (:mod:`eclass.ajax`) — Moodle's internal external functions at
  ``/lib/ajax/service.php``. Preferred whenever Moodle exposes structured
  data: courses, timeline, calendar, notifications, ...
* **HTML** (:mod:`eclass.parser`) — scraping server-rendered pages. Used
  only where no AJAX equivalent exists (currently: grade reports).

Callers never know or care which source served them — every public method
returns typed models from :mod:`eclass.models`.

Typical usage::

    from eclass import EclassClient

    client = EclassClient()
    client.login()                       # reuses state.json when valid

    for course in client.get_courses():  # AJAX
        print(course)

    report = client.get_grades(1234)     # HTML (behind the same facade)
    print(report.course_total)

    for event in client.get_timeline():  # AJAX
        print(event)
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional, TypeVar

import requests

from . import auth, parser
from .ajax import AjaxClient
from .exceptions import AuthenticationError, SessionExpired
from .models import Assignment, CalendarEvent, Course, GradeReport, TimelineEvent

logger = logging.getLogger(__name__)

T = TypeVar("T")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


class EclassClient:
    """HTTP client for eClass, authenticated via a saved browser session."""

    def __init__(
        self,
        base_url: str = auth.DEFAULT_BASE_URL,
        state_path: Path | str = auth.DEFAULT_STATE_PATH,
        auto_relogin: bool = True,
    ) -> None:
        """
        Args:
            base_url: The Moodle root URL.
            state_path: Where the Playwright storage state is persisted.
            auto_relogin: If True, an expired session mid-request triggers
                one interactive re-login and a retry instead of an error.
        """
        self.base_url = base_url.rstrip("/")
        self.state_path = Path(state_path)
        self.auto_relogin = auto_relogin

        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT

        # The AJAX layer pulls the sesskey lazily via a callable, so a
        # mid-process re-login transparently supplies the fresh key.
        self.ajax = AjaxClient(self.session, self.base_url, lambda: self.sesskey)

        # Session identity, cached after login (see _probe/_load_identity).
        self._sesskey: Optional[str] = None
        self._userid: Optional[int] = None

    # ==================================================================
    # Authentication & session management
    # ==================================================================

    def login(self, force: bool = False, interactive: bool = True) -> None:
        """Ensure this client has a valid Moodle session.

        Order of operations:
        1. Load cookies from ``state.json`` if present.
        2. Probe ``/my/`` to check the session is still alive — and cache
           the sesskey/userid straight from that same response, so no
           extra HTML fetches are needed later.
        3. Only if that fails (or ``force=True``), open a browser for an
           interactive Microsoft login, then reload the fresh cookies.

        Args:
            force: Skip the saved-session check and re-login.
            interactive: If False, never open a browser — raise
                ``SessionExpired`` instead when the saved session is
                missing or dead. For unattended/scheduled callers.
        """
        if not force and self._load_saved_cookies() and self._probe():
            logger.info("Reusing saved session from %s", self.state_path)
            return

        if not interactive:
            raise SessionExpired(
                "Saved session is missing or expired and interactive "
                "login is disabled; run `python -m eclass.main login`."
            )

        logger.info("Saved session missing or expired; starting interactive login.")
        auth.login_interactive(self.base_url, self.state_path)

        if not (self._load_saved_cookies() and self._probe()):
            raise AuthenticationError(
                "Login appeared to succeed but the saved session is not valid."
            )

    # Backwards-compatible alias.
    authenticate = login

    def logout(self) -> None:
        """End the Moodle session server-side and forget local state."""
        try:
            self.session.get(
                f"{self.base_url}/login/logout.php",
                params={"sesskey": self.sesskey},
                timeout=30,
            )
        except (requests.RequestException, SessionExpired, AuthenticationError):
            logger.warning("Server-side logout failed; clearing local state anyway.")
        self.session.cookies.clear()
        self._sesskey = None
        self._userid = None
        self.state_path.unlink(missing_ok=True)
        logger.info("Logged out; %s removed.", self.state_path)

    def _load_saved_cookies(self) -> bool:
        """Copy cookies from state.json into the requests session."""
        try:
            cookies = auth.load_state_cookies(self.state_path, self.base_url)
        except FileNotFoundError:
            return False
        if not cookies:
            return False

        self.session.cookies.clear()
        for cookie in cookies:
            self.session.cookies.set(
                cookie["name"],
                cookie["value"],
                domain=cookie.get("domain"),
                path=cookie.get("path", "/"),
            )
        return True

    def _probe(self) -> bool:
        """Check the session by loading the dashboard.

        A valid session returns HTTP 200 (a redirect means we were bounced
        to a login page). On success the sesskey and userid are cached from
        the very same response — this is the *only* place we parse session
        identity out of HTML, and it happens once per login.
        """
        self._sesskey = None
        self._userid = None
        try:
            response = self.session.get(
                f"{self.base_url}/my/", allow_redirects=False, timeout=30
            )
        except requests.RequestException as exc:
            logger.warning("Session probe failed: %s", exc)
            return False
        if response.status_code != 200:
            return False
        try:
            self._sesskey = parser.parse_sesskey(response.text)
            self._userid = parser.parse_userid(response.text)
        except parser.ParseError as exc:
            logger.warning("Probe page did not look authenticated: %s", exc)
            return False
        return True

    @property
    def sesskey(self) -> str:
        """The Moodle sesskey for this session (needed for AJAX calls)."""
        if self._sesskey is None:
            if not self._probe():
                raise SessionExpired("No valid session; call client.login() first.")
        assert self._sesskey is not None
        return self._sesskey

    @property
    def userid(self) -> int:
        """The logged-in user's Moodle id."""
        if self._userid is None:
            if not self._probe():
                raise SessionExpired("No valid session; call client.login() first.")
        assert self._userid is not None
        return self._userid

    def _with_relogin(self, operation: Callable[[], T]) -> T:
        """Run an operation; on SessionExpired, re-login once and retry."""
        try:
            return operation()
        except SessionExpired:
            if not self.auto_relogin:
                raise
            logger.info("Session expired mid-request; re-authenticating.")
            self.login(force=True)
            return operation()

    # ==================================================================
    # Low-level HTML fetching (the scraping data source)
    # ==================================================================

    def get_page(self, path: str, **params: Any) -> str:
        """GET a server-rendered Moodle page and return its HTML.

        Raises SessionExpired (after one automatic re-login attempt, when
        enabled) if Moodle redirects to a login page.
        """
        return self._with_relogin(lambda: self._get_page_once(path, params))

    def _get_page_once(self, path: str, params: dict[str, Any]) -> str:
        url = f"{self.base_url}/{path.lstrip('/')}"
        started = time.perf_counter()
        response = self.session.get(url, params=params, timeout=30)
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.debug(
            "HTML GET %s -> HTTP %d in %.0f ms",
            path,
            response.status_code,
            elapsed_ms,
        )
        response.raise_for_status()
        if "/login" in response.url or "microsoftonline" in response.url:
            raise SessionExpired("Redirected to a login page; session expired.")
        return response.text

    # ==================================================================
    # Public API
    # ==================================================================

    def get_courses(self) -> list[Course]:
        """All enrolled courses. Source: AJAX
        (``core_course_get_enrolled_courses_by_timeline_classification``).
        """
        data = self._with_relogin(
            lambda: self.ajax.call(
                "core_course_get_enrolled_courses_by_timeline_classification",
                {
                    "offset": 0,
                    "limit": 0,
                    "classification": "all",
                    "sort": "fullname",
                },
            )
        )
        return [Course.from_api(raw) for raw in data.get("courses", [])]

    def get_course(self, course_id: int) -> Course:
        """One enrolled course by id.

        Raises KeyError if the user is not enrolled in ``course_id``.
        """
        for course in self.get_courses():
            if course.id == course_id:
                return course
        raise KeyError(f"Not enrolled in a course with id {course_id}.")

    def get_grades(self, course_id: int) -> GradeReport:
        """The grade report for one course. Source: HTML.

        Moodle does not expose the user grade report through an
        AJAX-allowed external function, so this scrapes
        ``/course/user.php?mode=grade`` — callers can't tell the
        difference, which is the point of the facade.
        """
        html = self.get_page(
            "/course/user.php",
            mode="grade",
            id=course_id,
            user=self.userid,
        )
        return GradeReport(course_id=course_id, items=parser.parse_grade_report(html))

    def get_timeline(
        self,
        limit: int = 10,
        start_timestamp: Optional[int] = None,
        end_timestamp: Optional[int] = None,
    ) -> list[TimelineEvent]:
        """Upcoming action events (the dashboard "Timeline" block).

        Source: AJAX (``core_calendar_get_action_events_by_timesort``).

        Args:
            limit: Maximum number of events to return.
            start_timestamp: Unix time to start from. Defaults to midnight
                today (matching the dashboard's behavior), which includes
                anything due later today.
            end_timestamp: Unix time to stop at. Defaults to no upper bound.
        """
        if start_timestamp is None:
            midnight = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            start_timestamp = int(midnight.timestamp())

        args: dict[str, Any] = {
            "limitnum": limit,
            "timesortfrom": start_timestamp,
            "limittononsuspendedevents": True,
        }
        if end_timestamp is not None:
            args["timesortto"] = end_timestamp

        data = self._with_relogin(
            lambda: self.ajax.call(
                "core_calendar_get_action_events_by_timesort", args
            )
        )
        return [TimelineEvent.from_api(raw) for raw in data.get("events", [])]

    def get_calendar(
        self,
        year: Optional[int] = None,
        month: Optional[int] = None,
        course_id: Optional[int] = None,
    ) -> list[CalendarEvent]:
        """Calendar events. Source: AJAX.

        With no arguments, returns the "upcoming events" view — everything
        within the site-configured lookahead window
        (``core_calendar_get_calendar_upcoming_view``).

        With ``year`` and ``month``, returns every event in that month
        (``core_calendar_get_calendar_monthly_view``), including past ones.

        Args:
            year: Four-digit year (requires ``month``).
            month: Month 1-12 (requires ``year``).
            course_id: Restrict to one course. Defaults to all courses
                (Moodle's site course, id 1, means "no filter").
        """
        if (year is None) != (month is None):
            raise ValueError("Pass both year and month, or neither.")
        courseid = course_id if course_id is not None else 1

        if year is None:
            data = self._with_relogin(
                lambda: self.ajax.call(
                    "core_calendar_get_calendar_upcoming_view",
                    {"courseid": courseid, "categoryid": 0},
                )
            )
            raw_events = data.get("events", [])
        else:
            data = self._with_relogin(
                lambda: self.ajax.call(
                    "core_calendar_get_calendar_monthly_view",
                    {
                        "year": year,
                        "month": month,
                        "day": 1,
                        "courseid": courseid,
                        "categoryid": 0,
                        "includenavigation": False,
                    },
                )
            )
            raw_events = [
                event
                for week in data.get("weeks", [])
                for day in week.get("days", [])
                for event in day.get("events", [])
            ]
        return [CalendarEvent.from_api(raw) for raw in raw_events]

    def get_assignments(self, limit: int = 50) -> list[Assignment]:
        """Upcoming assignments across courses. Source: AJAX (timeline).

        ``mod_assign_get_assignments`` is not AJAX-allowed on this Moodle
        instance (it returns ``servicenotavailable``), so assignments are
        derived from timeline events with ``module == "assign"``. That
        means only assignments with a due date from today onward appear.

        Args:
            limit: Maximum number of timeline events to scan.
        """
        return [
            Assignment.from_timeline(event)
            for event in self.get_timeline(limit=limit)
            if event.module == "assign"
        ]
