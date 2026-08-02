// Grades — course totals from grade_snapshots. Color-coded, animated progress
// bars, with loading skeletons and an honest empty state for the pre-semester
// lull. Rendered inside the Grades tool page (PageShell provides the header).

import type { Course } from "../types";
import EmptyState from "./EmptyState.tsx";

// Total → semantic color: strong / good / warning / poor / not-yet-graded.
function gradeColor(pct: number | null): string {
  if (pct == null) return "var(--cc-dim)";
  if (pct >= 90) return "var(--cc-good)";
  if (pct >= 80) return "var(--cc-accent-soft)";
  if (pct >= 70) return "var(--cc-warn)";
  return "var(--cc-bad)";
}

function SkeletonRow() {
  return (
    <div>
      <div className="cc-skeleton" style={{ height: 12, width: "55%", marginBottom: 8 }} />
      <div className="cc-skeleton" style={{ height: 6, width: "100%" }} />
    </div>
  );
}

export default function GradesCard({ courses, loading }: { courses: Course[]; loading?: boolean }) {
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <EmptyState
        icon="ph-exam"
        title="No courses synced yet"
        hint="Your Fall '26 courses and totals appear here after the sync agent's next run."
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {courses.map((course) => {
        const pct = course.totalPercent;
        const color = gradeColor(pct);
        return (
          <div key={course.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
              <span style={{ fontSize: 13.5, color: "var(--cc-text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {course.fullName}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color, flexShrink: 0 }}>
                {pct == null ? "—" : `${pct}%`}
              </span>
            </div>
            <div style={{ height: 6, background: "#20233a", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, pct ?? 0))}%`,
                  height: "100%",
                  background: color,
                  borderRadius: 4,
                  transition: "width .5s cubic-bezier(.4,0,.2,1)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
