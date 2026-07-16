// Settings — change password, plus (for the owner) a "People" section to
// provision each account's tools. Provisioning is capability toggles per user;
// it calls the owner-only /admin endpoints. No Postgres poking required.

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { api, type CapabilityInfo, type UserEntitlements } from "../api/client";
import { useAuth } from "../auth/AuthContext.tsx";
import FocusView from "./FocusView.tsx";

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) {
      setMsg({ ok: false, text: "New password must be at least 8 characters." });
      return;
    }
    if (next !== confirm) {
      setMsg({ ok: false, text: "New passwords don't match." });
      return;
    }
    setBusy(true);
    try {
      await api.auth.changePassword(current, next);
      setMsg({ ok: true, text: "Password changed." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch {
      setMsg({ ok: false, text: "Current password is incorrect." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3 style={{ margin: "0 0 var(--space-4)", fontSize: 14 }}>Change password</h3>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", maxWidth: 320 }}>
        <input className="input" type="password" placeholder="Current password" value={current}
          autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} required />
        <input className="input" type="password" placeholder="New password" value={next}
          autoComplete="new-password" onChange={(e) => setNext(e.target.value)} required />
        <input className="input" type="password" placeholder="Confirm new password" value={confirm}
          autoComplete="new-password" onChange={(e) => setConfirm(e.target.value)} required />
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ justifyContent: "center" }}>
          {busy ? "Saving…" : "Update password"}
        </button>
        {msg && (
          <div style={{ fontSize: 13, color: msg.ok ? "#6bbf8a" : "var(--color-accent-200)" }}>{msg.text}</div>
        )}
      </form>
    </>
  );
}

function People() {
  const [users, setUsers] = useState<UserEntitlements[] | null>(null);
  const [caps, setCaps] = useState<CapabilityInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([api.admin.listUsers(), api.admin.capabilities()])
      .then(([u, c]) => {
        setUsers(u);
        setCaps(c);
        // Default-select the first non-owner (the interesting case to tune).
        setSelectedId((u.find((x) => x.role !== "owner") ?? u[0])?.id ?? null);
      })
      .catch(() => setError(true));
  }, []);

  const selected = useMemo(
    () => users?.find((u) => u.id === selectedId) ?? null,
    [users, selectedId],
  );

  // Reset the draft whenever the selected user changes.
  useEffect(() => {
    if (!selected) return setDraft({});
    const d: Record<string, boolean> = {};
    for (const c of caps) d[c.key] = selected.capabilities.includes(c.key);
    setDraft(d);
    setMsg(null);
  }, [selected, caps]);

  const isOwner = selected?.role === "owner";

  async function save() {
    if (!selected) return;
    setSaving(true);
    setMsg(null);
    // Send desired state for every non-forced capability.
    const overrides: Record<string, boolean> = {};
    for (const c of caps) if (!c.always) overrides[c.key] = !!draft[c.key];
    try {
      const updated = await api.admin.setEntitlements(selected.id, overrides);
      setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? prev);
      setMsg({ ok: true, text: "Saved." });
    } catch {
      setMsg({ ok: false, text: "Couldn't save changes." });
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return <p style={{ fontSize: 13, color: "var(--color-accent-200)" }}>Couldn't load users.</p>;
  }
  if (!users) {
    return <p style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>Loading people…</p>;
  }

  return (
    <div style={{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap" }}>
      {/* User picker */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setSelectedId(u.id)}
            className="card"
            style={{
              textAlign: "left",
              padding: "10px 12px",
              cursor: "pointer",
              borderColor: u.id === selectedId ? "var(--color-accent)" : undefined,
            }}
          >
            <div style={{ fontSize: 14, color: "var(--color-text)" }}>{u.display_name}</div>
            <div style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>
              {u.email} · <span className="tag tag-neutral">{u.role}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Capability toggles for the selected user */}
      <div style={{ flex: 1, minWidth: 260 }}>
        {selected && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-neutral-400)", marginBottom: "var(--space-3)" }}>
              Tools for <span style={{ color: "var(--color-text)" }}>{selected.display_name}</span>
            </div>
            {isOwner ? (
              <p style={{ fontSize: 13, color: "var(--color-neutral-500)" }}>
                The owner is the admin and always has every tool.
              </p>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 360 }}>
                  {caps.map((c) => (
                    <label
                      key={c.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        fontSize: 14,
                        opacity: c.always ? 0.6 : 1,
                        cursor: c.always ? "default" : "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={c.always ? true : !!draft[c.key]}
                        disabled={c.always}
                        onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.checked }))}
                      />
                      <i className={`ph ${c.icon}`} style={{ fontSize: 17, color: "var(--color-accent-200)" }} />
                      <span>{c.label}</span>
                      {c.always && (
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-neutral-500)" }}>always</span>
                      )}
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: "var(--space-4)" }}>
                  <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
                    {saving ? "Saving…" : "Save tools"}
                  </button>
                  {msg && (
                    <span style={{ fontSize: 13, color: msg.ok ? "#6bbf8a" : "var(--color-accent-200)" }}>{msg.text}</span>
                  )}
                </div>
              </>
            )}

            {selected.ntfy_topic && (
              <div style={{ marginTop: "var(--space-5)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-divider)" }}>
                <div style={{ fontSize: 13, color: "var(--color-neutral-400)", marginBottom: 6 }}>
                  Reminder channel (ntfy)
                </div>
                <code style={{ fontSize: 13, background: "var(--color-bg)", padding: "4px 8px", borderRadius: "var(--radius-sm)", userSelect: "all", wordBreak: "break-all" }}>
                  {selected.ntfy_topic}
                </code>
                <div style={{ fontSize: 12, color: "var(--color-neutral-500)", marginTop: 6 }}>
                  Have them subscribe to this topic in the ntfy app to get their reminders. Keep it private — the topic name is the password.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProactiveTest() {
  const [busy, setBusy] = useState<null | "preview" | "send">(null);
  const [result, setResult] = useState<{ text: string | null; sent: boolean } | null>(null);
  const [error, setError] = useState(false);

  async function run(send: boolean) {
    setBusy(send ? "send" : "preview");
    setError(false);
    setResult(null);
    try {
      const r = await api.admin.proactivePreview(send);
      setResult({ text: r.text, sent: r.sent });
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <p style={{ fontSize: 13, color: "var(--color-neutral-400)", margin: "0 0 var(--space-3)", lineHeight: 1.6 }}>
        The assistant checks each AI-enabled user's schedule on a timer and sends a
        timely nudge to their phone (ntfy) when it's worth it. Off until{" "}
        <code style={{ fontFamily: "var(--font-mono)" }}>PROACTIVE_ENABLED=true</code> is set on the
        server. Preview what yours would say right now:
      </p>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <button type="button" className="btn" disabled={busy !== null} onClick={() => run(false)}>
          {busy === "preview" ? "Thinking…" : "Preview nudge"}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => run(true)}>
          {busy === "send" ? "Sending…" : "Send test to my phone"}
        </button>
      </div>
      {error && <p style={{ fontSize: 13, color: "var(--color-accent-200)", marginTop: "var(--space-3)" }}>Couldn't reach the assistant.</p>}
      {result && (
        <div style={{ marginTop: "var(--space-4)", padding: "var(--space-4)", background: "var(--color-bg)", borderRadius: "var(--radius-sm)", fontSize: 14 }}>
          {result.text ? (
            <>
              <div style={{ color: "var(--color-text)", lineHeight: 1.5 }}>{result.text}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: result.sent ? "#6bbf8a" : "var(--color-neutral-500)" }}>
                {result.sent ? "✓ Sent to your ntfy topic." : "Preview only — not sent."}
              </div>
            </>
          ) : (
            <span style={{ color: "var(--color-neutral-500)" }}>Nothing worth a nudge right now — the assistant would stay quiet.</span>
          )}
        </div>
      )}
    </>
  );
}

export default function SettingsView() {
  const { user } = useAuth();

  return (
    <FocusView title="Settings">
      <section className="card" style={{ padding: "var(--space-6)" }}>
        <div style={{ fontSize: 13, color: "var(--color-neutral-400)", marginBottom: "var(--space-4)" }}>
          Signed in as <span style={{ color: "var(--color-text)" }}>{user?.email}</span>
          {" · "}
          <span className="tag tag-neutral">{user?.role}</span>
        </div>
        <ChangePassword />
      </section>

      {user?.role === "owner" && (
        <section className="card" style={{ padding: "var(--space-6)", marginTop: "var(--space-4)" }}>
          <h3 style={{ margin: "0 0 var(--space-4)", fontSize: 14 }}>People &amp; tools</h3>
          <People />
        </section>
      )}

      {user?.role === "owner" && (
        <section className="card" style={{ padding: "var(--space-6)", marginTop: "var(--space-4)" }}>
          <h3 style={{ margin: "0 0 var(--space-4)", fontSize: 14 }}>Proactive notifications</h3>
          <ProactiveTest />
        </section>
      )}
    </FocusView>
  );
}
