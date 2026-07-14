// Scripts view — run scripts that live on Alden's Mac (in ~/cc-scripts/), not
// in the backend container. Select a script, optionally pass arguments, and
// run it; a poller on the Mac claims the job, runs it, and posts the output
// back, which we poll for here. If the Mac runner is offline the list is empty.

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
  const [selected, setSelected] = useState<string | null>(null);
  const [args, setArgs] = useState("");
  const [busy, setBusy] = useState(false);
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

  useEffect(() => {
    if (!expandedTouched.current && jobs.length > 0) setExpanded(jobs[0].id);
  }, [jobs]);

  const selectedScript = scripts.find((s) => s.id === selected) ?? null;

  const run = useCallback(async (scriptId: string, withArgs: string) => {
    setBusy(true);
    try {
      const job = await api.scripts.run(scriptId, withArgs.trim() || undefined);
      expandedTouched.current = false;
      setJobs((prev) => [job, ...prev]);
      setExpanded(job.id);
      setArgs("");
    } catch {
      /* surfaced by the empty/offline hint */
    } finally {
      setBusy(false);
    }
  }, []);

  async function clearRuns() {
    await api.scripts.clearJobs().catch(() => {});
    setJobs((prev) => prev.filter((j) => j.status === "pending" || j.status === "running"));
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
        {/* Left: scripts + run bar */}
        <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", minHeight: 0 }}>
            {scripts.length === 0 ? (
              <div style={{ border: "1px dashed #2f3450", borderRadius: 12, padding: 16, color: "var(--cc-muted)", fontSize: 13, lineHeight: 1.6 }}>
                No scripts found. Drop an executable in <code style={{ color: "var(--cc-accent-soft)", fontFamily: MONO }}>~/cc-scripts/</code> on your Mac and make sure the runner is online
                (<code style={{ fontFamily: MONO }}>python -m agent scripts-daemon</code>).
              </div>
            ) : (
              scripts.map((s) => {
                const active = s.id === selected;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s.id)}
                    onDoubleClick={() => run(s.id, args)}
                    style={{ textAlign: "left", background: active ? "#1c1f30" : "var(--cc-tile)", border: `1px solid ${active ? "var(--cc-accent)" : "#262a3b"}`, borderRadius: 12, padding: "13px 15px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "var(--cc-accent-soft)", fontFamily: MONO, fontSize: 12 }}>▸</span>
                      <span style={{ color: "var(--cc-bright)", fontSize: 14, fontWeight: 500 }}>{s.label}</span>
                    </span>
                    <span style={{ color: "var(--cc-muted)", fontSize: 12, fontFamily: MONO }}>{s.id}</span>
                    {s.description && <span style={{ color: "var(--cc-text)", fontSize: 12.5 }}>{s.description}</span>}
                  </button>
                );
              })
            )}
          </div>

          {/* Run bar: args + run the selected script */}
          <div style={{ border: "1px solid #1b1e2c", borderRadius: 12, background: "#0e0f16", padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ fontSize: 12, color: selectedScript ? "var(--cc-text)" : "var(--cc-muted)", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selectedScript ? `▸ ${selectedScript.id}` : "select a script above"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && selectedScript && !busy) run(selectedScript.id, args); }}
                placeholder="arguments (optional)"
                disabled={!selectedScript}
                style={{ flex: 1, background: "#0a0b11", border: "1px solid #1b1e2c", borderRadius: 9, padding: "9px 11px", color: "var(--cc-bright)", fontSize: 13, fontFamily: MONO, outline: "none" }}
              />
              <button
                onClick={() => selectedScript && run(selectedScript.id, args)}
                disabled={!selectedScript || busy}
                style={{ flexShrink: 0, background: !selectedScript || busy ? "#232739" : "var(--cc-accent)", color: !selectedScript || busy ? "var(--cc-muted)" : "#100f1c", border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: !selectedScript || busy ? "default" : "pointer" }}
              >
                {busy ? "…" : "Run"}
              </button>
            </div>
          </div>
        </div>

        {/* Right: run history + output */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, border: "1px solid #20233a", borderRadius: 14, background: "#0a0b11", overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1b1e2c", display: "flex", alignItems: "center" }}>
            <span className="cc-label">RUNS</span>
            {jobs.some((j) => j.status === "done" || j.status === "failed") && (
              <button onClick={clearRuns} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--cc-muted)", fontSize: 12, fontFamily: MONO }}>
                clear
              </button>
            )}
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
                    <span style={{ color: "var(--cc-bright)", fontFamily: MONO, fontSize: 13 }}>{job.script}{job.args ? ` ${job.args}` : ""}</span>
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
