// Dedicated assistant chat — full conversation with history, unlike the
// quick omni-bar. It's system-aware (grades, tasks, weather, ...) and can add
// tasks when asked. Uses whatever provider the backend has (Claude or Ollama).

import { useEffect, useRef, useState, type FormEvent } from "react";

import { api } from "../api/client";
import { notifyTasksChanged } from "../hooks/useTasks";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export default function AssistantView() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.assistant.history().then((h) => setMessages(h as Msg[])).catch(() => {});
  }, []);
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, busy]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api.assistant.chat(text);
      setMessages((m) => [...m, { role: "assistant", content: r.reply }]);
      notifyTasksChanged(); // it may have added tasks
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Request failed." }]);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    await api.assistant.clear().catch(() => {});
    setMessages([]);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span className="pulse" style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--cc-accent)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>Assistant</h2>
        <span style={{ fontSize: 12, color: "var(--cc-muted)" }}>knows your tasks, grades, deadlines & weather</span>
        <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 12 }} onClick={clear}>Clear</button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 12, padding: "4px 2px" }}>
        {messages.length === 0 && !busy && (
          <div style={{ color: "var(--cc-muted)", fontSize: 14, margin: "auto", textAlign: "center", maxWidth: 420 }}>
            Ask me anything about your schedule, or tell me to add tasks — e.g.
            "add gym to every day this week" or "what's due soon?"
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "76%", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 14, lineHeight: 1.5, padding: "10px 14px", borderRadius: 14, background: m.role === "user" ? "var(--cc-accent)" : "#1c1f2e", color: m.role === "user" ? "#100f1c" : "var(--cc-text)", border: m.role === "user" ? "none" : "1px solid #262a3b" }}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div style={{ color: "var(--cc-muted)", fontSize: 13 }}>thinking…</div>}
      </div>

      <form onSubmit={send} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input className="input" placeholder="Message the assistant…" value={input} onChange={(e) => setInput(e.target.value)} autoFocus style={{ flex: 1, fontSize: 15 }} />
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ paddingInline: 20 }}>Send</button>
      </form>
    </div>
  );
}
