// Weekly planner — lay out tasks across the days of a week. Each day is a
// column; drag a task card between days to reschedule it (updates its due
// date), or into "Unscheduled" to clear the date. Quick-add per day. Backed
// entirely by the tasks API (due_date), so it shares data with Notes.

import { useMemo, useRef, useState, type FormEvent } from "react";

import { useTasks } from "../hooks/useTasks";
import type { Task } from "../types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function TaskCard({
  task,
  onToggle,
  onRemove,
  onDragStart,
}: {
  task: Task;
  onToggle: () => void;
  onRemove: () => void;
  onDragStart: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => { onDragStart(); e.dataTransfer.effectAllowed = "move"; }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        background: "#1c1f2e",
        border: "1px solid #262a3b",
        borderRadius: 9,
        padding: "8px 10px",
        cursor: "grab",
        fontSize: 13,
      }}
    >
      <button type="button" onClick={onToggle} style={{ background: "none", border: "none", padding: 0, display: "flex", marginTop: 1 }}>
        {task.done ? (
          <i className="ph-fill ph-check-circle" style={{ color: "var(--cc-accent)", fontSize: 16 }} />
        ) : (
          <i className="ph ph-circle" style={{ color: "var(--cc-muted)", fontSize: 16 }} />
        )}
      </button>
      <span style={{ flex: 1, color: task.done ? "var(--cc-dim)" : "var(--cc-text)", textDecoration: task.done ? "line-through" : "none", wordBreak: "break-word" }}>
        {task.title}
      </span>
      <button type="button" onClick={onRemove} title="Delete" style={{ background: "none", border: "none", color: "var(--cc-dim)", cursor: "pointer", padding: 0 }}>
        <i className="ph ph-x" style={{ fontSize: 12 }} />
      </button>
    </div>
  );
}

export default function PlannerView() {
  const { tasks, add, toggle, remove, setDue } = useTasks();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const dragId = useRef<number | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const today = ymd(new Date());
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const unscheduled = tasks.filter((t) => !t.dueDate);

  function tasksOn(dateStr: string): Task[] {
    return tasks.filter((t) => t.dueDate === dateStr);
  }

  function drop(dateStr: string | null) {
    const id = dragId.current;
    dragId.current = null;
    setOverKey(null);
    if (id != null) setDue(id, dateStr);
  }

  function addTo(dateStr: string | null, e: FormEvent) {
    e.preventDefault();
    const key = dateStr ?? "none";
    const title = (drafts[key] ?? "").trim();
    if (!title) return;
    add(title, dateStr);
    setDrafts((d) => ({ ...d, [key]: "" }));
  }

  const rangeLabel = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  function Column({ dateStr, title, sub, isToday }: { dateStr: string | null; title: string; sub?: string; isToday?: boolean }) {
    const key = dateStr ?? "none";
    const list = dateStr ? tasksOn(dateStr) : unscheduled;
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setOverKey(key); }}
        onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
        onDrop={() => drop(dateStr)}
        style={{
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          background: "var(--cc-tile)",
          border: `1px solid ${overKey === key ? "var(--cc-accent)" : isToday ? "#2a2550" : "transparent"}`,
          borderRadius: 14,
          padding: 12,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: isToday ? "var(--cc-accent-soft)" : "var(--cc-bright)" }}>{title}</span>
          {sub && <span className="cc-label">{sub}</span>}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", minHeight: 40 }}>
          {list.map((t) => (
            <TaskCard key={t.id} task={t} onToggle={() => toggle(t)} onRemove={() => remove(t.id)} onDragStart={() => { dragId.current = t.id; }} />
          ))}
        </div>
        <form onSubmit={(e) => addTo(dateStr, e)}>
          <input
            className="input"
            placeholder="+ add"
            value={drafts[key] ?? ""}
            onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
            style={{ fontSize: 12, minHeight: 28, width: "100%" }}
          />
        </form>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <i className="ph ph-calendar-check" style={{ color: "var(--cc-accent)", fontSize: 20 }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>Week planner</h2>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--cc-muted)" }}>{rangeLabel}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setWeekStart((w) => addDays(w, -7))}>‹ Prev</button>
          <button className="btn btn-ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
          <button className="btn btn-ghost" onClick={() => setWeekStart((w) => addDays(w, 7))}>Next ›</button>
        </div>
      </div>

      {/* 7-day grid */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 10, minHeight: 0 }}>
        {days.map((d) => {
          const ds = ymd(d);
          return <Column key={ds} dateStr={ds} title={DAY_NAMES[d.getDay()]} sub={String(d.getDate())} isToday={ds === today} />;
        })}
      </div>

      {/* backlog */}
      <div style={{ maxHeight: "26%", display: "flex", flexDirection: "column" }}>
        <Column dateStr={null} title="Unscheduled" sub={`${unscheduled.length}`} />
      </div>
    </div>
  );
}
