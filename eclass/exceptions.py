"""Custom exceptions for the eClass client.

Hierarchy::

    EclassError
    ├── AuthenticationError   login flow failed / could not establish a session
    ├── SessionExpired        a previously valid session is no longer accepted
    ├── MoodleAPIError        an AJAX external function returned an error
    └── ParseError            expected structure missing from server-rendered HTML
"""

from __future__ import annotations

from typing import Optional


class EclassError(RuntimeError):
    """Base class for all eClass client errors."""


class AuthenticationError(EclassError):
    """Interactive login failed or produced an unusable session."""


class SessionExpired(EclassError):
    """The Moodle session (cookie and/or sesskey) is no longer valid."""


class MoodleAPIError(EclassError):
    """A Moodle AJAX external function reported an error."""

    def __init__(
        self,
        message: str,
        errorcode: Optional[str] = None,
        method: Optional[str] = None,
    ) -> None:
        self.errorcode = errorcode
        self.method = method
        detail = f" [{errorcode}]" if errorcode else ""
        context = f" (method: {method})" if method else ""
        super().__init__(f"{message}{detail}{context}")


class ParseError(EclassError):
    """An expected structure could not be found in server-rendered HTML."""
