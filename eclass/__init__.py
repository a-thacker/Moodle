"""eClass (Moodle) hybrid client for Southern Adventist University.

Authenticates via Microsoft Entra ID SSO using Playwright, then uses a
plain requests.Session for everything else — preferring Moodle's internal
AJAX API and falling back to HTML parsing where no AJAX equivalent exists.
"""

from .client import EclassClient
from .exceptions import (
    AuthenticationError,
    EclassError,
    MoodleAPIError,
    ParseError,
    SessionExpired,
)
from .models import (
    Assignment,
    CalendarEvent,
    Course,
    GradeItem,
    GradeReport,
    TimelineEvent,
)

__all__ = [
    "EclassClient",
    "EclassError",
    "AuthenticationError",
    "SessionExpired",
    "MoodleAPIError",
    "ParseError",
    "Course",
    "GradeItem",
    "GradeReport",
    "TimelineEvent",
    "CalendarEvent",
    "Assignment",
]
