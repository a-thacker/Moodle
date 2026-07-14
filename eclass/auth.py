"""Authentication for eClass via Microsoft Entra ID SSO.

The flow is unchanged from the original design:

1. Launch a *headed* Playwright browser.
2. Navigate to the Moodle login page, which redirects to Microsoft.
3. The user completes the Microsoft login (password, MFA, etc.) manually.
4. Once we land back on eClass with a valid session, save the browser's
   storage state (cookies) to ``state.json``.

Everything after that is plain HTTP with ``requests`` — Playwright is only
needed again when the Moodle session cookie expires.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from .exceptions import AuthenticationError

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://eclass.e.southern.edu"
DEFAULT_STATE_PATH = Path("state.json")

# How long to wait (ms) for the user to finish the Microsoft login flow.
LOGIN_TIMEOUT_MS = 5 * 60 * 1000


def login_interactive(
    base_url: str = DEFAULT_BASE_URL,
    state_path: Path = DEFAULT_STATE_PATH,
) -> None:
    """Open a browser, let the user log in via Microsoft SSO, save state.

    Blocks until the browser lands back on eClass with an authenticated
    session (or the timeout expires). Writes cookies/localStorage to
    ``state_path``.
    """
    # Imported here so the rest of the package works without Playwright
    # installed (e.g. when a saved session is still valid).
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
    from playwright.sync_api import sync_playwright

    base_url = base_url.rstrip("/")

    def _back_on_moodle(url: str) -> bool:
        """True once the browser is on eClass and past the login flow."""
        return (
            url.startswith(base_url)
            and "/login" not in url
            and "microsoftonline" not in url
        )

    logger.info("Launching browser for interactive Microsoft login...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        # Hitting the login page triggers the redirect to Microsoft.
        page.goto(f"{base_url}/login/index.php")

        print("\n>>> Complete the Microsoft login in the browser window.")
        print('>>> Tip: choose "Yes" on "Stay signed in?" — it makes future')
        print(">>>      re-logins faster (no password/MFA each time).")
        print(">>> This window will close automatically once you're in.\n")

        try:
            # Wait until we're redirected back to Moodle post-SSO...
            page.wait_for_url(_back_on_moodle, timeout=LOGIN_TIMEOUT_MS)
            # ...and the page has actually rendered a logged-in session.
            # M.cfg with a sesskey only appears for authenticated pages.
            page.wait_for_function(
                "() => window.M && M.cfg && M.cfg.sesskey",
                timeout=60_000,
            )
        except PlaywrightTimeout as exc:
            browser.close()
            raise AuthenticationError(
                "Timed out waiting for Microsoft login to complete."
            ) from exc

        context.storage_state(path=str(state_path))
        browser.close()

    logger.info("Login successful; session saved to %s", state_path)


def load_state_cookies(
    state_path: Path = DEFAULT_STATE_PATH,
    base_url: str = DEFAULT_BASE_URL,
) -> list[dict[str, Any]]:
    """Read cookies from a Playwright ``state.json``.

    Returns only cookies scoped to the eClass domain (we don't need — and
    shouldn't carry around — the Microsoft cookies for plain Moodle
    requests).

    Raises FileNotFoundError if the state file doesn't exist.
    """
    raw = json.loads(Path(state_path).read_text(encoding="utf-8"))
    host = base_url.split("//", 1)[-1].rstrip("/")
    cookies: list[dict[str, Any]] = []
    for cookie in raw.get("cookies", []):
        domain = cookie.get("domain", "").lstrip(".")
        if host.endswith(domain) or domain.endswith(host):
            cookies.append(cookie)
    return cookies
