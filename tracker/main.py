"""Command-line interface for the grades tracker.

Usage (from the project root)::

    python -m tracker check            # fetch, diff, notify, save
    python -m tracker check --notify console
    python -m tracker status           # snapshots on disk + recent runs

Exit codes: 0 = ran fine (changes or not), 1 = unexpected error,
2 = eClass session expired (a human needs to run `eclass.main login`).
"""

from __future__ import annotations

import argparse
import logging
import sys

from eclass import EclassClient
from eclass.exceptions import EclassError, SessionExpired

from .diff import diff_reports
from .notify import Notifier, get_notifier
from .storage import DEFAULT_SNAPSHOT_DIR, SnapshotStore

logger = logging.getLogger(__name__)


def check(store: SnapshotStore, notifier: Notifier) -> int:
    """One fetch → diff → notify → save cycle across all courses."""
    client = EclassClient(auto_relogin=False)
    try:
        client.login(interactive=False)
    except SessionExpired:
        logger.warning("eClass session expired; asking for a manual re-login.")
        notifier.send(
            "eClass session expired",
            "Grades tracking is paused. Run: python -m eclass.main login",
        )
        store.log_run("session-expired")
        return 2

    courses = [c for c in client.get_courses() if not c.hidden]
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
            continue

        changes = diff_reports(previous.get("report", {}), report)
        if changes:
            total_changes += len(changes)
            summary = "\n".join(str(change) for change in changes)
            logger.info("%s: %d change(s)\n%s", course.shortname, len(changes), summary)
            notifier.send(f"Grades: {course.shortname}", summary)
        store.save(course.id, course.fullname, report)

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
        print("No snapshots yet. Run: python -m tracker check")
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
    cli = argparse.ArgumentParser(prog="tracker", description="eClass grades tracker")
    cli.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    cli.add_argument(
        "--snapshot-dir",
        default=DEFAULT_SNAPSHOT_DIR,
        help="where snapshots are stored (default: ./snapshots)",
    )
    sub = cli.add_subparsers(dest="command", required=True)

    check_cmd = sub.add_parser("check", help="Fetch grades, diff, notify, save")
    check_cmd.add_argument(
        "--notify",
        choices=["auto", "mac", "console"],
        default="auto",
        help="notification channel (auto = mac on macOS, else console)",
    )
    sub.add_parser("status", help="Show stored snapshots and recent runs")

    args = cli.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )

    store = SnapshotStore(args.snapshot_dir)

    if args.command == "check":
        try:
            return check(store, get_notifier(args.notify))
        except SessionExpired:
            # Session died mid-run (after the initial probe succeeded).
            get_notifier(args.notify).send(
                "eClass session expired",
                "Grades tracking is paused. Run: python -m eclass.main login",
            )
            store.log_run("session-expired-midrun")
            return 2

    if args.command == "status":
        return status(store)

    return 1


if __name__ == "__main__":
    sys.exit(main())
