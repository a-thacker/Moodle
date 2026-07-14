// The one saturated "presence" field (deep-indigo section glow). Greeting +
// live date, next-due chip, and a since-last-visit chip.

import type { ReactNode } from "react";

import { useClock } from "../hooks/useClock";
import { useAuth } from "../auth/AuthContext.tsx";
import type { Deadline, GradeEvent } from "../types";
import { relativeDay, timeLabel } from "../utils/format";

interface HeroProps {
  deadlines: Deadline[];
  gradeEvents: GradeEvent[];
}

function Chip({ icon, label, value }: { icon: string; label: string; value: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        background: "color-mix(in srgb, var(--color-neutral-900) 45%, transparent)",
        border: "1px solid var(--color-accent-800)",
        borderRadius: "var(--radius-md)",
        padding: "9px 13px",
      }}
    >
      <i className={`ph ${icon}`} style={{ color: "var(--color-accent-200)", fontSize: 18 }} />
      <div>
        <div style={{ fontSize: 10, letterSpacing: ".06em", color: "var(--color-accent-200)", opacity: 0.8 }}>
          {label}
        </div>
        <div style={{ fontSize: 13 }}>{value}</div>
      </div>
    </div>
  );
}

export default function HeroCard({ deadlines, gradeEvents }: HeroProps) {
  const clock = useClock();
  const { user } = useAuth();
  const firstName = (user?.display_name ?? "there").split(" ")[0];
  const next = deadlines[0];
  const gradedCount = gradeEvents.filter((e) => e.kind === "graded").length;
  const dueThisWeek = deadlines.filter(
    (d) => new Date(d.due).getTime() - Date.now() < 7 * 86_400_000,
  ).length;

  return (
    <section
      style={{
        background:
          "radial-gradient(120% 150% at 90% 0%, var(--color-section-glow), var(--color-section) 58%)",
        border: "1px solid var(--color-accent-800)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-8)",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -60,
          top: -70,
          width: 220,
          height: 220,
          borderRadius: "50%",
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--color-accent) 34%, transparent), transparent)",
        }}
      />
      <div style={{ position: "relative" }}>
        <div style={{ fontSize: 12, letterSpacing: ".04em", color: "var(--color-accent-200)", opacity: 0.85 }}>
          {clock.dateLong} · Collegedale, TN
        </div>
        <h1 style={{ fontSize: 32, margin: "6px 0 0" }}>
          {clock.greeting}, {firstName}.
        </h1>
        <div style={{ display: "flex", alignItems: "stretch", gap: 12, marginTop: "var(--space-6)", flexWrap: "wrap" }}>
          {next && (
            <Chip
              icon="ph-clock-countdown"
              label="NEXT DUE"
              value={
                <>
                  {next.title} ·{" "}
                  <span style={{ color: "var(--color-accent-100)" }}>
                    {relativeDay(next.due).toLowerCase()} {timeLabel(next.due)}
                  </span>
                </>
              }
            />
          )}
          <Chip
            icon="ph-bell-ringing"
            label="SINCE LAST VISIT"
            value={`${gradedCount} new grade${gradedCount === 1 ? "" : "s"} · ${dueThisWeek} due this week`}
          />
        </div>
      </div>
    </section>
  );
}
