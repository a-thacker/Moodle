// A single focused tool view — one centered column with a consistent icon +
// title header (matches the standalone tool pages). Used by the Grades,
// Deadlines, Grocery, and Settings views.

import type { ReactNode } from "react";

export default function FocusView({
  title,
  icon,
  meta,
  children,
}: {
  title: string;
  /** Phosphor icon name shown before the title (e.g. "ph-exam"). */
  icon?: string;
  /** Optional muted text/count shown after the title. */
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="cc-focusview" style={{ flex: 1, overflow: "auto" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {icon && <i className={`ph ${icon}`} style={{ color: "var(--cc-accent)", fontSize: 20 }} />}
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>{title}</h2>
          {meta != null && <span style={{ fontSize: 12, color: "var(--cc-muted)" }}>{meta}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}
