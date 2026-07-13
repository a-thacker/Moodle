// Grades card — course totals from grade_snapshots. Progress bar per course,
// with an honest empty-state note for the pre-semester lull.

import type { Course } from "../types";

export default function GradesCard({ courses }: { courses: Course[] }) {
  return (
    <section className="card" style={{ padding: "var(--space-6)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i className="ph ph-exam" style={{ color: "var(--color-accent)" }} />
          <span className="card-title" style={{ fontSize: 15 }}>Grades</span>
        </div>
        <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>
          S26 · {courses.length} course{courses.length === 1 ? "" : "s"}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        {courses.map((course) => (
          <div key={course.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
              <span style={{ fontSize: 13 }}>{course.fullName}</span>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: 13, color: "var(--color-accent-200)" }}>
                {course.totalPercent == null ? "—" : `${course.totalPercent}%`}
              </span>
            </div>
            <div style={{ height: 5, background: "var(--color-neutral-800)", borderRadius: 3, overflow: "hidden" }}>
              <div
                style={{
                  width: `${course.totalPercent ?? 0}%`,
                  height: "100%",
                  background: "var(--color-accent)",
                }}
              />
            </div>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: "var(--space-2)",
            padding: "9px 11px",
            border: "1px dashed var(--color-divider)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <i className="ph ph-calendar-plus" style={{ color: "var(--color-neutral-500)", fontSize: 15 }} />
          <span style={{ fontSize: 12, color: "var(--color-neutral-500)" }}>
            Fall '26 courses populate here after the agent's next sync.
          </span>
        </div>
      </div>
    </section>
  );
}
