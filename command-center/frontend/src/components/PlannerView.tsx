// Weekly / daily planner. Drag a task card between days to reschedule, onto
// another card to reorder (a bar shows where it'll land), or onto the "every
// day" zone (appears while dragging) to add it to all 7 days. Week or Day
// view. Backed by the tasks API; stays in sync via useTasks.

import { useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";

import { useTasks } from "../hooks/useTasks";
import type { Task } from "../types";
import { extractTime, fmtTime } from "../utils/time";

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

const DropBar = () => (
  <div style={{ height: 2, background: "var(--cc-accent)", borderRadius: 2, margin: "1px 2px" }} />
);

function TaskCard({ task, onToggle, onRemove, onDragStart, onDragEnd, onOver, onDrop }: {
  task: Task; onToggle: () => void; onRemove: () => void;
  onDragStart: () => void; onDragEnd: () => void;
  onOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => { onDragStart(); e.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={onDragEnd}
      onDragOver={onOver}
      onDrop={onDrop}
      style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#1c1f2e", border: "1px solid #2b3048", borderRadius: 9, padding: "8px 10px", cursor: "grab", fontSize: 13 }}
    >
      <button type="button" onClick={onToggle} style={{ background: "none", border: "none", padding: 0, display: "flex", marginTop: 1 }}>
        {task.done ? <i className="ph-fill ph-check-circle" style={{ color: "var(--cc-accent)", fontSize: 16 }} /> : <i className="ph ph-circle" style={{ color: "var(--cc-muted)", fontSize: 16 }} />}
      </button>
      <span style={{ flex: 1, color: task.done ? "var(--cc-dim)" : "var(--cc-text)", textDecoration: task.done ? "line-through" : "none", wordBreak: "break-word" }}>
        {task.dueTime && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--cc-accent-soft)", marginRight: 6 }}>{fmtTime(task.dueTime)}</span>}
        {task.title}
      </span>
      <button type="button" onClick={onRemove} title="Delete" style={{ background: "none", border: "none", color: "var(--cc-dim)", cursor: "pointer", padding: 0 }}>
        <i className="ph ph-x" style={{ fontSize: 12 }} />
      </button>
    </div>
  );
}

interface ColumnProps {
  ckey: string; title: string; sub?: string; isToday?: boolean; highlight: boolean;
  list: Task[]; draft: string; indicator: number | "end" | null;
  onDraft: (v: string) => void; onAdd: (e: FormEvent) => void;
  onColumnOver: (e: DragEvent) => void; onLeave: () => void; onColumnDrop: () => void;
  toggle: (t: Task) => void; remove: (id: number) => void;
  onCardDragStart: (t: Task) => void; onCardDragEnd: () => void;
  onCardOver: (t: Task, e: DragEvent) => void; onCardDrop: (t: Task, e: DragEvent) => void;
}

function Column(p: ColumnProps) {
  return (
    <div
      onDragOver={p.onColumnOver}
      onDragLeave={p.onLeave}
      onDrop={p.onColumnDrop}
      style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: "var(--cc-tile)", border: `1px solid ${p.highlight ? "var(--cc-accent)" : p.isToday ? "#3a3170" : "#20233a"}`, borderRadius: 14, gap: 0 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 12px", borderBottom: "1px solid #20233a", background: p.isToday ? "#8b7cf012" : "transparent", borderTopLeftRadius: 14, borderTopRightRadius: 14 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 14, color: p.isToday ? "var(--cc-accent-soft)" : "var(--cc-bright)" }}>{p.title}</span>
        {p.sub && <span className="cc-label">{p.sub}</span>}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", minHeight: 40, padding: "8px 12px" }}>
        {p.list.map((t) => (
          <div key={t.id}>
            {p.indicator === t.id && <DropBar />}
            <TaskCard
              task={t}
              onToggle={() => p.toggle(t)}
              onRemove={() => p.remove(t.id)}
              onDragStart={() => p.onCardDragStart(t)}
              onDragEnd={p.onCardDragEnd}
              onOver={(e) => p.onCardOver(t, e)}
              onDrop={(e) => p.onCardDrop(t, e)}
            />
          </div>
        ))}
        {p.indicator === "end" && <DropBar />}
      </div>
      <form onSubmit={p.onAdd} style={{ padding: "0 12px 10px" }}>
        <input className="input" placeholder="+ add" value={p.draft} onChange={(e) => p.onDraft(e.target.value)} style={{ fontSize: 12, minHeight: 28, width: "100%" }} />
      </form>
    </div>
  );
}

export default function PlannerView() {
  const { tasks, add, toggle, remove, patch } = useTasks();
  const [mode, setMode] = useState<"week" | "day">("week");
  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const dragRef = useRef<Task | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [indicator, setIndicator] = useState<{ key: string; before: number | "end" } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const today = ymd(new Date());
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const shownDays = mode === "week" ? weekDays : [anchor];

  const byKey = (k: string | null): Task[] => {
    const list = tasks.filter((t) => (k ? t.dueDate === k : !t.dueDate));
    if (!k) return list.sort((a, b) => a.position - b.position);
    // Dated columns: timed events first (by time), then untimed by position.
    return list.sort((a, b) => {
      if (a.dueTime && b.dueTime) return a.dueTime < b.dueTime ? -1 : a.dueTime > b.dueTime ? 1 : a.position - b.position;
      if (a.dueTime) return -1;
      if (b.dueTime) return 1;
      return a.position - b.position;
    });
  };

  function endDrag() { dragRef.current = null; setOverKey(null); setIndicator(null); setDragActive(false); }

  function moveTo(dragged: Task, dateStr: string | null, position: number) {
    void patch(dragged.id, { due_date: dateStr, position }).catch(() => {});
  }
  function dropColumn(dateStr: string | null) {
    const d = dragRef.current; if (!d) { endDrag(); return; }
    const list = byKey(dateStr).filter((t) => t.id !== d.id);
    moveTo(d, dateStr, (list[list.length - 1]?.position ?? 0) + 1);
    endDrag();
  }
  function dropOnCard(dateStr: string | null, target: Task) {
    const d = dragRef.current; if (!d || d.id === target.id) { endDrag(); return; }
    const list = byKey(dateStr).filter((t) => t.id !== d.id);
    const idx = list.findIndex((t) => t.id === target.id);
    const prev = list[idx - 1];
    moveTo(d, dateStr, prev ? (prev.position + target.position) / 2 : target.position - 1);
    endDrag();
  }
  function dropEveryDay() {
    const d = dragRef.current; if (!d) { endDrag(); return; }
    weekDays.forEach((day) => add(d.title, ymd(day)));
    remove(d.id);
    endDrag();
  }

  function addTo(dateStr: string | null, e: FormEvent) {
    e.preventDefault();
    const key = dateStr ?? "none";
    const { title, time } = extractTime(drafts[key] ?? "");
    if (!title.trim()) return;
    add(title, dateStr, time);
    setDrafts((s) => ({ ...s, [key]: "" }));
  }

  const rangeLabel = mode === "week"
    ? `${weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : anchor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  function column(dateStr: string | null, title: string, sub?: string, isToday?: boolean) {
    const key = dateStr ?? "none";
    return (
      <Column
        key={key} ckey={key} title={title} sub={sub} isToday={isToday}
        highlight={overKey === key}
        list={byKey(dateStr)} draft={drafts[key] ?? ""}
        indicator={indicator?.key === key ? indicator.before : null}
        onDraft={(v) => setDrafts((s) => ({ ...s, [key]: v }))}
        onAdd={(e) => addTo(dateStr, e)}
        onColumnOver={(e) => { e.preventDefault(); setOverKey(key); setIndicator({ key, before: "end" }); }}
        onLeave={() => setOverKey((k) => (k === key ? null : k))}
        onColumnDrop={() => dropColumn(dateStr)}
        toggle={toggle} remove={remove}
        onCardDragStart={(t) => { dragRef.current = t; setDragActive(true); }}
        onCardDragEnd={endDrag}
        onCardOver={(t, e) => { e.preventDefault(); e.stopPropagation(); setOverKey(key); setIndicator({ key, before: t.id }); }}
        onCardDrop={(t, e) => { e.stopPropagation(); dropOnCard(dateStr, t); }}
      />
    );
  }

  const step = mode === "week" ? 7 : 1;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <i className="ph ph-calendar-check" style={{ color: "var(--cc-accent)", fontSize: 20 }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>Planner</h2>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--cc-muted)" }}>{rangeLabel}</span>
        <div style={{ display: "flex", gap: 4, marginLeft: 6, background: "#161824", border: "1px solid #262a3b", borderRadius: 9, padding: 3 }}>
          {(["week", "day"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: mode === m ? "var(--cc-accent)" : "transparent", color: mode === m ? "#100f1c" : "var(--cc-muted)", textTransform: "capitalize" }}>{m}</button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setAnchor((a) => addDays(a, -step))}>‹ Prev</button>
          <button className="btn btn-ghost" onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setAnchor(d); }}>Today</button>
          <button className="btn btn-ghost" onClick={() => setAnchor((a) => addDays(a, step))}>Next ›</button>
        </div>
      </div>

      {/* every-day drop zone — only while dragging */}
      {dragActive && (
        <div
          onDragOver={(e) => { e.preventDefault(); setOverKey("everyday"); }}
          onDragLeave={() => setOverKey((k) => (k === "everyday" ? null : k))}
          onDrop={dropEveryDay}
          style={{ padding: "10px 14px", borderRadius: 12, textAlign: "center", fontSize: 13, fontFamily: "var(--font-mono)", color: overKey === "everyday" ? "#100f1c" : "var(--cc-accent-soft)", background: overKey === "everyday" ? "var(--cc-accent)" : "#8b7cf01a", border: "1px dashed var(--cc-accent)" }}
        >
          ＋ drop here to add to every day this week
        </div>
      )}

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: mode === "week" ? "repeat(7,1fr)" : "1fr", gap: 10, minHeight: 0 }}>
        {shownDays.map((d) => column(ymd(d), DAY_NAMES[d.getDay()], String(d.getDate()), ymd(d) === today))}
      </div>

      <div style={{ maxHeight: "24%", display: "flex", flexDirection: "column", minHeight: 0 }}>
        {column(null, "Unscheduled", String(byKey(null).length))}
      </div>
    </div>
  );
}
