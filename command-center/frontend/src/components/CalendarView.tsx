// Calendar — an agenda of the user's imported events (school eClass feed +
// any Google/Apple .ics feeds), grouped by day. Read-only mirrors: each event
// can be spun off into a real task with "+", but is never edited here. Feeds
// are added/managed in Settings → Calendars.

import { useMemo } from "react";

import { useTasks } from "../hooks/useTasks";
import { useCalendarEvents } from "../hooks/useCalendarEvents";
import type { CalendarEvent, TaskCategory } from "../types";
import { fmtTime } from "../utils/time";
import PageShell from "./PageShell";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string, today: string, tomorrow: string): string {
  if (key === today) return "Today";
  if (key === tomorrow) return "Tomorrow";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function CalendarView() {
  const { events, sources, loaded, colorFor } = useCalendarEvents(true);
  const { add } = useTasks();

  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 86_400_000));

  // Upcoming (today onward), grouped by day, each day sorted by start.
  const days = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {};
    for (const ev of events) {
      const key = ev.start.slice(0, 10);
      if (key < today) continue;
      (m[key] ??= []).push(ev);
    }
    return Object.keys(m)
      .sort()
      .map((key) => ({ key, items: m[key].sort((a, b) => (a.start < b.start ? -1 : 1)) }));
  }, [events, today]);

  function addFromEvent(ev: CalendarEvent) {
    const time = ev.allDay ? null : ev.start.slice(11, 19);
    const category: TaskCategory | null = ev.source === "eclass" ? "school" : null;
    add(ev.title, ev.start.slice(0, 10), time, category);
  }

  const subtitle = loaded
    ? `${events.length} event${events.length === 1 ? "" : "s"} · ${sources.length} feed${sources.length === 1 ? "" : "s"}`
    : undefined;

  return (
    <PageShell title="Calendar" icon="ph-calendar-blank" subtitle={subtitle}>
      {loaded && days.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: "var(--cc-muted)", fontSize: 14, lineHeight: 1.6 }}>
          <i className="ph ph-calendar-blank" style={{ fontSize: 30, color: "var(--cc-accent-soft)" }} />
          <p style={{ margin: "10px 0 0" }}>
            No upcoming events. Add a Google or Apple calendar feed — or connect eClass —
            in <strong>Settings → Calendars</strong>.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {days.map((day) => (
          <div key={day.key}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, color: day.key === today ? "var(--cc-accent-soft)" : "var(--cc-bright)" }}>
                {dayLabel(day.key, today, tomorrow)}
              </span>
              <span className="cc-label">{day.items.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {day.items.map((ev) => {
                const color = colorFor(ev);
                const when = ev.allDay ? "all day" : fmtTime(ev.start.slice(11, 19));
                const meta = ev.courseName || ev.location || null;
                return (
                  <div key={ev.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "var(--cc-tile)", border: "1px solid #20233a", borderLeft: `3px solid ${color}`, borderRadius: 10, padding: "9px 12px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color, minWidth: 64, flexShrink: 0, paddingTop: 1 }}>{when}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: "var(--cc-text)", fontSize: 14, wordBreak: "break-word" }}>{ev.title}</span>
                      {meta && <span style={{ display: "block", fontSize: 12, color: "var(--cc-dim)", marginTop: 2 }}>{meta}</span>}
                    </span>
                    <button type="button" onClick={() => addFromEvent(ev)} className="btn btn-ghost" title="Add as a task" style={{ flexShrink: 0, padding: "3px 8px", fontSize: 12 }}>
                      <i className="ph ph-plus-circle" style={{ marginRight: 4 }} />task
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
