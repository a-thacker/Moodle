"""The eClass Sync Agent — the local half of the Personal Command Center.

Runs on a schedule (launchd), polls eClass through
:class:`eclass.EclassClient`, diffs grade reports against local snapshots,
and fans the results out: notifications (ntfy/macOS/console) for a human,
and Supabase writes (courses, grade history, change events, upcoming
timeline) for the Hub dashboard to read.

    python -m agent check

Everything cloud-side is optional and env-configured (see .env.example);
unconfigured, this is a fully local grades tracker. The agent never opens
a browser: an expired eClass session becomes a "please re-login"
notification and exit code 2 (see docs/PROJECT_HANDOFF.md §2).
"""

from .backend_push import BackendWriter
from .config import AgentConfig
from .diff import GradeChange, diff_reports
from .notify import ConsoleNotifier, MacNotifier, Notifier, NtfyNotifier, get_notifier
from .storage import SnapshotStore
from .supabase_push import SupabaseWriter

__all__ = [
    "AgentConfig",
    "BackendWriter",
    "GradeChange",
    "diff_reports",
    "Notifier",
    "ConsoleNotifier",
    "MacNotifier",
    "NtfyNotifier",
    "get_notifier",
    "SnapshotStore",
    "SupabaseWriter",
]
