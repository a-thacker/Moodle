// Deadlines — from the eClass timeline (timeline_events). Module drives the row
// icon; near items (soonest / today / tomorrow) get the accent treatment.
// Rendered inside the Deadlines tool page (PageShell provides the header).

import type { Deadline, DeadlineModule } from "../types";
import { relativeDay } from "../utils/format";
import EmptyState from "./EmptyState.tsx";

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
    <div
      className="row-hover"
      style={{ display: "flex", gap: 12, padding: "10px 8px", borderRadius: 10, alignItems: "center" }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          flex: "none",
          borderRadius: 10,
          background: isNear ? "color-mix(in srgb, var(--cc-accent) 18%, transparent)" : "#20233a",
          color: isNear ? "var(--cc-accent-soft)" : "var(--cc-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <i className={`ph ${MODULE_ICON[deadline.module]}`} style={{ fontSize: 17 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: "var(--cc-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {deadline.title}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--cc-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {deadline.courseName}
        </div>
      </div>
      <span
        style={{
          alignSelf: "center",
          flexShrink: 0,
          fontSize: 11.5,
          fontFamily: "var(--font-mono)",
          whiteSpace: "nowrap",
          padding: isNear ? "3px 9px" : 0,
          borderRadius: 999,
          border: isNear ? "1px solid var(--cc-accent)" : "none",
          color: isNear ? "var(--cc-accent-soft)" : "var(--cc-dim)",
        }}
      >
        {rel}
      </span>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 8px", alignItems: "center" }}>
      <div className="cc-skeleton" style={{ width: 34, height: 34, borderRadius: 10, flex: "none" }} />
      <div style={{ flex: 1 }}>
        <div className="cc-skeleton" style={{ height: 12, width: "70%", marginBottom: 6 }} />
        <div className="cc-skeleton" style={{ height: 10, width: "40%" }} />
      </div>
      <div className="cc-skeleton" style={{ width: 48, height: 14 }} />
    </div>
  );
}

export default function DeadlinesCard({ deadlines, loading }: { deadlines: Deadline[]; loading?: boolean }) {
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (deadlines.length === 0) {
    return (
      <EmptyState
        icon="ph-calendar-check"
        title="Nothing due right now"
        hint="Upcoming assignments and quizzes appear here as Fall '26 activities open on eClass."
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {deadlines.map((deadline, i) => (
        <DeadlineRow key={deadline.id} deadline={deadline} soonest={i === 0} />
      ))}
    </div>
  );
}
