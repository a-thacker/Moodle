"""eClass (Moodle) client for Southern Adventist University.

Authenticates via Microsoft Entra ID SSO using Playwright, then uses a
plain requests.Session with the saved cookies for fast HTTP access.
"""

from .client import EclassClient, SessionExpiredError
from .models import Course, GradeItem, GradeReport

__all__ = ["EclassClient", "SessionExpiredError", "Course", "GradeItem", "GradeReport"]
