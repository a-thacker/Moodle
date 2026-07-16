// The omni-bar: a persistent bottom bar with three modes.
//   task (default)  → adds a Task            (leading "- " switches back to it)
//   ask             → asks the assistant     (leading "?")
//   script          → runs a Mac script      (leading "/")
// The mode is STICKY: a leading special character switches it and is consumed,
// then it stays until another special character (or the mode chip is clicked).
// Results — task confirmations, assistant replies, script output — appear in a
// panel above the bar.

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { api } from "../api/client";
import { useClock } from "../hooks/useClock";
import { notifyTasksChanged } from "../hooks/useTasks";
import { useNav } from "../nav/NavContext.tsx";
import { parseTaskInput } from "../utils/time";
import type { ScriptInfo } from "../types";

type Mode = "task" | "ask" | "script";

const MODES: Record<Mode, { icon: string; label: string; placeholder: string; prefix: string }> = {
  task: { icon: "ph-note", label: "Task", placeholder: "Add a task…", prefix: "" },
  ask: { icon: "ph-sparkle", label: "Ask", placeholder: "Ask the assistant…", prefix: "?" },
  script: { icon: "ph-terminal-window", label: "Run", placeholder: "Run a script — e.g. gamdl p.zp6… (type its name)", prefix: "/" },
};
const CYCLE: Mode[] = ["task", "ask", "script"];

interface Entry {
  id: number;
  mode: Mode;
  input: string;
  output: string;
  ok: boolean;
  pending: boolean;
}

export default function CommandBar() {
  const clock = useClock();
  const { setPaletteOpen } = useNav();
  const [mode, setMode] = useState<Mode>("task");
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timers = useRef<Set<ReturnType<typeof setInterval>>>(new Set());
  // Date to apply to the next quick-added task (set by the planner's
  // "+ add to today/tomorrow" footer); cleared after one task.
  const pendingDate = useRef<string | null>(null);

  useEffect(() => {
    panelRef.current?.scrollTo(0, panelRef.current.scrollHeight);
  }, [entries]);

  // The planner footer ("+ add to today/tomorrow") focuses this bar in task
  // mode and pre-targets that day.
  useEffect(() => {
    const onQuickAdd = (e: Event) => {
      const detail = (e as CustomEvent).detail as { date?: string } | undefined;
      pendingDate.current = detail?.date ?? null;
      setMode("task");
      inputRef.current?.focus();
    };
    window.addEventListener("cc:quickadd", onQuickAdd);
    return () => window.removeEventListener("cc:quickadd", onQuickAdd);
  }, []);

  // Keep the script registry handy for name resolution while in script mode.
  useEffect(() => {
    if (mode !== "script") return;
    api.scripts.list().then(setScripts).catch(() => {});
  }, [mode]);

  // Clear any polling intervals on unmount.
  useEffect(() => {
    const set = timers.current;
    return () => set.forEach(clearInterval);
  }, []);

  // Consume a leading mode-switch character and flip the sticky mode.
  function onChange(v: string) {
    if (v.startsWith("?")) { setMode("ask"); setInput(v.slice(1).replace(/^ /, "")); return; }
    if (v.startsWith("/")) { setMode("script"); setInput(v.slice(1)); return; }
    if (v.startsWith("- ")) { setMode("task"); setInput(v.slice(2)); return; }
    setInput(v);
  }

  function cycleMode() {
    setMode(CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length]);
    inputRef.current?.focus();
  }

  function update(id: number, patch: Partial<Entry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function resolveScript(query: string): ScriptInfo | null {
    const q = query.toLowerCase();
    return (
      scripts.find((s) => s.id.toLowerCase() === q) ||
      scripts.find((s) => s.label.toLowerCase() === q) ||
      scripts.find((s) => s.id.toLowerCase().startsWith(q)) ||
      scripts.find((s) => s.id.toLowerCase().includes(q) || s.label.toLowerCase().includes(q)) ||
      null
    );
  }

  // Poll a queued script job until it finishes, streaming status into its entry.
  function pollJob(entryId: number, jobId: number) {
    const iv = setInterval(async () => {
      try {
        const job = (await api.scripts.jobs()).find((j) => j.id === jobId);
        if (!job) return;
        if (job.status === "done" || job.status === "failed") {
          clearInterval(iv);
          timers.current.delete(iv);
          const out = [job.stdout, job.stderr].filter(Boolean).join("\n").trim();
          update(entryId, { output: out || `(exit ${job.exit_code})`, ok: job.status === "done", pending: false });
        } else {
          update(entryId, { output: job.status === "running" ? "Running on your Mac…" : "Queued…", pending: true });
        }
      } catch {
        clearInterval(iv);
        timers.current.delete(iv);
      }
    }, 2000);
    timers.current.add(iv);
    // Safety stop after 20 minutes.
    setTimeout(() => { clearInterval(iv); timers.current.delete(iv); }, 20 * 60 * 1000);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = input.trim();
    if (!body || busy) return;
    const id = Date.now();
    setEntries((prev) => [...prev.slice(-24), { id, mode, input: body, output: "", ok: true, pending: true }]);
    setInput("");
    setBusy(true);
    try {
      if (mode === "task") {
        const { title, time, dates, category } = parseTaskInput(body);
        const todayStr = new Date().toLocaleDateString("en-CA");
        const fallback = time ? todayStr : pendingDate.current;
        const targets: (string | null)[] = dates.length ? dates : [fallback];
        pendingDate.current = null;
        for (const d of targets) await api.tasks.add(title, d, time, category);
        notifyTasksChanged();
        const suffix = dates.length > 1 ? ` on ${dates.length} days` : dates.length === 1 ? ` for ${dates[0]}` : "";
        update(id, { output: `Added "${title}"${time ? ` at ${time}` : ""}${category ? ` #${category}` : ""}${suffix}.`, ok: true, pending: false });
      } else if (mode === "script") {
        const name = body.split(/\s+/)[0];
        const argStr = body.slice(name.length).trim();
        const match = resolveScript(name);
        if (!match) {
          const avail = scripts.map((s) => s.id).join(", ") || "(none — is the Mac runner online?)";
          update(id, { output: `No script matching "${name}". Available: ${avail}`, ok: false, pending: false });
        } else {
          const job = await api.scripts.run(match.id, argStr || undefined);
          update(id, { input: `${match.id}${argStr ? ` ${argStr}` : ""}`, output: "Queued…", ok: true, pending: true });
          pollJob(id, job.id);
        }
      } else {
        const r = await api.assistant.chat(body);
        notifyTasksChanged(); // the assistant may have changed tasks via cc
        update(id, { output: r.reply, ok: r.available, pending: false });
      }
    } catch {
      update(id, { output: "Request failed.", ok: false, pending: false });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (input) setInput("");
      else setEntries([]);
    }
  }

  const m = MODES[mode];

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, position: "relative", zIndex: 10 }}>
      {entries.length > 0 && (
        <div
          ref={panelRef}
          style={{
            maxHeight: "38vh",
            overflowY: "auto",
            background: "#0e0f16",
            border: "1px solid #1b1e2c",
            borderRadius: 14,
            padding: "12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="cc-label">RESULTS</span>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setEntries([])}>Clear</button>
          </div>
          {entries.map((e) => (
            <div key={e.id} style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.5 }}>
              <div style={{ color: "var(--cc-accent-soft)" }}>
                <span style={{ color: "var(--cc-muted)" }}>{MODES[e.mode].prefix || "•"}</span> {e.input}
              </div>
              {e.pending ? (
                <div style={{ color: "var(--cc-muted)" }}>{e.output || "…"}</div>
              ) : (
                <pre style={{ margin: "2px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", color: e.ok ? "var(--cc-text)" : "#f08e79" }}>{e.output}</pre>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#0e0f16", border: "1px solid #1b1e2c", borderRadius: 14, padding: "10px 14px" }}>
        <button
          type="button"
          onClick={cycleMode}
          title="Switch mode — or type ? (ask), / (script), '- ' (task)"
          style={{ display: "flex", alignItems: "center", gap: 7, background: "#181a26", border: "1px solid #262a3b", borderRadius: 9, padding: "6px 11px", color: "var(--cc-accent-soft)", fontFamily: "var(--font-mono)", fontSize: 12, cursor: "pointer", flexShrink: 0 }}
        >
          <i className={`ph ${m.icon}`} style={{ fontSize: 15 }} />
          {m.label}
        </button>
        <form onSubmit={submit} style={{ flex: 1, display: "flex" }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={m.placeholder}
            spellCheck={mode === "script" ? false : undefined}
            autoCapitalize={mode === "script" ? "off" : undefined}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--cc-bright)", fontSize: 15, fontFamily: mode === "script" ? "var(--font-mono)" : "inherit" }}
          />
        </form>
        {busy && <span style={{ color: "var(--cc-muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}>…</span>}
        <button type="button" onClick={() => setPaletteOpen(true)} title="Jump to a tool (⌘K)" style={{ background: "none", border: "1px solid #2b3044", borderRadius: 5, padding: "2px 8px", color: "var(--cc-muted)", fontFamily: "var(--font-mono)", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>⌘K</button>
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontFamily: "var(--font-mono)", color: "#7a8099", flexShrink: 0 }}>
          <span className="pulse status-dot" /> {clock.hm} <span style={{ color: "var(--cc-dim)" }}>{clock.ampm}</span>
        </span>
      </div>
    </div>
  );
}
