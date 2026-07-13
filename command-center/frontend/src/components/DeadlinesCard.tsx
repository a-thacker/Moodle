// Deadlines card — from the eClass timeline (timeline_events). Module drives
// the row icon; the soonest item gets the accent treatment.

import type { Deadline, DeadlineModule } from "../types";
import { relativeDay } from "../utils/format";

const MODULE_ICON: Record<DeadlineModule, string> = {
  assign: "ph-file-text",
  quiz: "ph-question",
  forum: "ph-chats",
  other: "ph-dot-outline",
};

function DeadlineRow({ deadline, soonest }: { deadline: Deadline; soonest: boolean }) {
  const rel = relativeDay(deadline.due);
  const isNear = soonest || rel === "Today" || rel === "Tomorrow";
  return (
    <div className="row-hover" style={{ display: "flex", gap: 12, padding: "10px 8px" }}>
      <div
        style={{
          width: 34,
          height: 34,
          flex: "none",
          borderRadius: "var(--radius-md)",
          background: isNear ? "var(--color-accent-900)" : "var(--color-neutral-800)",
          color: isNear ? "var(--color-accent-200)" : "var(--color-neutral-300)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <i className={`ph ${MODULE_ICON[deadline.module]}`} style={{ fontSize: 17 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13 }}>{deadline.title}</div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-neutral-500)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {deadline.courseName}
        </div>
      </div>
      {isNear ? (
        <span className="tag tag-outline" style={{ alignSelf: "flex-start", whiteSpace: "nowrap" }}>
          {rel}
        </span>
      ) : (
        <span style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--color-neutral-400)", whiteSpace: "nowrap" }}>
          {rel}
        </span>
      )}
    </div>
  );
}

export default function DeadlinesCard({ deadlines }: { deadlines: Deadline[] }) {
  return (
    <section className="card" style={{ padding: "var(--space-6)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i className="ph ph-calendar-dots" style={{ color: "var(--color-accent)" }} />
          <span className="card-title" style={{ fontSize: 15 }}>Deadlines</span>
        </div>
        <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>from eClass timeline</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {deadlines.map((deadline, i) => (
          <DeadlineRow key={deadline.id} deadline={deadline} soonest={i === 0} />
        ))}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: "var(--space-2)",
            padding: "10px 10px",
            border: "1px dashed var(--color-divider)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <i className="ph ph-tree-structure" style={{ color: "var(--color-neutral-500)", fontSize: 15 }} />
          <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>
            More arrive as Fall '26 activities open on eClass.
          </span>
        </div>
      </div>
    </section>
  );
}
