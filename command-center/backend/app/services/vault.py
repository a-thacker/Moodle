"""Obsidian vault hub — git sync + markdown reads.

The backend never edits a vault: it clones/pulls each registered git repo into
a data volume and reads the `.md` files from disk. Postgres holds only the
registration + sync status (see app.models.vault). The vault's source of truth
is git / Obsidian on the Mac.

Sync uses dulwich (pure-Python git — no `git` binary needed in the slim image).
Each sync is a fresh shallow clone into a temp dir that atomically replaces the
old checkout only on success, so a failed pull (bad URL/auth/network) never
destroys a good copy. Vaults are text, so a re-clone is cheap.
"""

from __future__ import annotations

import asyncio
import io
import logging
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from dulwich import porcelain
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import SessionFactory
from app.models.vault import VaultRepo

logger = logging.getLogger(__name__)

# Directories that are Obsidian/git plumbing, never notes.
_SKIP_DIRS = {".git", ".obsidian", ".trash", ".stfolder"}
_MAX_NOTE_BYTES = 1_000_000  # don't slurp a runaway file into a response


# --- Paths ---------------------------------------------------------------
def _clone_dir(vault_id: int) -> Path:
    return Path(get_settings().vault_data_dir) / str(vault_id)


def _vault_root(vault: VaultRepo) -> Path:
    """The folder to read notes from — the checkout, plus any configured
    subpath within the repo."""
    root = _clone_dir(vault.id)
    sub = (vault.subpath or "").strip().strip("/")
    return (root / sub) if sub else root


def _remote_with_token(url: str, token: str) -> str:
    """Splice a PAT into an https remote for private repos. Left untouched for
    ssh remotes (which use a key) or when no token is configured."""
    if token and url.startswith("https://"):
        return url.replace("https://", f"https://x-access-token:{token}@", 1)
    return url


# --- Git sync (blocking; call via asyncio.to_thread) ---------------------
def _clone_fresh(url: str, branch: str, dest: Path, token: str) -> None:
    remote = _remote_with_token(url, token)
    tmp = dest.with_name(dest.name + ".tmp")
    if tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)
    tmp.parent.mkdir(parents=True, exist_ok=True)
    # dulwich streams clone progress to these; route it to a throwaway buffer so
    # it never floods the app logs.
    devnull = io.BytesIO()
    try:
        porcelain.clone(
            remote,
            target=str(tmp),
            branch=branch.encode() if branch else None,
            depth=1,
            checkout=True,
            errstream=devnull,
            outstream=devnull,
        )
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    # Swap in the new checkout only after a clean clone.
    if dest.exists():
        shutil.rmtree(dest, ignore_errors=True)
    tmp.rename(dest)


def _count_notes(root: Path) -> int:
    return sum(1 for _ in _iter_md(root))


def _iter_md(root: Path):
    if not root.exists():
        return
    for p in root.rglob("*.md"):
        if any(part in _SKIP_DIRS for part in p.relative_to(root).parts):
            continue
        if p.is_file():
            yield p


# --- Sync orchestration --------------------------------------------------
async def sync_vault(session: AsyncSession, vault: VaultRepo) -> VaultRepo:
    """Clone/pull one vault and record the outcome. Never raises — a failure is
    stored on the row so the hub can surface it."""
    settings = get_settings()
    try:
        await asyncio.to_thread(
            _clone_fresh, vault.git_url, vault.branch, _clone_dir(vault.id), settings.vault_git_token
        )
        vault.note_count = await asyncio.to_thread(_count_notes, _vault_root(vault))
        vault.last_sync_ok = True
        vault.last_sync_error = None
    except Exception as exc:  # noqa: BLE001 — surface any git/network error
        vault.last_sync_ok = False
        vault.last_sync_error = str(exc)[:1000]
        logger.warning("Vault %s sync failed: %s", vault.id, exc)
    vault.last_synced_at = datetime.utcnow()
    await session.commit()
    await session.refresh(vault)
    return vault


# --- CRUD ----------------------------------------------------------------
async def list_vaults(session: AsyncSession, user_id: uuid.UUID) -> list[VaultRepo]:
    result = await session.execute(
        select(VaultRepo).where(VaultRepo.user_id == user_id).order_by(VaultRepo.created_at.asc())
    )
    return list(result.scalars().all())


async def get_vault(session: AsyncSession, user_id: uuid.UUID, vault_id: int) -> VaultRepo | None:
    vault = await session.get(VaultRepo, vault_id)
    if vault is None or vault.user_id != user_id:
        return None
    return vault


async def create_vault(
    session: AsyncSession,
    user_id: uuid.UUID,
    name: str,
    git_url: str,
    branch: str,
    subpath: str,
    ai_readable: bool,
) -> VaultRepo:
    vault = VaultRepo(
        user_id=user_id,
        name=name.strip()[:120],
        git_url=git_url.strip()[:500],
        branch=(branch.strip() or "main")[:120],
        subpath=subpath.strip().strip("/")[:300],
        ai_readable=ai_readable,
    )
    session.add(vault)
    await session.commit()
    await session.refresh(vault)
    # Pull immediately so the hub shows notes right away.
    return await sync_vault(session, vault)


async def update_vault(session: AsyncSession, vault: VaultRepo, patch: dict) -> VaultRepo:
    """Apply changed fields; re-sync if the remote/branch/subpath moved."""
    resync = False
    if "name" in patch and patch["name"] is not None:
        vault.name = str(patch["name"]).strip()[:120]
    if "git_url" in patch and patch["git_url"]:
        new_url = str(patch["git_url"]).strip()[:500]
        resync = resync or new_url != vault.git_url
        vault.git_url = new_url
    if "branch" in patch and patch["branch"]:
        new_branch = str(patch["branch"]).strip()[:120]
        resync = resync or new_branch != vault.branch
        vault.branch = new_branch
    if "subpath" in patch and patch["subpath"] is not None:
        new_sub = str(patch["subpath"]).strip().strip("/")[:300]
        resync = resync or new_sub != vault.subpath
        vault.subpath = new_sub
    if "ai_readable" in patch and patch["ai_readable"] is not None:
        vault.ai_readable = bool(patch["ai_readable"])
    await session.commit()
    await session.refresh(vault)
    if resync:
        return await sync_vault(session, vault)
    return vault


async def delete_vault(session: AsyncSession, vault: VaultRepo) -> None:
    # Capture the path before the row is gone — attributes expire after commit.
    clone = _clone_dir(vault.id)
    await session.delete(vault)
    await session.commit()
    # Best-effort removal of the checkout; a leftover dir is harmless.
    await asyncio.to_thread(shutil.rmtree, clone, True)


# --- Note reads ----------------------------------------------------------
def list_notes(vault: VaultRepo) -> list[dict]:
    """Return every note as {path, title, size, modified} (path relative to the
    vault root), sorted by path. Runs off the already-synced checkout on disk."""
    root = _vault_root(vault)
    notes: list[dict] = []
    for p in _iter_md(root):
        rel = p.relative_to(root).as_posix()
        st = p.stat()
        notes.append(
            {
                "path": rel,
                "title": p.stem,
                "size": st.st_size,
                "modified": datetime.utcfromtimestamp(st.st_mtime),
            }
        )
    notes.sort(key=lambda n: n["path"].lower())
    return notes


def read_note(vault: VaultRepo, rel_path: str) -> str | None:
    """Read one note's markdown. Returns None if the path escapes the vault or
    isn't an existing .md file (path-traversal safe)."""
    root = _vault_root(vault).resolve()
    try:
        target = (root / rel_path).resolve()
    except (OSError, ValueError):
        return None
    if root not in target.parents and target != root:
        return None
    if target.suffix.lower() != ".md" or not target.is_file():
        return None
    data = target.read_bytes()[:_MAX_NOTE_BYTES]
    return data.decode("utf-8", errors="replace")


# --- Background sync loop ------------------------------------------------
async def sync_all_vaults() -> None:
    async with SessionFactory() as session:
        result = await session.execute(select(VaultRepo))
        for vault in result.scalars().all():
            await sync_vault(session, vault)


async def vault_sync_loop() -> None:
    settings = get_settings()
    interval = max(1, settings.vault_sync_interval_minutes) * 60
    logger.info("Vault sync loop started (every %s min).", settings.vault_sync_interval_minutes)
    while True:
        await asyncio.sleep(interval)
        try:
            await sync_all_vaults()
        except Exception as exc:  # never let the loop die
            logger.warning("Vault sync tick failed: %s", exc)
