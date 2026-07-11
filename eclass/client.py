"""The main eClass client.

Orchestrates the three layers:

* :mod:`eclass.auth`   — interactive Microsoft SSO login via Playwright
* ``requests.Session`` — fast HTTP using the saved browser cookies
* :mod:`eclass.parser` — HTML/JS extraction into typed models

Typical usage::

    from eclass.client import EclassClient

    client = EclassClient()
    client.authenticate()          # only opens a browser if needed

    for course in client.get_courses():
        print(course)

    report = client.get_grades(course_id=1234)
    print(report.course_total)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

import requests

from . import auth, parser
from .models import Course, GradeItem, GradeReport

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


class SessionExpiredError(RuntimeError):
    """Raised when the Moodle session is no longer valid."""


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

        # Lazily discovered from the dashboard page.
        self._sesskey: Optional[str] = None
        self._userid: Optional[int] = None

    # ------------------------------------------------------------------
    # Authentication
    # ------------------------------------------------------------------

    def authenticate(self, force: bool = False) -> None:
        """Ensure this client has a valid Moodle session.

        Order of operations:
        1. Load cookies from ``state.json`` if present.
        2. Probe ``/my/`` to check the session is still alive.
        3. Only if that fails (or ``force=True``), open a browser for an
           interactive Microsoft login, then reload the fresh cookies.
        """
        if not force and self._load_saved_cookies() and self._session_valid():
            logger.info("Reusing saved session from %s", self.state_path)
            return

        logger.info("Saved session missing or expired; starting interactive login.")
        auth.login_interactive(self.base_url, self.state_path)

        self._reset_cached_identity()
        if not (self._load_saved_cookies() and self._session_valid()):
            raise auth.AuthError(
                "Login appeared to succeed but the saved session is not valid."
            )

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

    def _session_valid(self) -> bool:
        """True if the dashboard loads without redirecting to a login page."""
        try:
            response = self.session.get(
                f"{self.base_url}/my/", allow_redirects=False, timeout=30
            )
        except requests.RequestException as exc:
            logger.warning("Session probe failed: %s", exc)
            return False
        return response.status_code == 200

    def _reset_cached_identity(self) -> None:
        self._sesskey = None
        self._userid = None

    # ------------------------------------------------------------------
    # Low-level HTTP
    # ------------------------------------------------------------------

    def get_page(self, path: str, **params: Any) -> str:
        """GET a Moodle page and return its HTML.

        Detects session expiry (redirect to a login page) and, when
        ``auto_relogin`` is enabled, re-authenticates once and retries.
        """
        html = self._get_page_once(path, params)
        if html is not None:
            return html

        if not self.auto_relogin:
            raise SessionExpiredError("Moodle session has expired.")

        logger.info("Session expired mid-request; re-authenticating.")
        self.authenticate(force=True)
        html = self._get_page_once(path, params)
        if html is None:
            raise SessionExpiredError("Session still invalid after re-login.")
        return html

    def _get_page_once(self, path: str, params: dict[str, Any]) -> Optional[str]:
        """Returns HTML, or None if the response looks like a login redirect."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        response = self.session.get(url, params=params, timeout=30)
        response.raise_for_status()
        final_url = response.url
        if "/login" in final_url or "microsoftonline" in final_url:
            return None
        return response.text

    # ------------------------------------------------------------------
    # Identity (sesskey / userid)
    # ------------------------------------------------------------------

    def _load_identity(self) -> None:
        html = self.get_page("/my/")
        self._sesskey = parser.parse_sesskey(html)
        self._userid = parser.parse_userid(html)
        logger.debug("Discovered userid=%s", self._userid)

    @property
    def sesskey(self) -> str:
        """The Moodle sesskey for this session (needed for AJAX calls)."""
        if self._sesskey is None:
            self._load_identity()
        assert self._sesskey is not None
        return self._sesskey

    @property
    def userid(self) -> int:
        """The logged-in user's Moodle id."""
        if self._userid is None:
            self._load_identity()
        assert self._userid is not None
        return self._userid

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_courses(self) -> list[Course]:
        """Return all courses the user is enrolled in.

        Uses Moodle's internal AJAX service (the same one the dashboard's
        course overview block calls). It authenticates with the session
        cookie + sesskey, so no web service token is needed, and it returns
        clean JSON instead of HTML.
        """
        payload = [
            {
                "index": 0,
                "methodname": "core_course_get_enrolled_courses_by_timeline_classification",
                "args": {
                    "offset": 0,
                    "limit": 0,
                    "classification": "all",
                    "sort": "fullname",
                },
            }
        ]
        url = f"{self.base_url}/lib/ajax/service.php"
        response = self.session.post(
            url,
            params={
                "sesskey": self.sesskey,
                "info": payload[0]["methodname"],
            },
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        if not isinstance(data, list) or not data or data[0].get("error"):
            detail = json.dumps(data)[:500]
            raise RuntimeError(f"Course list AJAX call failed: {detail}")

        courses: list[Course] = []
        for raw in data[0]["data"].get("courses", []):
            courses.append(
                Course(
                    id=int(raw["id"]),
                    shortname=raw.get("shortname", ""),
                    fullname=raw.get("fullname", ""),
                    category=raw.get("coursecategory"),
                    url=raw.get("viewurl"),
                    progress=raw.get("progress"),
                    hidden=bool(raw.get("hidden", False)),
                )
            )
        return courses

    def get_grades(self, course_id: int) -> GradeReport:
        """Return the parsed grade report for one course."""
        html = self.get_page(
            "/course/user.php",
            mode="grade",
            id=course_id,
            user=self.userid,
        )
        items: list[GradeItem] = parser.parse_grade_report(html)
        return GradeReport(course_id=course_id, items=items)
