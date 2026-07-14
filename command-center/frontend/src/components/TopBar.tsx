// Top bar: ⌘K search stub, agent-sync status, live clock.

import { useClock } from "../hooks/useClock";
import { useNav } from "../nav/NavContext.tsx";
import type { AgentStatus } from "../types";

export default function TopBar({ agent }: { agent: AgentStatus }) {
  const clock = useClock();
  const { setPaletteOpen } = useNav();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-6)",
        padding: "var(--space-4) var(--space-8)",
        borderBottom: "1px solid var(--color-divider)",
        flexShrink: 0,
      }}
    >
      {/* ⌘K search — opens the command palette */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          maxWidth: 460,
          background: "var(--color-surface)",
          border: "1px solid var(--color-divider)",
          borderRadius: "var(--radius-md)",
          padding: "8px 12px",
          cursor: "pointer",
          color: "inherit",
          textAlign: "left",
        }}
      >
        <i className="ph ph-magnifying-glass" style={{ color: "var(--color-accent)", fontSize: 16 }} />
        <span style={{ color: "var(--color-neutral-500)", fontSize: 13 }}>
          Search or jump to a tool…
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--color-neutral-500)",
            border: "1px solid var(--color-divider)",
            borderRadius: "var(--radius-sm)",
            padding: "1px 7px",
          }}
        >
          ⌘K
        </span>
      </button>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "var(--space-8)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--color-neutral-400)" }}>
          <span
            className="pulse status-dot"
            style={agent.sessionHealthy ? undefined : { background: "var(--color-accent-400)" }}
          />
          <span>
            agent synced <span style={{ color: "var(--color-text)" }}>{agent.lastRun.replace(" · ok", "")}</span>
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 17 }}>
            {clock.hm} <span style={{ color: "var(--color-neutral-500)", fontSize: 12 }}>{clock.ampm}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{clock.dateLong}</div>
        </div>
      </div>
    </header>
  );
}
