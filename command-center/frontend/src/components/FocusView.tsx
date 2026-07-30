// A single focused tool view — the shared page frame (PageShell) wrapping one
// centered reading column. Used by the Grades, Deadlines, Grocery, and Settings
// views so they match the standalone tool pages.

import type { ReactNode } from "react";

import PageShell from "./PageShell";

export default function FocusView({
  title,
  icon,
  meta,
  children,
}: {
  title: string;
  /** Phosphor icon name shown in the header chip (e.g. "ph-exam"). */
  icon?: string;
  /** Optional muted context shown under the title. */
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PageShell title={title} icon={icon} subtitle={meta}>
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
        }}
      >
        {children}
      </div>
    </PageShell>
  );
}
