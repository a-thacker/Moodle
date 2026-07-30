// The Assistant: a native chat with Claude, integrated into the site. The
// backend relays each message to a host bridge running headless `claude -p` on
// Alden's subscription (free — counts against the existing Claude quota, not
// the paid API). Claude can read and change the dashboard through the `cc`
// CLI, so "add gym mon/wed/fri at 6am" or "what's due this week?" just work.
// History is persisted server-side and shared with the "?" omni-bar.

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { api } from "../api/client";
import { notifyTasksChanged } from "../hooks/useTasks";
import PageShell from "./PageShell";

interface Msg {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

const OWNER_SUGGESTIONS = [
  "What's on my plate today?",
  "Add gym mon/wed/fri at 6am",
  "What's due this week?",
];

interface AssistantViewProps {
  // Defaults describe the owner's Claude assistant; the sibling passes its own.
  subtitle?: string;
  errorHint?: string;
  suggestions?: string[];
}

export default function AssistantView({
  subtitle = "Claude · knows & can edit your planner (via cc)",
  errorHint = "Request failed. Is the Claude bridge running?",
  suggestions = OWNER_SUGGESTIONS,
}: AssistantViewProps = {}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.assistant
      .history()
      .then((h) => setMessages(h.map((m) => ({ role: m.role as Msg["role"], content: m.content }))))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  async function send(text: string) {
    const body = text.trim();
    if (!body || busy) return;
    setInput("");
    setBusy(true);
    setMessages((prev) => [...prev, { role: "user", content: body }, { role: "assistant", content: "", pending: true }]);
    try {
      const r = await api.assistant.chat(body);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: r.reply };
        return next;
      });
      // Claude may have added/changed tasks via `cc`; refresh the dashboard.
      notifyTasksChanged();
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: errorHint };
        return next;
      });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  async function clearAll() {
    await api.assistant.clear().catch(() => {});
    setMessages([]);
  }

  const empty = loaded && messages.length === 0;

  return (
    <PageShell
      title="Assistant"
      icon="ph-sparkle"
      subtitle={subtitle}
      scroll={false}
      actions={
        messages.length > 0 ? (
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={clearAll}>
            Clear
          </button>
        ) : undefined
      }
    >
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          border: "1px solid #20233a",
          borderRadius: 14,
          background: "#0a0b11",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {empty ? (
          <div style={{ margin: "auto", textAlign: "center", maxWidth: 420 }}>
            <div style={{ fontSize: 15, color: "var(--cc-text)", marginBottom: 6 }}>Ask about your schedule, or tell me to change it.</div>
            <div style={{ fontSize: 13, color: "var(--cc-muted)", marginBottom: 18 }}>I know your grades, deadlines, tasks, and lists — and I can act on them.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  style={{ background: "#161824", border: "1px solid #2a2e42", borderRadius: 20, padding: "7px 14px", color: "var(--cc-accent-soft)", fontSize: 12.5, cursor: "pointer" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <Bubble key={i} msg={m} />)
        )}
      </div>

      <form onSubmit={onSubmit} style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "flex-end" }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message the assistant…  (Enter to send, Shift+Enter for newline)"
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            background: "#0e0f16",
            border: "1px solid #1b1e2c",
            borderRadius: 12,
            padding: "12px 14px",
            color: "var(--cc-bright)",
            fontSize: 14,
            fontFamily: "inherit",
            outline: "none",
            maxHeight: 140,
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            flexShrink: 0,
            background: busy || !input.trim() ? "#232739" : "var(--cc-accent)",
            color: busy || !input.trim() ? "var(--cc-muted)" : "#100f1c",
            border: "none",
            borderRadius: 12,
            padding: "12px 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: busy || !input.trim() ? "default" : "pointer",
          }}
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
    </PageShell>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "78%",
          background: isUser ? "var(--cc-accent)" : "#161824",
          color: isUser ? "#100f1c" : "var(--cc-text)",
          border: isUser ? "none" : "1px solid #262a3b",
          borderRadius: 14,
          padding: "10px 14px",
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.pending ? <span className="pulse" style={{ color: "var(--cc-muted)" }}>thinking…</span> : msg.content}
      </div>
    </div>
  );
}
