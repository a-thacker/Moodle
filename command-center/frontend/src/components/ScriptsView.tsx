// Scripts / terminal tool. One-click registered scripts plus a free-form
// command box; commands run inside the backend container (owner-only) and the
// output streams into a terminal-style log.

import { useEffect, useRef, useState, type FormEvent } from "react";

import { api } from "../api/client";
import type { RunResult, ScriptInfo } from "../types";

interface LogEntry extends RunResult {
  key: number;
}

export default function ScriptsView() {
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [command, setCommand] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.scripts.list().then(setScripts).catch(() => {});
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [log]);

  async function run(body: { script_id?: string; command?: string }) {
    setRunning(true);
    try {
      const result = await api.scripts.run(body);
      setLog((prev) => [...prev, { ...result, key: Date.now() }]);
    } catch {
      setLog((prev) => [
        ...prev,
        {
          key: Date.now(),
          command: body.command ?? body.script_id ?? "",
          stdout: "",
          stderr: "request failed",
          exit_code: null,
          duration_ms: 0,
          timed_out: false,
        },
      ]);
    } finally {
      setRunning(false);
    }
  }

  function submitCommand(e: FormEvent) {
    e.preventDefault();
    if (!command.trim() || running) return;
    run({ command });
    setCommand("");
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: "var(--space-8)", gap: "var(--space-6)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <i className="ph ph-terminal-window" style={{ color: "var(--color-accent)", fontSize: 20 }} />
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, margin: 0 }}>Scripts</h2>
        <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>runs in the backend container</span>
      </div>

      {/* one-click scripts */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {scripts.map((s) => (
          <button
            key={s.id}
            type="button"
            className="btn btn-ghost"
            title={s.description}
            disabled={running}
            onClick={() => run({ script_id: s.id })}
            style={{ fontSize: 13 }}
          >
            <i className="ph ph-play" style={{ fontSize: 13 }} /> {s.label}
          </button>
        ))}
      </div>

      {/* terminal log */}
      <div
        ref={logRef}
        style={{
          flex: 1,
          minHeight: 120,
          overflow: "auto",
          background: "#0d0f18",
          border: "1px solid var(--color-divider)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        {log.length === 0 && (
          <div style={{ color: "var(--color-neutral-600)" }}>
            Output appears here. Click a script or type a command below.
          </div>
        )}
        {log.map((entry) => (
          <div key={entry.key} style={{ marginBottom: 12 }}>
            <div style={{ color: "var(--color-accent-300)" }}>
              <span style={{ color: "var(--color-neutral-500)" }}>$</span> {entry.command}
            </div>
            {entry.stdout && <pre style={preStyle}>{entry.stdout}</pre>}
            {entry.stderr && <pre style={{ ...preStyle, color: "#ff8f8f" }}>{entry.stderr}</pre>}
            <div style={{ color: "var(--color-neutral-600)", fontSize: 11 }}>
              exit {entry.exit_code ?? "killed"} · {entry.duration_ms} ms
              {entry.timed_out ? " · timed out" : ""}
            </div>
          </div>
        ))}
        {running && <div style={{ color: "var(--color-neutral-500)" }}>running…</div>}
      </div>

      {/* command box */}
      <form onSubmit={submitCommand} style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          placeholder="Type a command (e.g. alembic current, ls -la, python -c '...')"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          style={{ flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
        />
        <button type="submit" className="btn btn-primary" disabled={running} style={{ paddingInline: "var(--space-6)" }}>
          Run
        </button>
      </form>
    </div>
  );
}

const preStyle = {
  margin: "2px 0",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
  color: "var(--color-neutral-200)",
};
