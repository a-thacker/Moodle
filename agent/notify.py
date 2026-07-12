"""Notification backends for the agent.

A deliberately tiny protocol — ``send(title, message)`` — so new channels
(email, Discord webhook, ...) are one small class each. The agent always
logs to stdout regardless of which notifier is active; the notifier is for
getting a human's attention. ntfy is the project's connective tissue (it
reaches phones); mac/console are the local fallbacks.
"""

from __future__ import annotations

import logging
import subprocess
import sys
from typing import Optional, Protocol

import requests

from .config import AgentConfig

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


class NtfyNotifier:
    """Push notification via ntfy (reaches phones with the ntfy app).

    On the public ntfy.sh server the topic name is effectively the
    password — it must be a long random string and stays out of git
    (supplied via NTFY_TOPIC; see .env.example).
    """

    def __init__(self, topic: str, server: str = "https://ntfy.sh") -> None:
        self._url = f"{server.rstrip('/')}/{topic}"

    def send(self, title: str, message: str) -> None:
        try:
            response = requests.post(
                self._url,
                data=message.encode("utf-8"),
                headers={"Title": title},
                timeout=10,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            logger.warning("ntfy notification failed (%s); printing instead.", exc)
            ConsoleNotifier().send(title, message)


def get_notifier(name: str, config: Optional[AgentConfig] = None) -> Notifier:
    """Resolve a notifier by CLI name ('auto', 'ntfy', 'mac', 'console').

    'auto' prefers ntfy when a topic is configured (works anywhere the
    agent runs), then native macOS notifications, then console.
    """
    if name == "auto":
        if config is not None and config.ntfy_enabled:
            name = "ntfy"
        else:
            name = "mac" if sys.platform == "darwin" else "console"
    if name == "ntfy":
        if config is None or not config.ntfy_enabled:
            logger.warning("NTFY_TOPIC not configured; using console instead.")
            return ConsoleNotifier()
        return NtfyNotifier(config.ntfy_topic, config.ntfy_server)
    if name == "mac":
        return MacNotifier()
    return ConsoleNotifier()
