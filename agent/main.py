"""Command-line interface for the sync agent.

Usage (from the project root)::

    python -m agent check            # fetch, diff, notify, save, push
    python -m agent check --notify console
    python -m agent status           # snapshots on disk + recent runs

Configuration comes from the environment / a `.env` file (see
.env.example): with Supabase configured, each run also pushes courses,
grade history, grade change events, and the upcoming-timeline mirror to
the Hub's database; with NTFY_TOPIC configured, notifications go to your
phone. With neither, the agent is the original fully-local tracker.

Exit codes: 0 = ran fine (changes or not), 1 = unexpected error,
2 = eClass session expired (a human needs to run `eclass.main login`).
"""

from __future__ import annotations

import argparse
import logging
import sys
from typing import Optional

import requests

from eclass import EclassClient
from eclass.exceptions import EclassError, SessionExpired

from .config import AgentConfig
from .diff import diff_reports
from .notify import Notifier, get_notifier
from .storage import DEFAULT_SNAPSHOT_DIR, SnapshotStore
from .supabase_push import SupabaseWriter

logger = logging.getLogger(__name__)


def _push(description: str, operation) -> bool:
    """Run one Supabase write; a failed push warns but never aborts the run."""
    try:
        operation()
        return True
    except requests.RequestException as exc:
        logger.warning("Supabase push failed (%s): %s", description, exc)
        return False


def check(
    store: SnapshotStore,
    notifier: Notifier,
    supabase: Optional[SupabaseWriter] = None,
) -> int:
    """One fetch → diff → notify → save → push cycle across all courses."""
    client = EclassClient(auto_relogin=False)
    try:
        client.login(interactive=False)
    except SessionExpired:
        logger.warning("eClass session expired; asking for a manual re-login.")
        notifier.send(
            "eClass session expired",
            "Sync is paused. Run: python -m eclass.main login",
        )
        store.log_run("session-expired")
        return 2

    courses = [c for c in client.get_courses() if not c.hidden]
    if supabase is not None:
        _push("courses", lambda: supabase.upsert_courses(courses))

    checked = 0
    baselined = 0
    total_changes = 0

    for course in courses:
        try:
            report = client.get_grades(course.id).to_dict()
        except SessionExpired:
            raise  # handled by main(); don't swallow into the per-course skip
        except EclassError as exc:
            # One unparseable grade page must not abort the whole run.
            logger.warning("Skipping %s: %s", course.shortname, exc)
            continue
        checked += 1

        previous = store.load(course.id)
        if previous is None:
            store.save(course.id, course.fullname, report)
            baselined += 1
            logger.info("Baseline saved for %s.", course.shortname)
            if supabase is not None:
                _push(
                    f"baseline {course.id}",
                    lambda: supabase.insert_snapshot(course.id, report),
                )
            continue

        changes = diff_reports(previous.get("report", {}), report)
        if changes:
            total_changes += len(changes)
            summary = "\n".join(str(change) for change in changes)
            logger.info("%s: %d change(s)\n%s", course.shortname, len(changes), summary)
            notifier.send(f"Grades: {course.shortname}", summary)
            if supabase is not None:
                _push(
                    f"snapshot {course.id}",
                    lambda: supabase.insert_snapshot(course.id, report),
                )
                _push(
                    f"events {course.id}",
                    lambda: supabase.insert_grade_events(course.id, changes),
                )
        store.save(course.id, course.fullname, report)

    # Mirror "what's upcoming" for the Hub's Deadlines widget.
    if supabase is not None:
        try:
            timeline = client.get_timeline(limit=50)
        except EclassError as exc:
            logger.warning("Timeline fetch failed: %s", exc)
        else:
            if _push("timeline", lambda: supabase.replace_timeline(timeline)):
                logger.info("Timeline mirrored: %d upcoming event(s).", len(timeline))

    store.log_run(
        f"checked={checked} baselined={baselined} changes={total_changes}"
    )
    print(
        f"Checked {checked} course(s): "
        f"{baselined} baselined, {total_changes} change(s)."
    )
    return 0


def status(store: SnapshotStore) -> int:
    snapshots = store.list_snapshots()
    if not snapshots:
        print("No snapshots yet. Run: python -m agent check")
    for snap in snapshots:
        print(
            f"{snap['course_id']:>6}  {snap['fetched_at']}  "
            f"{snap['items']:>3} items  {snap['course_name']}"
        )
    recent = store.read_run_log()
    if recent:
        print("\nRecent runs:")
        for line in recent:
            print(f"  {line}")
    return 0


def main(argv: list[str] | None = None) -> int:
    cli = argparse.ArgumentParser(
        prog="agent", description="Personal Command Center sync agent"
    )
    cli.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    cli.add_argument(
        "--snapshot-dir",
        default=DEFAULT_SNAPSHOT_DIR,
        help="where snapshots are stored (default: ./snapshots)",
    )
    sub = cli.add_subparsers(dest="command", required=True)

    check_cmd = sub.add_parser(
        "check", help="Fetch grades, diff, notify, save, push to Supabase"
    )
    check_cmd.add_argument(
        "--notify",
        choices=["auto", "ntfy", "mac", "console"],
        default="auto",
        help="notification channel (auto = ntfy if configured, else mac/console)",
    )
    sub.add_parser("status", help="Show stored snapshots and recent runs")

    args = cli.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )

    store = SnapshotStore(args.snapshot_dir)
    config = AgentConfig.from_env()

    if args.command == "check":
        notifier = get_notifier(args.notify, config)
        supabase = None
        if config.supabase_enabled:
            supabase = SupabaseWriter(
                config.supabase_url, config.supabase_service_role_key
            )
        else:
            logger.info("Supabase not configured; running local-only.")
        try:
            return check(store, notifier, supabase)
        except SessionExpired:
            # Session died mid-run (after the initial probe succeeded).
            notifier.send(
                "eClass session expired",
                "Sync is paused. Run: python -m eclass.main login",
            )
            store.log_run("session-expired-midrun")
            return 2

    if args.command == "status":
        return status(store)

    return 1


if __name__ == "__main__":
    sys.exit(main())
