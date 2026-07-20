// Movie ripper — a friendly, no-SSH way to rip a DVD/Blu-ray into Jellyfin.
// You type the movie name, pick what to do with extra tracks, and click Rip.
// The backend queues the job; a runner on the server drives makemkvcon and
// streams progress back here. Built to be usable by someone non-technical.

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api/client";
import type { RipJob } from "../types";

const MONO = "var(--font-mono)";

const STATUS: Record<RipJob["status"], { label: string; color: string; blurb: string }> = {
  pending: { label: "Waiting", color: "var(--cc-muted)", blurb: "Waiting for the server to start…" },
  running: { label: "Ripping", color: "var(--cc-accent-soft)", blurb: "Ripping the disc — this can take a while. You can leave this page." },
  done: { label: "Done", color: "var(--cc-good)", blurb: "Done — added to Jellyfin." },
  failed: { label: "Problem", color: "var(--cc-bad)", blurb: "Something went wrong. See the details below." },
};

const EXTRAS: { value: RipJob["extras"]; label: string; hint: string }[] = [
  { value: "extras", label: "Move extras aside", hint: "Keep the movie; tuck bonus tracks into an extras folder" },
  { value: "keep", label: "Keep everything", hint: "Leave every track as-is" },
  { value: "delete", label: "Just the movie", hint: "Delete the bonus tracks" },
];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function RipView() {
  const [title, setTitle] = useState("");
  const [extras, setExtras] = useState<RipJob["extras"]>("extras");
  const [jobs, setJobs] = useState<RipJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const expandedTouched = useRef(false);

  const refresh = useCallback(() => {
    api.rip.jobs().then(setJobs).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [refresh]);

  // Auto-open the newest job until the user manually toggles something.
  useEffect(() => {
    if (!expandedTouched.current && jobs.length > 0) setExpanded(jobs[0].id);
  }, [jobs]);

  const active = jobs.some((j) => j.status === "pending" || j.status === "running");

  async function startRip() {
    const name = title.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const job = await api.rip.create(name, extras);
      expandedTouched.current = false;
      setJobs((prev) => [job, ...prev]);
      setExpanded(job.id);
      setTitle("");
    } catch {
      /* surfaced by the jobs list / offline hint */
    } finally {
      setBusy(false);
    }
  }

  async function clearRuns() {
    await api.rip.clearJobs().catch(() => {});
    setJobs((prev) => prev.filter((j) => j.status === "pending" || j.status === "running"));
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <i className="ph ph-film-reel" style={{ fontSize: 20, color: "var(--cc-accent)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>Movie ripper</h2>
      </div>
      <p style={{ color: "var(--cc-muted)", fontSize: 13, margin: "0 0 16px", lineHeight: 1.6 }}>
        Put a movie disc in the drive, type the name below, and press Rip. It gets
        added to Jellyfin automatically and the disc ejects when it's done.
      </p>

      {/* Rip form */}
      <div style={{ border: "1px solid #20233a", borderRadius: 14, background: "#0e0f16", padding: 18, display: "flex", flexDirection: "column", gap: 14, flexShrink: 0 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12.5, color: "var(--cc-text)" }}>Movie name <span style={{ color: "var(--cc-dim)" }}>(include the year)</span></span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") startRip(); }}
            placeholder="e.g. Cars (2006)"
            style={{ background: "#0a0b11", border: "1px solid #262a3b", borderRadius: 10, padding: "12px 14px", color: "var(--cc-bright)", fontSize: 15, outline: "none" }}
          />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12.5, color: "var(--cc-text)" }}>Bonus tracks</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {EXTRAS.map((opt) => {
              const on = extras === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setExtras(opt.value)}
                  title={opt.hint}
                  style={{ flex: "1 1 150px", textAlign: "left", background: on ? "#1c1f30" : "var(--cc-tile)", border: `1px solid ${on ? "var(--cc-accent)" : "#262a3b"}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 3 }}
                >
                  <span style={{ color: on ? "var(--cc-bright)" : "var(--cc-text)", fontSize: 13, fontWeight: 500 }}>{opt.label}</span>
                  <span style={{ color: "var(--cc-muted)", fontSize: 11.5, lineHeight: 1.4 }}>{opt.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={startRip}
            disabled={!title.trim() || busy}
            style={{ display: "flex", alignItems: "center", gap: 8, background: !title.trim() || busy ? "#232739" : "var(--cc-accent)", color: !title.trim() || busy ? "var(--cc-muted)" : "#100f1c", border: "none", borderRadius: 10, padding: "12px 22px", fontSize: 15, fontWeight: 600, cursor: !title.trim() || busy ? "default" : "pointer" }}
          >
            <i className="ph ph-disc" style={{ fontSize: 18 }} />
            {busy ? "Starting…" : "Rip this disc"}
          </button>
          {active && (
            <span style={{ fontSize: 12.5, color: "var(--cc-accent-soft)" }}>
              A rip is in progress — you can queue another when it finishes.
            </span>
          )}
        </div>
      </div>

      {/* Jobs */}
      <div style={{ display: "flex", alignItems: "center", marginTop: 20, marginBottom: 10 }}>
        <span className="cc-label">RECENT RIPS</span>
        {jobs.some((j) => j.status === "done" || j.status === "failed") && (
          <button onClick={clearRuns} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--cc-muted)", fontSize: 12, fontFamily: MONO }}>
            clear finished
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {loaded && jobs.length === 0 && (
          <div style={{ margin: "auto", color: "var(--cc-muted)", fontSize: 13, textAlign: "center", padding: 24 }}>
            No rips yet. Insert a disc and rip your first movie above.
          </div>
        )}
        {jobs.map((job) => {
          const st = STATUS[job.status];
          const open = expanded === job.id;
          return (
            <div key={job.id} style={{ border: "1px solid #1b1e2c", borderRadius: 12, overflow: "hidden", background: "#0a0b11" }}>
              <button
                onClick={() => { expandedTouched.current = true; setExpanded(open ? null : job.id); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "13px 15px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <span className={job.status === "running" ? "pulse" : ""} style={{ width: 9, height: 9, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                <span style={{ color: "var(--cc-bright)", fontSize: 14, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.title}</span>
                <span style={{ color: st.color, fontSize: 11.5, fontFamily: MONO, textTransform: "uppercase", letterSpacing: ".05em", flexShrink: 0 }}>{st.label}</span>
                <span style={{ marginLeft: "auto", color: "var(--cc-dim)", fontSize: 11, fontFamily: MONO, flexShrink: 0 }}>{fmtTime(job.created_at)}</span>
                <i className={`ph ${open ? "ph-caret-up" : "ph-caret-down"}`} style={{ fontSize: 13, color: "var(--cc-muted)", flexShrink: 0 }} />
              </button>
              {open && (
                <div style={{ padding: "0 15px 14px" }}>
                  <div style={{ fontSize: 12.5, color: st.color, marginBottom: 8 }}>{st.blurb}</div>
                  {job.progress && (
                    <pre style={{ margin: 0, padding: 12, background: "#0e0f16", borderRadius: 9, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: MONO, fontSize: 11.5, lineHeight: 1.5, color: job.status === "failed" ? "#f0a48e" : "var(--cc-text)", maxHeight: 300, overflowY: "auto" }}>
                      {job.progress}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
