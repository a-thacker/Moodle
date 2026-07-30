// Notes — the Obsidian hub. Connect one or more git-backed vaults; the backend
// clones/pulls them and serves the markdown. Browse a vault's notes, read them
// rendered, keep them synced, and flag a vault "AI-readable" so the assistant
// may read it and fold what it finds into your planner. Editing still happens in
// Obsidian — this is a read + manage surface.

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { api } from "../api/client";
import type { NoteMeta, Vault } from "../types";
import { useIsMobile } from "../hooks/useMediaQuery";
import PageShell from "./PageShell";

const MONO = "var(--font-mono)";

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function syncColor(v: Vault): string {
  if (v.last_sync_ok === false) return "var(--cc-bad)";
  if (v.last_sync_ok === true) return "var(--cc-good)";
  return "var(--cc-dim)";
}

function syncLabel(v: Vault): string {
  if (v.last_sync_ok === false) return "sync failed";
  if (!v.last_synced_at) return "not synced yet";
  const when = new Date(v.last_synced_at).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  return `synced ${when}`;
}

export default function NotesView() {
  const isMobile = useIsMobile();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const active = vaults.find((v) => v.id === activeId) ?? null;

  const loadVaults = useCallback(async () => {
    const vs = await api.vaults.list().catch(() => [] as Vault[]);
    setVaults(vs);
    setActiveId((cur) => (cur != null && vs.some((v) => v.id === cur) ? cur : vs[0]?.id ?? null));
    setLoaded(true);
  }, []);

  useEffect(() => { void loadVaults(); }, [loadVaults]);

  // Load the active vault's note list.
  useEffect(() => {
    if (activeId == null) { setNotes([]); return; }
    setNotesLoading(true);
    setActivePath(null);
    setContent(null);
    api.vaults.notes(activeId)
      .then(setNotes)
      .catch(() => setNotes([]))
      .finally(() => setNotesLoading(false));
  }, [activeId]);

  // Load the selected note's markdown.
  useEffect(() => {
    if (activeId == null || activePath == null) { setContent(null); return; }
    setContentLoading(true);
    api.vaults.note(activeId, activePath)
      .then((r) => setContent(r.markdown))
      .catch(() => setContent(null))
      .finally(() => setContentLoading(false));
  }, [activeId, activePath]);

  function replaceVault(v: Vault) {
    setVaults((prev) => prev.map((x) => (x.id === v.id ? v : x)));
  }

  async function syncActive() {
    if (!active || syncing) return;
    setSyncing(true);
    try {
      const v = await api.vaults.sync(active.id);
      replaceVault(v);
      const ns = await api.vaults.notes(active.id).catch(() => [] as NoteMeta[]);
      setNotes(ns);
    } catch { /* status shown from the row */ } finally {
      setSyncing(false);
    }
  }

  async function toggleAi(v: Vault) {
    const updated = await api.vaults.update(v.id, { ai_readable: !v.ai_readable }).catch(() => null);
    if (updated) replaceVault(updated);
  }

  async function removeVault(v: Vault) {
    if (!window.confirm(`Disconnect the "${v.name}" vault? Your Obsidian notes aren't touched.`)) return;
    await api.vaults.remove(v.id).catch(() => {});
    setVaults((prev) => {
      const next = prev.filter((x) => x.id !== v.id);
      setActiveId((cur) => (cur === v.id ? next[0]?.id ?? null : cur));
      return next;
    });
  }

  return (
    <PageShell
      title="Notes"
      icon="ph-notebook"
      subtitle="Obsidian vaults"
      scroll={false}
      actions={
        vaults.length > 0 ? (
          <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={() => setShowAdd(true)}>
            <i className="ph ph-plus" style={{ marginRight: 5 }} /> Add vault
          </button>
        ) : undefined
      }
    >
      {showAdd && (
        <AddVaultForm
          onClose={() => setShowAdd(false)}
          onCreated={(v) => { setVaults((p) => [...p, v]); setActiveId(v.id); setShowAdd(false); }}
        />
      )}

      {loaded && vaults.length === 0 && !showAdd && (
        <EmptyState onAdd={() => setShowAdd(true)} />
      )}

      {vaults.length > 0 && (
        <>
          {/* Vault switcher */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0, marginBottom: 12 }}>
            {vaults.map((v) => {
              const on = v.id === activeId;
              return (
                <button
                  key={v.id}
                  onClick={() => setActiveId(v.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: on ? "#1c1f30" : "var(--color-neutral-900)",
                    border: `1px solid ${on ? "var(--cc-accent)" : "var(--color-divider)"}`,
                    borderRadius: 10, padding: "8px 12px", cursor: "pointer",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: syncColor(v), flexShrink: 0 }} />
                  <span style={{ color: on ? "var(--cc-bright)" : "var(--cc-text)", fontSize: 13, fontWeight: 500 }}>{v.name}</span>
                  <span style={{ color: "var(--cc-dim)", fontSize: 11, fontFamily: MONO }}>{v.note_count}</span>
                  {v.ai_readable && <i className="ph-fill ph-sparkle" title="AI-readable" style={{ color: "var(--cc-accent-soft)", fontSize: 12 }} />}
                </button>
              );
            })}
          </div>

          {active && (
            <>
              {/* Active vault toolbar */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flexShrink: 0, marginBottom: 10 }}>
                <span style={{ fontSize: 11.5, color: syncColor(active), fontFamily: MONO }}>{syncLabel(active)}</span>
                {active.last_sync_ok === false && active.last_sync_error && (
                  <span title={active.last_sync_error} style={{ fontSize: 11.5, color: "var(--cc-bad)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {active.last_sync_error}
                  </span>
                )}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={syncActive} disabled={syncing}>
                    <i className={`ph ph-arrows-clockwise ${syncing ? "pulse" : ""}`} style={{ marginRight: 5 }} />
                    {syncing ? "Syncing…" : "Sync now"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 12, color: active.ai_readable ? "var(--cc-accent-soft)" : "var(--cc-muted)" }}
                    onClick={() => toggleAi(active)}
                    title="Let the assistant read this vault and use it in your planner"
                  >
                    <i className={`ph ${active.ai_readable ? "ph-fill ph-sparkle" : "ph-sparkle"}`} style={{ marginRight: 5 }} />
                    {active.ai_readable ? "AI: on" : "AI: off"}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: 12, color: "var(--cc-muted)" }} onClick={() => removeVault(active)} title="Disconnect vault">
                    <i className="ph ph-trash" />
                  </button>
                </div>
              </div>

              {/* Notes + reader */}
              <div style={{ flex: 1, display: "flex", gap: 14, minHeight: 0 }}>
                {/* On mobile, hide the list while a note is open. */}
                {(!isMobile || activePath == null) && (
                  <div
                    style={{
                      width: isMobile ? "100%" : 300, flexShrink: 0, minHeight: 0, overflowY: "auto",
                      border: "1px solid var(--color-divider)", borderRadius: 12,
                      background: "var(--color-neutral-900)", padding: 6,
                    }}
                  >
                    {notesLoading ? (
                      <div style={{ padding: 16, color: "var(--cc-muted)", fontSize: 13 }}>Loading notes…</div>
                    ) : notes.length === 0 ? (
                      <div style={{ padding: 16, color: "var(--cc-muted)", fontSize: 13, lineHeight: 1.6 }}>
                        No markdown notes found{active.last_sync_ok === false ? " (sync failed — check the URL/token)" : " in this vault"}.
                      </div>
                    ) : (
                      notes.map((n) => {
                        const on = n.path === activePath;
                        const dir = dirOf(n.path);
                        return (
                          <button
                            key={n.path}
                            onClick={() => setActivePath(n.path)}
                            className="row-hover"
                            style={{
                              width: "100%", textAlign: "left", background: on ? "#ffffff10" : "none",
                              border: "none", cursor: "pointer", padding: "8px 10px", display: "flex",
                              flexDirection: "column", gap: 2,
                            }}
                          >
                            <span style={{ color: on ? "var(--cc-bright)" : "var(--cc-text)", fontSize: 13.5, fontWeight: on ? 600 : 400 }}>{n.title}</span>
                            {dir && <span style={{ color: "var(--cc-dim)", fontSize: 11, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dir}</span>}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

                {(!isMobile || activePath != null) && (
                  <div
                    style={{
                      flex: 1, minHeight: 0, overflowY: "auto",
                      border: "1px solid var(--color-divider)", borderRadius: 12,
                      background: "var(--color-neutral-900)", padding: isMobile ? 16 : "20px 24px",
                    }}
                  >
                    {activePath == null ? (
                      <div style={{ margin: "auto", color: "var(--cc-muted)", fontSize: 13, textAlign: "center", paddingTop: 40 }}>
                        Pick a note to read it.
                      </div>
                    ) : (
                      <>
                        {isMobile && (
                          <button className="btn btn-ghost" style={{ fontSize: 12, marginBottom: 10 }} onClick={() => setActivePath(null)}>
                            <i className="ph ph-caret-left" style={{ marginRight: 4 }} /> Notes
                          </button>
                        )}
                        <div style={{ fontSize: 11.5, color: "var(--cc-dim)", fontFamily: MONO, marginBottom: 10 }}>{activePath}</div>
                        {contentLoading ? (
                          <div style={{ color: "var(--cc-muted)", fontSize: 13 }}>Loading…</div>
                        ) : content == null ? (
                          <div style={{ color: "var(--cc-bad)", fontSize: 13 }}>Couldn't load this note.</div>
                        ) : (
                          <div className="cc-md">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </PageShell>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ margin: "auto", textAlign: "center", maxWidth: 460, padding: 24 }}>
      <i className="ph ph-notebook" style={{ fontSize: 40, color: "var(--cc-accent-soft)" }} />
      <h3 style={{ fontFamily: "var(--font-display)", fontSize: 19, margin: "14px 0 8px", color: "var(--cc-bright)" }}>
        Connect your Obsidian vault
      </h3>
      <p style={{ color: "var(--cc-muted)", fontSize: 13.5, lineHeight: 1.65, margin: "0 0 18px" }}>
        Point the hub at a git-backed vault (the obsidian-git plugin keeps it pushed).
        The Command Center pulls it, shows your notes here, and — for vaults you flag —
        lets the assistant read them and pull deadlines and plans into your planner.
      </p>
      <button className="btn btn-primary" onClick={onAdd}>
        <i className="ph ph-plus" style={{ marginRight: 6 }} /> Add a vault
      </button>
    </div>
  );
}

function AddVaultForm({ onClose, onCreated }: { onClose: () => void; onCreated: (v: Vault) => void }) {
  const [name, setName] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [subpath, setSubpath] = useState("");
  const [aiReadable, setAiReadable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !gitUrl.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const v = await api.vaults.create({
        name: name.trim(),
        git_url: gitUrl.trim(),
        branch: branch.trim() || "main",
        subpath: subpath.trim(),
        ai_readable: aiReadable,
      });
      if (v.last_sync_ok === false) setError(v.last_sync_error || "Clone failed — check the URL / token.");
      onCreated(v);
    } catch {
      setError("Couldn't add the vault. Check the details and try again.");
    } finally {
      setBusy(false);
    }
  }

  const field = { background: "var(--color-bg)", border: "1px solid var(--cc-tile-border)", borderRadius: 9, padding: "10px 12px", color: "var(--cc-bright)", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" as const };
  const lbl = { fontSize: 12.5, color: "var(--cc-text)", marginBottom: 5, display: "block" };

  return (
    <div className="cc-panel" style={{ padding: 16, gap: 12, marginBottom: 14, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 2 }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 15, color: "var(--cc-bright)" }}>Add a vault</span>
        <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 12 }} onClick={onClose}>Cancel</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label>
          <span style={lbl}>Name</span>
          <input style={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Classes" />
        </label>
        <label>
          <span style={lbl}>Branch</span>
          <input style={field} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
        </label>
      </div>
      <label>
        <span style={lbl}>Git URL</span>
        <input style={field} value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/you/vault.git" />
      </label>
      <label>
        <span style={lbl}>Subfolder <span style={{ color: "var(--cc-dim)" }}>(optional — vault root inside the repo)</span></span>
        <input style={field} value={subpath} onChange={(e) => setSubpath(e.target.value)} placeholder="e.g. School" />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 13, color: "var(--cc-text)" }}>
        <input type="checkbox" checked={aiReadable} onChange={(e) => setAiReadable(e.target.checked)} />
        Let the assistant read this vault and use it in my planner
      </label>
      {error && <div style={{ fontSize: 12.5, color: "var(--cc-bad)", lineHeight: 1.5 }}>{error}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={!name.trim() || !gitUrl.trim() || busy}
        >
          {busy ? "Cloning…" : "Add & sync"}
        </button>
        <span style={{ fontSize: 11.5, color: "var(--cc-muted)" }}>Private repo? Set VAULT_GIT_TOKEN in the server .env.</span>
      </div>
    </div>
  );
}
