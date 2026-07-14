// The omni-bar: a persistent bottom bar that changes what it does by mode.
//   plain text  → adds a Task
//   "/…"        → runs a command (in the backend container)
//   "?…"        → asks the assistant (Ollama)
// The leading character switches mode live; the mode chip is also clickable to
// cycle. Results appear in a panel above the bar.

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

type Mode = "task" | "command" | "ai";

const MODES: Record<Mode, { icon: string; label: string; placeholder: string; prefix: string }> = {
  task: { icon: "ph-note", label: "Task", placeholder: "Add a task…  (-1:17 time · -m -w -f days · -wd weekdays · -e every day)", prefix: "" },
  command: { icon: "ph-terminal-window", label: "Run", placeholder: "Run a command in the container…", prefix: "/" },
  ai: { icon: "ph-sparkle", label: "Ask", placeholder: "Ask the assistant…", prefix: "?" },
};
const CYCLE: Mode[] = ["task", "command", "ai"];

interface Entry {
  id: number;
  mode: Mode;
  input: string;
  output: string;
  ok: boolean;
  pending: boolean;
}

function parse(input: string): { mode: Mode; text: string } {
  if (input.startsWith("/")) return { mode: "command", text: input.slice(1) };
  if (input.startsWith("?")) return { mode: "ai", text: input.slice(1) };
  return { mode: "task", text: input };
}

export default function CommandBar() {
  const clock = useClock();
  const { setPaletteOpen } = useNav();
  const [input, setInput] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { mode, text } = parse(input);

  useEffect(() => {
    panelRef.current?.scrollTo(0, panelRef.current.scrollHeight);
  }, [entries]);

  function cycleMode() {
    const next = CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length];
    setInput(MODES[next].prefix + text);
    inputRef.current?.focus();
  }

  function update(id: number, patch: Partial<Entry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    const id = Date.now();
    setEntries((prev) => [...prev.slice(-24), { id, mode, input: body, output: "", ok: true, pending: true }]);
    setInput("");
    setBusy(true);
    try {
      if (mode === "task") {
        const { title, time, dates } = parseTaskInput(body);
        const todayStr = new Date().toLocaleDateString("en-CA");
        const targets: (string | null)[] = dates.length ? dates : [time ? todayStr : null];
        for (const d of targets) await api.tasks.add(title, d, time);
        notifyTasksChanged();
        const suffix = dates.length > 1 ? ` on ${dates.length} days` : dates.length === 1 ? ` for ${dates[0]}` : "";
        update(id, { output: `Added "${title}"${time ? ` at ${time}` : ""}${suffix}.`, ok: true, pending: false });
      } else if (mode === "command") {
        const r = await api.scripts.run({ command: body });
        const out = [r.stdout, r.stderr].filter(Boolean).join("\n").trim();
        update(id, { output: out || `(exit ${r.exit_code})`, ok: r.exit_code === 0, pending: false });
      } else {
        const r = await api.assistant.chat(body);
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
                <div style={{ color: "var(--cc-muted)" }}>…</div>
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
          title="Switch mode (type / or ? to switch instantly)"
          style={{ display: "flex", alignItems: "center", gap: 7, background: "#181a26", border: "1px solid #262a3b", borderRadius: 9, padding: "6px 11px", color: "var(--cc-accent-soft)", fontFamily: "var(--font-mono)", fontSize: 12, cursor: "pointer", flexShrink: 0 }}
        >
          <i className={`ph ${m.icon}`} style={{ fontSize: 15 }} />
          {m.label}
        </button>
        <form onSubmit={submit} style={{ flex: 1, display: "flex" }}>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={m.placeholder}
            spellCheck={mode === "command" ? false : undefined}
            autoCapitalize={mode === "command" ? "off" : undefined}
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--cc-bright)", fontSize: 15, fontFamily: mode === "command" ? "var(--font-mono)" : "inherit" }}
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
