// Weekly planner — tasks laid out across the days of a week. Drag a task card
// between days to reschedule (sets due date) or onto another card to reorder
// (sets position). Per-day quick-add, plus "add to every day". Backed by the
// tasks API; stays in sync with Notes and the omni-bar via useTasks.

import { useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";

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
  onDropBefore,
}: {
  task: Task;
  onToggle: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDropBefore: (e: DragEvent) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => { onDragStart(); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={onDropBefore}
      style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#1c1f2e", border: "1px solid #262a3b", borderRadius: 9, padding: "8px 10px", cursor: "grab", fontSize: 13 }}
    >
      <button type="button" onClick={onToggle} style={{ background: "none", border: "none", padding: 0, display: "flex", marginTop: 1 }}>
        {task.done ? (
          <i className="ph-fill ph-check-circle" style={{ color: "var(--cc-accent)", fontSize: 16 }} />
        ) : (
          <i className="ph ph-circle" style={{ color: "var(--cc-muted)", fontSize: 16 }} />
        )}
      </button>
      <span style={{ flex: 1, color: task.done ? "var(--cc-dim)" : "var(--cc-text)", textDecoration: task.done ? "line-through" : "none", wordBreak: "break-word" }}>{task.title}</span>
      <button type="button" onClick={onRemove} title="Delete" style={{ background: "none", border: "none", color: "var(--cc-dim)", cursor: "pointer", padding: 0 }}>
        <i className="ph ph-x" style={{ fontSize: 12 }} />
      </button>
    </div>
  );
}

interface ColumnProps {
  columnKey: string;
  title: string;
  sub?: string;
  isToday?: boolean;
  highlight: boolean;
  list: Task[];
  draft: string;
  onDraft: (v: string) => void;
  onAdd: (e: FormEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDropColumn: () => void;
  toggle: (t: Task) => void;
  remove: (id: number) => void;
  onCardDragStart: (t: Task) => void;
  onDropBefore: (target: Task) => void;
}

function Column(props: ColumnProps) {
  return (
    <div
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDropColumn}
      style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: "var(--cc-tile)", border: `1px solid ${props.highlight ? "var(--cc-accent)" : props.isToday ? "#2a2550" : "transparent"}`, borderRadius: 14, padding: 12, gap: 8 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: props.isToday ? "var(--cc-accent-soft)" : "var(--cc-bright)" }}>{props.title}</span>
        {props.sub && <span className="cc-label">{props.sub}</span>}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", minHeight: 40 }}>
        {props.list.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            onToggle={() => props.toggle(t)}
            onRemove={() => props.remove(t.id)}
            onDragStart={() => props.onCardDragStart(t)}
            onDropBefore={(e) => { e.stopPropagation(); props.onDropBefore(t); }}
          />
        ))}
      </div>
      <form onSubmit={props.onAdd}>
        <input className="input" placeholder="+ add" value={props.draft} onChange={(e) => props.onDraft(e.target.value)} style={{ fontSize: 12, minHeight: 28, width: "100%" }} />
      </form>
    </div>
  );
}

export default function PlannerView() {
  const { tasks, add, toggle, remove, patch } = useTasks();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [everyDay, setEveryDay] = useState("");
  const dragRef = useRef<Task | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const today = ymd(new Date());
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const byKey = (dateStr: string | null): Task[] =>
    tasks.filter((t) => (dateStr ? t.dueDate === dateStr : !t.dueDate)).sort((a, b) => a.position - b.position);

  function move(dragged: Task, dateStr: string | null, position: number) {
    void patch(dragged.id, { due_date: dateStr, position }).catch(() => {});
  }

  function dropColumn(dateStr: string | null) {
    const dragged = dragRef.current;
    dragRef.current = null;
    setOverKey(null);
    if (!dragged) return;
    const list = byKey(dateStr).filter((t) => t.id !== dragged.id);
    move(dragged, dateStr, (list[list.length - 1]?.position ?? 0) + 1);
  }

  function dropBefore(dateStr: string | null, target: Task) {
    const dragged = dragRef.current;
    dragRef.current = null;
    setOverKey(null);
    if (!dragged || dragged.id === target.id) return;
    const list = byKey(dateStr).filter((t) => t.id !== dragged.id);
    const idx = list.findIndex((t) => t.id === target.id);
    const prev = list[idx - 1];
    const newPos = prev ? (prev.position + target.position) / 2 : target.position - 1;
    move(dragged, dateStr, newPos);
  }

  function addTo(dateStr: string | null, e: FormEvent) {
    e.preventDefault();
    const key = dateStr ?? "none";
    const title = (drafts[key] ?? "").trim();
    if (!title) return;
    add(title, dateStr);
    setDrafts((d) => ({ ...d, [key]: "" }));
  }

  function addEveryDay(e: FormEvent) {
    e.preventDefault();
    const title = everyDay.trim();
    if (!title) return;
    days.forEach((d) => add(title, ymd(d)));
    setEveryDay("");
  }

  const rangeLabel = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  function columnFor(dateStr: string | null, title: string, sub?: string, isToday?: boolean) {
    const key = dateStr ?? "none";
    return (
      <Column
        key={key}
        columnKey={key}
        title={title}
        sub={sub}
        isToday={isToday}
        highlight={overKey === key}
        list={byKey(dateStr)}
        draft={drafts[key] ?? ""}
        onDraft={(v) => setDrafts((d) => ({ ...d, [key]: v }))}
        onAdd={(e) => addTo(dateStr, e)}
        onDragOver={(e) => { e.preventDefault(); setOverKey(key); }}
        onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
        onDropColumn={() => dropColumn(dateStr)}
        toggle={toggle}
        remove={remove}
        onCardDragStart={(t) => { dragRef.current = t; }}
        onDropBefore={(target) => dropBefore(dateStr, target)}
      />
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <i className="ph ph-calendar-check" style={{ color: "var(--cc-accent)", fontSize: 20 }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>Week planner</h2>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--cc-muted)" }}>{rangeLabel}</span>
        <form onSubmit={addEveryDay} style={{ display: "flex", gap: 6, marginLeft: 12 }}>
          <input className="input" placeholder="Add to every day…" value={everyDay} onChange={(e) => setEveryDay(e.target.value)} style={{ fontSize: 13, minHeight: 30, width: 180 }} />
          <button type="submit" className="btn btn-ghost" title="Add this task to all 7 days">Every day</button>
        </form>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setWeekStart((w) => addDays(w, -7))}>‹ Prev</button>
          <button className="btn btn-ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
          <button className="btn btn-ghost" onClick={() => setWeekStart((w) => addDays(w, 7))}>Next ›</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 10, minHeight: 0 }}>
        {days.map((d) => columnFor(ymd(d), DAY_NAMES[d.getDay()], String(d.getDate()), ymd(d) === today))}
      </div>

      <div style={{ maxHeight: "24%", display: "flex", flexDirection: "column", minHeight: 0 }}>
        {columnFor(null, "Unscheduled", String(byKey(null).length))}
      </div>
    </div>
  );
}
