"""Obsidian vault hub endpoints (browser side; needs the `notes` capability).

    GET    /vaults                 the caller's registered vaults + sync status
    POST   /vaults                 register a vault (clones + syncs immediately)
    PATCH  /vaults/{id}            edit a vault (re-syncs if the remote moved)
    DELETE /vaults/{id}            unregister a vault (removes the checkout)
    POST   /vaults/{id}/sync       pull the vault now
    GET    /vaults/{id}/notes      list the vault's markdown notes
    GET    /vaults/{id}/note?path= read one note's markdown

Vaults are per-user: every row is scoped to the caller, so one user never sees
another's vaults. Note bodies are read from the cloned repo on disk, never the
DB. See app.services.vault.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_capability
from app.db.session import get_db
from app.models.user import User
from app.schemas.vault import NoteContent, NoteMeta, VaultCreate, VaultOut, VaultUpdate
from app.services import vault as vault_service

router = APIRouter(prefix="/vaults", tags=["vaults"])

require_notes = require_capability("notes")


async def _load(session: AsyncSession, user: User, vault_id: int):
    vault = await vault_service.get_vault(session, user.id, vault_id)
    if vault is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown vault")
    return vault


@router.get("", response_model=list[VaultOut])
async def list_vaults(
    session: AsyncSession = Depends(get_db), user: User = Depends(require_notes)
) -> list[VaultOut]:
    vaults = await vault_service.list_vaults(session, user.id)
    return [VaultOut.model_validate(v) for v in vaults]


@router.post("", response_model=VaultOut, status_code=status.HTTP_201_CREATED)
async def create_vault(
    payload: VaultCreate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_notes),
) -> VaultOut:
    vault = await vault_service.create_vault(
        session,
        user.id,
        payload.name,
        payload.git_url,
        payload.branch,
        payload.subpath,
        payload.ai_readable,
    )
    return VaultOut.model_validate(vault)


@router.patch("/{vault_id}", response_model=VaultOut)
async def update_vault(
    vault_id: int,
    payload: VaultUpdate,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_notes),
) -> VaultOut:
    vault = await _load(session, user, vault_id)
    vault = await vault_service.update_vault(session, vault, payload.model_dump(exclude_unset=True))
    return VaultOut.model_validate(vault)


@router.delete("/{vault_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vault(
    vault_id: int,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_notes),
) -> None:
    vault = await _load(session, user, vault_id)
    await vault_service.delete_vault(session, vault)


@router.post("/{vault_id}/sync", response_model=VaultOut)
async def sync_vault(
    vault_id: int,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_notes),
) -> VaultOut:
    vault = await _load(session, user, vault_id)
    vault = await vault_service.sync_vault(session, vault)
    return VaultOut.model_validate(vault)


@router.get("/{vault_id}/notes", response_model=list[NoteMeta])
async def list_notes(
    vault_id: int,
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_notes),
) -> list[NoteMeta]:
    vault = await _load(session, user, vault_id)
    return [NoteMeta.model_validate(n) for n in vault_service.list_notes(vault)]


@router.get("/{vault_id}/note", response_model=NoteContent)
async def read_note(
    vault_id: int,
    path: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_db),
    user: User = Depends(require_notes),
) -> NoteContent:
    vault = await _load(session, user, vault_id)
    markdown = vault_service.read_note(vault, path)
    if markdown is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    return NoteContent(path=path, markdown=markdown)
