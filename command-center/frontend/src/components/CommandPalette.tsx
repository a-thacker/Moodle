// ⌘K command palette: fuzzy-filter the tools and jump to one. Opened by the
// top-bar search or the ⌘K/Ctrl-K shortcut (handled in NavProvider).

import { useEffect, useMemo, useRef, useState } from "react";

import { useNav, type View } from "../nav/NavContext.tsx";

interface Command {
  view: View;
  label: string;
  icon: string;
  hint: string;
}

const COMMANDS: Command[] = [
  { view: "dashboard", label: "Dashboard", icon: "ph-squares-four", hint: "Overview" },
  { view: "grades", label: "Grades", icon: "ph-exam", hint: "Course totals" },
  { view: "deadlines", label: "Deadlines", icon: "ph-calendar-dots", hint: "Upcoming due dates" },
  { view: "grocery", label: "Grocery", icon: "ph-basket", hint: "Shared list" },
  { view: "scripts", label: "Scripts", icon: "ph-terminal-window", hint: "Run commands" },
  { view: "settings", label: "Settings", icon: "ph-gear-six", hint: "Password & account" },
];

export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setView } = useNav();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [paletteOpen]);

  useEffect(() => setActive(0), [query]);

  if (!paletteOpen) return null;

  function choose(view: View) {
    setView(view);
    setPaletteOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      choose(results[active].view);
    }
  }

  return (
    <div
      onClick={() => setPaletteOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: 520, maxWidth: "90vw", padding: 0, overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--color-divider)" }}>
          <i className="ph ph-magnifying-glass" style={{ color: "var(--color-accent)", fontSize: 16 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a tool…"
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--color-text)", fontSize: 15 }}
          />
        </div>
        <div style={{ maxHeight: 320, overflow: "auto", padding: 6 }}>
          {results.length === 0 && (
            <div style={{ padding: "12px 10px", color: "var(--color-neutral-500)", fontSize: 13 }}>No matches.</div>
          )}
          {results.map((c, i) => (
            <button
              key={c.view}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(c.view)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                textAlign: "left",
                background: i === active ? "color-mix(in srgb, var(--color-accent) 16%, transparent)" : "transparent",
                color: "var(--color-text)",
              }}
            >
              <i className={`ph ${c.icon}`} style={{ fontSize: 17, color: "var(--color-accent-200)" }} />
              <span style={{ fontSize: 14 }}>{c.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-neutral-500)" }}>{c.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
