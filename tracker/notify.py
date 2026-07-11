"""Notification backends for the tracker.

A deliberately tiny protocol — ``send(title, message)`` — so new channels
(email, ntfy, Discord webhook, ...) are one small class each. The tracker
always logs to stdout regardless of which notifier is active; the notifier
is for getting a human's attention.
"""

from __future__ import annotations

import logging
import subprocess
import sys
from typing import Protocol

logger = logging.getLogger(__name__)


class Notifier(Protocol):
    def send(self, title: str, message: str) -> None: ...


class ConsoleNotifier:
    """Prints notifications; the no-dependencies fallback."""

    def send(self, title: str, message: str) -> None:
        print(f"\n*** {title} ***")
        print(message)


class MacNotifier:
    """Native macOS notification via osascript."""

    def send(self, title: str, message: str) -> None:
        # osascript takes the script as an argument, so quotes in grade
        # names must be escaped for the AppleScript string literal.
        def q(text: str) -> str:
            return text.replace("\\", "\\\\").replace('"', '\\"')

        script = f'display notification "{q(message)}" with title "{q(title)}"'
        try:
            subprocess.run(
                ["osascript", "-e", script],
                check=True,
                capture_output=True,
                timeout=10,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            logger.warning("macOS notification failed (%s); printing instead.", exc)
            ConsoleNotifier().send(title, message)


def get_notifier(name: str) -> Notifier:
    """Resolve a notifier by CLI name ('auto', 'mac', 'console')."""
    if name == "auto":
        name = "mac" if sys.platform == "darwin" else "console"
    if name == "mac":
        return MacNotifier()
    return ConsoleNotifier()
