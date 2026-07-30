// Movie ripper — a friendly, no-SSH way to rip a DVD/Blu-ray into Jellyfin.
// You type the movie name, pick what to do with extra tracks, and click Rip.
// The backend queues the job; a runner on the server drives makemkvcon and
// streams progress back here. Built to be usable by someone non-technical.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { api } from "../api/client";
import type { RipJob } from "../types";
import PageShell from "./PageShell";

const MONO = "var(--font-mono)";
const INPUT: CSSProperties = {
  background: "#0a0b11",
  border: "1px solid #262a3b",
  borderRadius: 10,
  padding: "12px 14px",
  color: "var(--cc-bright)",
  fontSize: 15,
  outline: "none",
};

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
  const [mode, setMode] = useState<"movie" | "tv">("movie");
  const [title, setTitle] = useState("");
  const [extras, setExtras] = useState<RipJob["extras"]>("extras");
  // TV fields
  const [show, setShow] = useState("");
  const [season, setSeason] = useState("1");
  const [startEp, setStartEp] = useState("1");
  const [epCount, setEpCount] = useState("");
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

  const tvReady =
    show.trim() !== "" && season.trim() !== "" && startEp.trim() !== "" && Number(epCount) >= 1;
  const canRip = mode === "movie" ? title.trim() !== "" : tvReady;

  async function startRip() {
    if (!canRip || busy) return;
    setBusy(true);
    try {
      const req =
        mode === "movie"
          ? { media_type: "movie" as const, title: title.trim(), extras }
          : {
              media_type: "tv" as const,
              show: show.trim(),
              season: Number(season),
              start_episode: Number(startEp),
              episode_count: Number(epCount),
            };
      const job = await api.rip.create(req);
      expandedTouched.current = false;
      setJobs((prev) => [job, ...prev]);
      setExpanded(job.id);
      if (mode === "movie") setTitle("");
      else setStartEp(String(Number(startEp) + Number(epCount))); // next disc continues numbering
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

  async function removeJob(id: number) {
    // Optimistically drop it; unsticks a job wedged in the queue too.
    setJobs((prev) => prev.filter((j) => j.id !== id));
    await api.rip.deleteJob(id).catch(() => {});
  }

  return (
    <PageShell
      title="Disc ripper"
      icon="ph-film-reel"
      subtitle="Rip movies & TV straight into Jellyfin"
      scroll={false}
    >
      <p style={{ color: "var(--cc-muted)", fontSize: 13, margin: "0 0 14px", lineHeight: 1.6, flexShrink: 0 }}>
        Put a disc in the drive, fill in the details, and press Rip. It's added to
        Jellyfin automatically and the disc ejects when it's done.
      </p>

      {/* Movie / TV toggle */}
      <div style={{ display: "flex", gap: 6, background: "var(--cc-tile)", border: "1px solid #262a3b", borderRadius: 10, padding: 4, marginBottom: 14, flexShrink: 0, alignSelf: "flex-start" }}>
        {([["movie", "Movie", "ph-film-slate"], ["tv", "TV show", "ph-television-simple"]] as const).map(([m, label, icon]) => {
          const on = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{ display: "flex", alignItems: "center", gap: 7, background: on ? "var(--cc-accent)" : "transparent", color: on ? "#100f1c" : "var(--cc-muted)", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
            >
              <i className={`ph ${icon}`} style={{ fontSize: 16 }} /> {label}
            </button>
          );
        })}
      </div>

      {/* Rip form */}
      <div style={{ border: "1px solid var(--color-divider)", borderRadius: 14, background: "var(--color-neutral-900)", padding: 18, display: "flex", flexDirection: "column", gap: 14, flexShrink: 0 }}>
        {mode === "movie" ? (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12.5, color: "var(--cc-text)" }}>Movie name <span style={{ color: "var(--cc-dim)" }}>(include the year)</span></span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") startRip(); }}
                placeholder="e.g. Cars (2006)"
                style={INPUT}
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
          </>
        ) : (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12.5, color: "var(--cc-text)" }}>Show name</span>
              <input value={show} onChange={(e) => setShow(e.target.value)} placeholder="e.g. Planet Earth" style={INPUT} />
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label style={{ flex: "1 1 90px", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12.5, color: "var(--cc-text)" }}>Season</span>
                <input type="number" min={0} value={season} onChange={(e) => setSeason(e.target.value)} style={INPUT} />
              </label>
              <label style={{ flex: "1 1 110px", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12.5, color: "var(--cc-text)" }}>Starting episode</span>
                <input type="number" min={1} value={startEp} onChange={(e) => setStartEp(e.target.value)} style={INPUT} />
              </label>
              <label style={{ flex: "1 1 130px", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12.5, color: "var(--cc-text)" }}>Episodes on this disc</span>
                <input type="number" min={1} value={epCount} onChange={(e) => setEpCount(e.target.value)} placeholder="e.g. 3" style={INPUT} />
              </label>
            </div>
            <p style={{ margin: 0, fontSize: 11.5, color: "var(--cc-muted)", lineHeight: 1.5 }}>
              It rips the episode-length titles on this disc (skipping menus and the “play all”)
              and names them <code style={{ color: "var(--cc-accent-soft)", fontFamily: MONO }}>S{season.padStart(2, "0")}E{startEp.padStart(2, "0")}…</code>.
              Insert the next disc afterward and the episode number continues automatically.
            </p>
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={startRip}
            disabled={!canRip || busy}
            style={{ display: "flex", alignItems: "center", gap: 8, background: !canRip || busy ? "#232739" : "var(--cc-accent)", color: !canRip || busy ? "var(--cc-muted)" : "#100f1c", border: "none", borderRadius: 10, padding: "12px 22px", fontSize: 15, fontWeight: 600, cursor: !canRip || busy ? "default" : "pointer" }}
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
              <div style={{ display: "flex", alignItems: "center" }}>
                <button
                  onClick={() => { expandedTouched.current = true; setExpanded(open ? null : job.id); }}
                  style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 11, padding: "13px 4px 13px 15px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <span className={job.status === "running" ? "pulse" : ""} style={{ width: 9, height: 9, borderRadius: "50%", background: st.color, flexShrink: 0 }} />
                  <span style={{ color: "var(--cc-bright)", fontSize: 14, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.title}</span>
                  <span style={{ color: st.color, fontSize: 11.5, fontFamily: MONO, textTransform: "uppercase", letterSpacing: ".05em", flexShrink: 0 }}>{st.label}</span>
                  <span style={{ marginLeft: "auto", color: "var(--cc-dim)", fontSize: 11, fontFamily: MONO, flexShrink: 0 }}>{fmtTime(job.created_at)}</span>
                  <i className={`ph ${open ? "ph-caret-up" : "ph-caret-down"}`} style={{ fontSize: 13, color: "var(--cc-muted)", flexShrink: 0 }} />
                </button>
                <button
                  onClick={() => removeJob(job.id)}
                  title={job.status === "pending" || job.status === "running" ? "Remove from queue" : "Remove"}
                  style={{ flexShrink: 0, display: "flex", alignItems: "center", padding: "13px 15px", background: "none", border: "none", cursor: "pointer", color: "var(--cc-dim)" }}
                >
                  <i className="ph ph-trash" style={{ fontSize: 14 }} />
                </button>
              </div>
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
    </PageShell>
  );
}
