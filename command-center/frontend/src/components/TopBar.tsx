// Top bar (TARGET styling): ⌘K search that opens the palette, a status pill,
// and the live clock.

import { useClock } from "../hooks/useClock";
import { useNav } from "../nav/NavContext.tsx";

export default function TopBar() {
  const clock = useClock();
  const { setPaletteOpen } = useNav();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        style={{
          flex: 1,
          maxWidth: 620,
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "#161824",
          border: "1px solid #262a3b",
          borderRadius: 12,
          padding: "13px 18px",
          cursor: "pointer",
          color: "inherit",
          textAlign: "left",
        }}
      >
        <i className="ph ph-magnifying-glass" style={{ color: "var(--cc-accent)", fontSize: 16 }} />
        <span style={{ color: "var(--cc-muted)", fontSize: 15 }}>
          Search, jump to a tool, or run a command…
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--cc-muted)",
            border: "1px solid #2b3044",
            borderRadius: 5,
            padding: "2px 8px",
          }}
        >
          ⌘K
        </span>
      </button>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 20 }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            color: "#7a8099",
          }}
        >
          <span className="pulse status-dot" /> home.net · all up
        </span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: "#f0f1f6" }}>
            {clock.hm} <span style={{ fontSize: 13, color: "var(--cc-muted)" }}>{clock.ampm}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--cc-muted)" }}>{clock.dateLong}</div>
        </div>
      </div>
    </div>
  );
}
