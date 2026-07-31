"""The capability catalog — the single source of truth for what tools exist
and who gets them by default.

A "capability" is one gateable tool/view in the Command Center (grades, grocery,
assistant, …). Access is per-user: the `owner` role is the admin and always has
everything; every other account is a generic `user` that starts from the
`default_for_new_user` set and is then adjusted by per-user overrides (grants /
revocations) the owner sets in the People screen.

This replaces the old role-as-component model (owner/sibling/roommate each with
a bespoke dashboard). Add a new tool by appending one entry here — the rail,
the provisioning UI, and the effective-access math all read from this list.
"""

from __future__ import annotations

from dataclasses import dataclass

OWNER_ROLE = "owner"
USER_ROLE = "user"


@dataclass(frozen=True)
class Capability:
    key: str
    label: str
    icon: str  # phosphor icon name, shared with the launcher rail
    default_for_new_user: bool
    always: bool = False  # can't be revoked (e.g. settings)
    kind: str = "tool"  # "tool" = in-app view; "link" = external service
    # For kind="link": the Settings field holding the URL. The link is hidden
    # everywhere until that URL is configured on the deployment.
    url_setting: str | None = None


# Order here is the natural rail order for a brand-new user.
CAPABILITIES: tuple[Capability, ...] = (
    Capability("dashboard", "Dashboard", "ph-squares-four", default_for_new_user=True),
    Capability("planner", "Week planner", "ph-calendar-check", default_for_new_user=True),
    Capability("calendar", "Calendar", "ph-calendar-blank", default_for_new_user=False),
    Capability("notes", "Notes — Obsidian", "ph-notebook", default_for_new_user=True),
    Capability("assistant", "Assistant", "ph-sparkle", default_for_new_user=True),
    Capability("settings", "Settings", "ph-gear-six", default_for_new_user=True, always=True),
    Capability("grades", "Grades", "ph-exam", default_for_new_user=False),
    Capability("deadlines", "Deadlines", "ph-calendar-dots", default_for_new_user=False),
    Capability("grocery", "Grocery — shared", "ph-basket", default_for_new_user=False),
    Capability("scripts", "Scripts — on my Mac", "ph-terminal-window", default_for_new_user=False),
    Capability("rip", "Movie ripper", "ph-film-reel", default_for_new_user=False),
    # External services — owner grants per person; hidden until the URL is set.
    Capability("jellyfin", "Jellyfin", "ph-film-slate", default_for_new_user=False,
               kind="link", url_setting="jellyfin_url"),
    Capability("otterwiki", "Wiki", "ph-book-open-text", default_for_new_user=False,
               kind="link", url_setting="otterwiki_url"),
)

CAPABILITY_BY_KEY: dict[str, Capability] = {c.key: c for c in CAPABILITIES}


def link_url(capability: Capability, settings) -> str | None:
    """The configured URL for a link capability, or None (tool, or URL unset)."""
    if capability.kind != "link" or not capability.url_setting:
        return None
    return getattr(settings, capability.url_setting, "") or None


def available_capabilities(settings) -> tuple[Capability, ...]:
    """The catalog with unconfigured link tools removed — a link a deployment
    hasn't set a URL for shouldn't be grantable or shown anywhere."""
    return tuple(
        c for c in CAPABILITIES
        if c.kind != "link" or link_url(c, settings) is not None
    )

CAPABILITY_KEYS: frozenset[str] = frozenset(c.key for c in CAPABILITIES)
_ALWAYS: frozenset[str] = frozenset(c.key for c in CAPABILITIES if c.always)
_DEFAULT_USER: frozenset[str] = frozenset(
    c.key for c in CAPABILITIES if c.default_for_new_user
)


def default_capabilities(role: str) -> set[str]:
    """The capabilities a fresh account of this role has before any overrides."""
    if role == OWNER_ROLE:
        return set(CAPABILITY_KEYS)
    return set(_DEFAULT_USER)


def effective_capabilities(role: str, overrides: dict[str, bool]) -> set[str]:
    """Resolve a user's real capability set: role default, then per-user
    overrides, with `always` capabilities forced on. The owner is the admin and
    always has everything (overrides ignored)."""
    if role == OWNER_ROLE:
        return set(CAPABILITY_KEYS)
    caps = set(_DEFAULT_USER)
    for key, enabled in overrides.items():
        if key not in CAPABILITY_KEYS:
            continue  # ignore stale keys for tools that no longer exist
        if enabled:
            caps.add(key)
        else:
            caps.discard(key)
    return caps | _ALWAYS
