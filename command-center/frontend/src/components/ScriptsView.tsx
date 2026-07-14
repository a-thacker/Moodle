// Scripts view — run scripts that live on Alden's Mac (in ~/cc-scripts/), not
// in the backend container. Clicking a script enqueues a job; a poller on the
// Mac claims it, runs it, and posts the output back, which we poll for here.
// If the Mac runner is offline the script list is simply empty.

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import type { ScriptInfo, ScriptJob } from "../types";

const MONO = "var(--font-mono)";

const STATUS: Record<ScriptJob["status"], { label: string; color: string }> = {
  pending: { label: "queued", color: "var(--cc-muted)" },
  running: { label: "running", color: "var(--cc-accent-soft)" },
  done: { label: "done", color: "var(--cc-good)" },
  failed: { label: "failed", color: "var(--cc-bad)" },
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export default function ScriptsView() {
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [jobs, setJobs] = useState<ScriptJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const expandedTouched = useRef(false);

  const refreshScripts = useCallback(() => {
    api.scripts.list().then(setScripts).catch(() => {});
  }, []);
  const refreshJobs = useCallback(() => {
    api.scripts.jobs().then(setJobs).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refreshScripts();
    refreshJobs();
    const j = setInterval(refreshJobs, 2000);
    const s = setInterval(refreshScripts, 10000);
    return () => { clearInterval(j); clearInterval(s); };
  }, [refreshScripts, refreshJobs]);

  // Auto-expand the newest job until the user clicks one themselves.
  useEffect(() => {
    if (!expandedTouched.current && jobs.length > 0) setExpanded(jobs[0].id);
  }, [jobs]);

  async function run(script: ScriptInfo) {
    setBusy(script.id);
    try {
      const job = await api.scripts.run(script.id);
      expandedTouched.current = false;
      setJobs((prev) => [job, ...prev]);
      setExpanded(job.id);
    } catch {
      /* surfaced by the empty/offline hint */
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <i className="ph ph-terminal-window" style={{ fontSize: 20, color: "var(--cc-accent)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>Scripts</h2>
        <span style={{ fontSize: 12, color: "var(--cc-muted)" }}>
          run on your Mac · <code style={{ color: "var(--cc-accent-soft)" }}>~/cc-scripts/</code>
        </span>
      </div>

      <div style={{ flex: 1, display: "flex", gap: 16, minHeight: 0 }}>
        {/* Left: the scripts the Mac offers */}
        <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", minHeight: 0 }}>
          {scripts.length === 0 ? (
            <div style={{ border: "1px dashed #2f3450", borderRadius: 12, padding: 16, color: "var(--cc-muted)", fontSize: 13, lineHeight: 1.6 }}>
              No scripts found. Drop an executable in <code style={{ color: "var(--cc-accent-soft)", fontFamily: MONO }}>~/cc-scripts/</code> on your Mac and make sure the runner is online
              (<code style={{ fontFamily: MONO }}>python -m agent scripts-daemon</code>).
            </div>
          ) : (
            scripts.map((s) => (
              <button
                key={s.id}
                onClick={() => run(s)}
                disabled={busy === s.id}
                className="cc-clickable"
                style={{ textAlign: "left", background: "var(--cc-tile)", border: "1px solid #262a3b", borderRadius: 12, padding: "13px 15px", cursor: busy === s.id ? "default" : "pointer", display: "flex", flexDirection: "column", gap: 4 }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--cc-accent-soft)", fontFamily: MONO, fontSize: 12 }}>▸</span>
                  <span style={{ color: "var(--cc-bright)", fontSize: 14, fontWeight: 500 }}>{s.label}</span>
                  {busy === s.id && <span className="pulse" style={{ marginLeft: "auto", fontSize: 11, color: "var(--cc-muted)" }}>queuing…</span>}
                </span>
                <span style={{ color: "var(--cc-muted)", fontSize: 12, fontFamily: MONO }}>{s.id}</span>
                {s.description && <span style={{ color: "var(--cc-text)", fontSize: 12.5 }}>{s.description}</span>}
              </button>
            ))
          )}
        </div>

        {/* Right: run history + output */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, border: "1px solid #20233a", borderRadius: 14, background: "#0a0b11", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #1b1e2c" }}>
            <span className="cc-label">RUNS</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {loaded && jobs.length === 0 && (
              <div style={{ margin: "auto", color: "var(--cc-muted)", fontSize: 13 }}>No runs yet. Pick a script on the left.</div>
            )}
            {jobs.map((job) => {
              const st = STATUS[job.status];
              const open = expanded === job.id;
              const output = [job.stdout, job.stderr].filter(Boolean).join("\n").trim();
              return (
                <div key={job.id} style={{ border: "1px solid #1b1e2c", borderRadius: 10, overflow: "hidden" }}>
                  <button
                    onClick={() => { expandedTouched.current = true; setExpanded(open ? null : job.id); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", background: "none", border: "none", cursor: "pointer" }}
                  >
                    <span className={job.status === "running" ? "pulse" : ""} style={{ width: 8, height: 8, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                    <span style={{ color: "var(--cc-bright)", fontFamily: MONO, fontSize: 13 }}>{job.script}</span>
                    <span style={{ color: st.color, fontSize: 11.5, fontFamily: MONO, textTransform: "uppercase", letterSpacing: ".05em" }}>{st.label}</span>
                    {job.exit_code != null && job.status !== "done" && (
                      <span style={{ color: "var(--cc-muted)", fontSize: 11, fontFamily: MONO }}>exit {job.exit_code}</span>
                    )}
                    <span style={{ marginLeft: "auto", color: "var(--cc-dim)", fontSize: 11, fontFamily: MONO }}>{fmtTime(job.created_at)}</span>
                    <i className={`ph ${open ? "ph-caret-up" : "ph-caret-down"}`} style={{ fontSize: 13, color: "var(--cc-muted)" }} />
                  </button>
                  {open && (
                    <pre style={{ margin: 0, padding: "0 14px 13px", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: MONO, fontSize: 12, lineHeight: 1.5, color: job.status === "failed" ? "#f0a48e" : "var(--cc-text)", maxHeight: 340, overflowY: "auto" }}>
                      {job.status === "pending" ? "Waiting for the Mac runner to pick this up…"
                        : job.status === "running" ? "Running on your Mac…"
                        : output || "(no output)"}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
