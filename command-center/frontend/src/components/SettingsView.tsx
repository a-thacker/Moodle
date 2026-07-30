// Settings — change password, plus (for the owner) a "People" section to
// provision each account's tools. Provisioning is capability toggles per user;
// it calls the owner-only /admin endpoints. No Postgres poking required.

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { api, ApiError, type CapabilityInfo, type UserEntitlements } from "../api/client";
import { useAuth } from "../auth/AuthContext.tsx";
import { useNav } from "../nav/NavContext.tsx";
import { RAIL_TOOLS } from "./LauncherRail.tsx";
import FocusView from "./FocusView.tsx";
import { canInstall, isIos, isStandalone, promptInstall, subscribeInstall } from "../pwa";

function SidebarCustomizer() {
  const { available, hidden, toggleHidden } = useNav();
  // Everything this user can see, minus Settings (always pinned in the rail).
  const tools = RAIL_TOOLS.filter((t) => available.includes(t.view) && t.view !== "settings");

  return (
    <>
      <p style={{ fontSize: 13, color: "var(--color-neutral-400)", margin: "0 0 var(--space-4)", lineHeight: 1.6 }}>
        Choose which tools show in your sidebar. Hidden ones are still reachable
        from the ⌘K command palette.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tools.map((t) => {
          const on = !hidden.includes(t.view);
          return (
            <button
              key={t.view}
              type="button"
              onClick={() => toggleHidden(t.view)}
              className="row-hover"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", background: "none", border: "none", cursor: "pointer", textAlign: "left", opacity: on ? 1 : 0.5 }}
            >
              <i className={`ph ${t.icon}`} style={{ fontSize: 18, color: on ? "var(--color-accent-200)" : "var(--color-neutral-500)", width: 20 }} />
              <span style={{ flex: 1, fontSize: 14, color: "var(--color-text)" }}>{t.title}</span>
              <i
                className={`ph ${on ? "ph-eye" : "ph-eye-slash"}`}
                style={{ fontSize: 17, color: on ? "var(--color-accent)" : "var(--color-neutral-500)" }}
                title={on ? "Shown — click to hide" : "Hidden — click to show"}
              />
            </button>
          );
        })}
      </div>
    </>
  );
}

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

function AddPerson({ onCreated }: { onCreated: (u: UserEntitlements) => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    setBusy(true);
    try {
      const created = await api.admin.createUser(email.trim(), name.trim(), pw);
      onCreated(created);
      setOpen(false);
      setEmail(""); setName(""); setPw("");
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 409
        ? "That email already has an account."
        : "Couldn't create the account.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}
        style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
        <i className="ph ph-user-plus" style={{ fontSize: 15 }} /> Add person
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="card" style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 13, color: "var(--color-text)", marginBottom: 2 }}>New account</div>
      <input className="input" type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <input className="input" type="email" placeholder="Email" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} required />
      <input className="input" type="text" placeholder="Temporary password (8+ chars)" value={pw} autoComplete="off" onChange={(e) => setPw(e.target.value)} required />
      {err && <div style={{ fontSize: 12.5, color: "var(--color-accent-200)" }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ flex: 1, justifyContent: "center" }}>
          {busy ? "Creating…" : "Create"}
        </button>
        <button type="button" className="btn" onClick={() => { setOpen(false); setErr(null); }}>Cancel</button>
      </div>
    </form>
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
        <AddPerson
          onCreated={(u) => {
            setUsers((prev) => [...(prev ?? []), u]);
            setSelectedId(u.id);
          }}
        />
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

            {selected.capabilities.includes("assistant") && (
              <UserNudgePreview key={selected.id} userId={selected.id} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function UserNudgePreview({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState(false);

  async function run() {
    setBusy(true);
    setError(false);
    setText(undefined);
    try {
      const r = await api.admin.proactivePreview(userId);
      setText(r.text);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "var(--space-5)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-divider)" }}>
      <div style={{ fontSize: 13, color: "var(--color-neutral-400)", marginBottom: 8 }}>Proactive nudge preview</div>
      <button type="button" className="btn" disabled={busy} onClick={run}>
        {busy ? "Thinking…" : "Preview their nudge"}
      </button>
      {error && <span style={{ marginLeft: 10, fontSize: 13, color: "var(--color-accent-200)" }}>Couldn't reach their assistant.</span>}
      {text !== undefined && (
        <div style={{ marginTop: 10, padding: "var(--space-3)", background: "var(--color-bg)", borderRadius: "var(--radius-sm)", fontSize: 13.5 }}>
          {text ? (
            <span style={{ color: "var(--color-text)", lineHeight: 1.5 }}>{text}</span>
          ) : (
            <span style={{ color: "var(--color-neutral-500)" }}>Their assistant would stay quiet right now.</span>
          )}
        </div>
      )}
    </div>
  );
}

function ProactiveTest() {
  const [busy, setBusy] = useState<null | "preview" | "send">(null);
  const [text, setText] = useState<string | null | undefined>(undefined); // undefined = not run
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  async function preview() {
    setBusy("preview");
    setError(false);
    setSent(false);
    setText(undefined);
    try {
      const r = await api.admin.proactivePreview();
      setText(r.text);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!text) return;
    setBusy("send");
    setError(false);
    try {
      await api.admin.proactiveSend(text);
      setSent(true);
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
        server. Preview what yours would say right now, then optionally send that to your phone:
      </p>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <button type="button" className="btn" disabled={busy !== null} onClick={preview}>
          {busy === "preview" ? "Thinking…" : "Preview nudge"}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy !== null || !text} onClick={send}>
          {busy === "send" ? "Sending…" : "Send this to my phone"}
        </button>
      </div>
      {error && <p style={{ fontSize: 13, color: "var(--color-accent-200)", marginTop: "var(--space-3)" }}>Couldn't reach the assistant.</p>}
      {text !== undefined && (
        <div style={{ marginTop: "var(--space-4)", padding: "var(--space-4)", background: "var(--color-bg)", borderRadius: "var(--radius-sm)", fontSize: 14 }}>
          {text ? (
            <>
              <div style={{ color: "var(--color-text)", lineHeight: 1.5 }}>{text}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: sent ? "#6bbf8a" : "var(--color-neutral-500)" }}>
                {sent ? "✓ Sent to your ntfy topic." : "Preview only — not sent yet."}
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

function MyReminders() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const topic = user?.ntfy_topic;

  if (!topic) {
    return (
      <p style={{ fontSize: 13, color: "var(--color-neutral-500)", margin: 0 }}>
        No reminder channel is set up for your account yet.
      </p>
    );
  }
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--color-neutral-400)", margin: "0 0 var(--space-3)", lineHeight: 1.6 }}>
        Install the <strong>ntfy</strong> app (or open{" "}
        <a href="https://ntfy.sh" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent-200)" }}>ntfy.sh</a>)
        and subscribe to this topic to get your reminders and nudges on your phone.
        Keep it private — the topic name is the password.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <code style={{ fontSize: 13, background: "var(--color-bg)", padding: "6px 10px", borderRadius: "var(--radius-sm)", userSelect: "all", wordBreak: "break-all" }}>
          {topic}
        </code>
        <button
          type="button"
          className="btn"
          onClick={() => { navigator.clipboard?.writeText(topic); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </>
  );
}

// "Install this app" — on Android/Chrome we can fire the native install sheet;
// on iOS there's no API, so we show the Add-to-Home-Screen instructions. Hidden
// entirely once the app is already running installed (standalone).
function InstallApp() {
  const [, force] = useState(0);
  const [installable, setInstallable] = useState(canInstall());

  useEffect(() => subscribeInstall(() => setInstallable(canInstall())), []);

  if (isStandalone()) {
    return (
      <p style={{ fontSize: 13, color: "var(--color-neutral-400)", margin: 0, lineHeight: 1.6 }}>
        You're running the installed app. <i className="ph ph-check-circle" style={{ color: "var(--cc-accent-soft)" }} />
      </p>
    );
  }

  if (isIos()) {
    return (
      <p style={{ fontSize: 13, color: "var(--color-neutral-400)", margin: 0, lineHeight: 1.6 }}>
        On iPhone/iPad: tap the <strong>Share</strong> button{" "}
        <i className="ph ph-export" /> in Safari, then <strong>Add to Home Screen</strong>.
        It opens full-screen like a native app.
      </p>
    );
  }

  return (
    <>
      <p style={{ fontSize: 13, color: "var(--color-neutral-400)", margin: "0 0 var(--space-3)", lineHeight: 1.6 }}>
        Add Command Center to your home screen or desktop — it opens in its own
        window, no browser bar.
      </p>
      {installable ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => { await promptInstall(); force((n) => n + 1); }}
        >
          <i className="ph ph-download-simple" style={{ marginRight: 6 }} />
          Install app
        </button>
      ) : (
        <p style={{ fontSize: 13, color: "var(--color-neutral-500)", margin: 0 }}>
          Your browser will offer an install button in its address bar. (If you
          don't see one, the app may already be installed.)
        </p>
      )}
    </>
  );
}

export default function SettingsView() {
  const { user } = useAuth();

  return (
    <FocusView title="Settings" icon="ph-gear-six">
      <section className="cc-panel" style={{ padding: "var(--space-6)" }}>
        <div style={{ fontSize: 13, color: "var(--color-neutral-400)", marginBottom: "var(--space-4)" }}>
          Signed in as <span style={{ color: "var(--color-text)" }}>{user?.email}</span>
          {" · "}
          <span className="tag tag-neutral">{user?.role}</span>
        </div>
        <ChangePassword />
      </section>

      <section className="cc-panel" style={{ padding: "var(--space-6)", marginTop: "var(--space-4)" }}>
        <h3 style={{ margin: "0 0 var(--space-4)", fontSize: 14 }}>Install app</h3>
        <InstallApp />
      </section>

      <section className="cc-panel" style={{ padding: "var(--space-6)", marginTop: "var(--space-4)" }}>
        <h3 style={{ margin: "0 0 var(--space-4)", fontSize: 14 }}>Reminders</h3>
        <MyReminders />
      </section>

      <section className="cc-panel" style={{ padding: "var(--space-6)", marginTop: "var(--space-4)" }}>
        <h3 style={{ margin: "0 0 var(--space-4)", fontSize: 14 }}>Sidebar</h3>
        <SidebarCustomizer />
      </section>

      {user?.role === "owner" && (
        <section className="cc-panel" style={{ padding: "var(--space-6)", marginTop: "var(--space-4)" }}>
          <h3 style={{ margin: "0 0 var(--space-4)", fontSize: 14 }}>People &amp; tools</h3>
          <People />
        </section>
      )}

      {user?.role === "owner" && (
        <section className="cc-panel" style={{ padding: "var(--space-6)", marginTop: "var(--space-4)" }}>
          <h3 style={{ margin: "0 0 var(--space-4)", fontSize: 14 }}>Proactive notifications</h3>
          <ProactiveTest />
        </section>
      )}
    </FocusView>
  );
}
