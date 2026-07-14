// A single focused tool view — one centered column. Used by the Grades,
// Deadlines, and Grocery rail tools (each surfaces the same card the
// dashboard shows, on its own).

import type { ReactNode } from "react";

export default function FocusView({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ flex: 1, overflow: "auto", padding: "var(--space-8)" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, margin: 0 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
