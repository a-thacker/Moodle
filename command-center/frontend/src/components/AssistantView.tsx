// The Assistant is Claude Code, running on the server as a web terminal
// (ttyd) on port 7681. It's logged in with the Claude subscription and can
// read/write the dashboard via the `cc` CLI. Embedded here; also openable in
// its own tab. (The quick "?" omni-bar still uses the local Ollama model.)

import { useRef, useState } from "react";

const TERMINAL_PORT = 7681;

export default function AssistantView() {
  const url = `${window.location.protocol}//${window.location.hostname}:${TERMINAL_PORT}/`;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [key, setKey] = useState(0);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span className="pulse" style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--cc-accent)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>Assistant</h2>
        <span style={{ fontSize: 12, color: "var(--cc-muted)" }}>Claude Code · knows &amp; can edit your dashboard (via <code style={{ color: "var(--cc-accent-soft)" }}>cc</code>)</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setKey((k) => k + 1)}>Restart</button>
          <a className="btn btn-ghost" style={{ fontSize: 12 }} href={url} target="_blank" rel="noreferrer">Open in tab ↗</a>
        </div>
      </div>
      <iframe
        key={key}
        ref={frameRef}
        src={url}
        title="Claude Code"
        style={{ flex: 1, width: "100%", border: "1px solid #20233a", borderRadius: 14, background: "#0a0b11", minHeight: 0 }}
      />
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--cc-dim)", fontFamily: "var(--font-mono)" }}>
        tip: ask "what's on my plate today?" or "add gym mon/wed/fri at 6am" — it runs `cc context` and acts on your real data.
      </div>
    </div>
  );
}
