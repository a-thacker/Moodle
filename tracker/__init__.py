"""Grades tracker for eClass.

Watches grade reports for changes: fetches every enrolled course's grades
through :class:`eclass.EclassClient`, diffs them against the last stored
snapshot, and sends a notification per course that changed.

Designed to run unattended (launchd/cron)::

    python -m tracker check

The first run just saves baselines. If the eClass session has expired, the
tracker never opens a browser — it sends a "please re-login" notification
and exits with status 2 instead (see PLAN.md for why).
"""

from .diff import GradeChange, diff_reports
from .notify import ConsoleNotifier, MacNotifier, Notifier, get_notifier
from .storage import SnapshotStore

__all__ = [
    "GradeChange",
    "diff_reports",
    "Notifier",
    "ConsoleNotifier",
    "MacNotifier",
    "get_notifier",
    "SnapshotStore",
]
