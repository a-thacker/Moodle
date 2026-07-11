"""Command-line interface for the eClass client.

Usage (from the project root)::

    python -m eclass.main login              # force a fresh Microsoft login
    python -m eclass.main courses            # list enrolled courses
    python -m eclass.main grades <courseid>  # show the grade report
    python -m eclass.main grades <courseid> --json
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

from .client import EclassClient


def _print_grades(client: EclassClient, course_id: int, as_json: bool) -> None:
    report = client.get_grades(course_id)

    if as_json:
        print(json.dumps(report.to_dict(), indent=2))
        return

    current_category = object()  # sentinel so None still prints a header
    for item in report.items:
        if item.category != current_category:
            current_category = item.category
            print(f"\n== {item.category or 'Uncategorized'} ==")
        marker = "  Σ " if item.is_total else "    "
        grade = item.grade or "-"
        pct = f"  ({item.percentage})" if item.percentage else ""
        print(f"{marker}{item.name}: {grade}{pct}")
        if item.feedback:
            print(f"        feedback: {item.feedback}")

    total = report.course_total
    if total is not None:
        print(f"\nCourse total: {total.grade or '-'} ({total.percentage or '-'})")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="eclass", description="eClass (Moodle) client")
    parser.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("login", help="Force a fresh interactive Microsoft login")
    sub.add_parser("courses", help="List enrolled courses")

    grades = sub.add_parser("grades", help="Show the grade report for a course")
    grades.add_argument("course_id", type=int)
    grades.add_argument("--json", action="store_true", help="output raw JSON")

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )

    client = EclassClient()

    if args.command == "login":
        client.authenticate(force=True)
        print("Logged in. Session saved to state.json.")
        return 0

    client.authenticate()

    if args.command == "courses":
        for course in client.get_courses():
            print(f"{course.id:>6}  {course.shortname:<20}  {course.fullname}")
        return 0

    if args.command == "grades":
        _print_grades(client, args.course_id, args.json)
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
