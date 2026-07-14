// Settings — change password (and a little account info). No Postgres poking
// required: this calls POST /auth/change-password.

import { useState, type FormEvent } from "react";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext.tsx";
import FocusView from "./FocusView.tsx";

export default function SettingsView() {
  const { user } = useAuth();
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
    <FocusView title="Settings">
      <section className="card" style={{ padding: "var(--space-6)" }}>
        <div style={{ fontSize: 13, color: "var(--color-neutral-400)", marginBottom: "var(--space-4)" }}>
          Signed in as <span style={{ color: "var(--color-text)" }}>{user?.email}</span>
          {" · "}
          <span className="tag tag-neutral">{user?.role}</span>
        </div>
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
      </section>
    </FocusView>
  );
}
