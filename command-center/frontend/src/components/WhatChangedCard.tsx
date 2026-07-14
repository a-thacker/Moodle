// "What changed" feed — grade_events (graded/changed/feedback) plus agent
// sync notes. Kind drives the tag styling.

import type { GradeEvent, GradeEventKind } from "../types";

function tagClass(kind: GradeEventKind): string {
  return kind === "graded" || kind === "changed" || kind === "feedback"
    ? "tag tag-accent"
    : "tag tag-neutral";
}

export default function WhatChangedCard({ events }: { events: GradeEvent[] }) {
  return (
    <section className="card" style={{ padding: "var(--space-6)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-4)" }}>
        <i className="ph ph-arrows-clockwise" style={{ color: "var(--color-accent)" }} />
        <span className="card-title" style={{ fontSize: 15 }}>What changed</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {events.length === 0 && (
          <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>
            No changes yet — the agent posts new grades and feedback here.
          </span>
        )}
        {events.map((event) => (
          <div key={event.id} style={{ display: "flex", gap: 10 }}>
            <span className={tagClass(event.kind)} style={{ alignSelf: "flex-start", flex: "none" }}>
              {event.kind}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{event.title}</div>
              {event.detail && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-neutral-500)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {event.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
