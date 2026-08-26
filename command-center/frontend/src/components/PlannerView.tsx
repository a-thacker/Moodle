// Weekly / daily planner — one place for every task. Drag a task card between
// days to reschedule, onto another card to reorder (a bar shows where it'll
// land), or onto the "every day" zone (appears while dragging) to add it to all
// 7 days. Filter chips scope the list to All / School (eClass) / Personal; each
// card has a one-tap 🔔 alert and ⭐ important; an Events toggle overlays the
// read-only calendar. Unscheduled is a first-class capture zone at the bottom.
// Backed by the tasks API; stays in sync via useTasks.

import { useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";

import { useTasks } from "../hooks/useTasks";
import { useCalendarEvents, eventDays } from "../hooks/useCalendarEvents";
import type { CalendarEvent, Task, TaskCategory } from "../types";
import { parseTaskInput, fmtTime } from "../utils/time";
import { taskColor } from "../utils/category";
import type { Trigger } from "../utils/flags";
import FlagInput from "./FlagInput.tsx";
import PageShell from "./PageShell";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SrcFilter = "all" | "school" | "personal";
const FILTERS: readonly [SrcFilter, string][] = [["all", "All"], ["school", "School"], ["personal", "Personal"]];

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

function IconBtn({ icon, active, activeColor, title, onClick }: {
  icon: string; active: boolean; activeColor: string; title: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, marginTop: 1 }}>
      <i className={active ? `ph-fill ${icon}` : `ph ${icon}`}
        style={{ fontSize: 13, color: active ? activeColor : "var(--cc-dim)" }} />
    </button>
  );
}

function TaskCard({ task, onToggle, onRemove, onDuplicate, onAlert, onImportant, onDragStart, onDragEnd, onOver, onDrop }: {
  task: Task; onToggle: () => void; onRemove: () => void; onDuplicate: () => void;
  onAlert: () => void; onImportant: () => void;
  onDragStart: () => void; onDragEnd: () => void;
  onOver: (e: DragEvent) => void; onDrop: (e: DragEvent) => void;
}) {
  return (
    <div
      onDragOver={onOver}
      onDrop={onDrop}
      style={{ display: "flex", alignItems: "flex-start", gap: 6, background: "#1c1f2e", border: "1px solid #2b3048", borderLeft: `3px solid ${taskColor(task)}`, borderRadius: 9, padding: "8px 9px", fontSize: 13, userSelect: "none" }}
    >
      {/* Grip is the drag source — reliable, and never grabs text. */}
      <span
        draggable
        onDragStart={(e) => { onDragStart(); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(task.id)); }}
        onDragEnd={onDragEnd}
        title="Drag to move / reorder"
        style={{ cursor: "grab", color: "var(--cc-dim)", marginTop: 1, flexShrink: 0 }}
      >
        <i className="ph ph-dots-six-vertical" style={{ fontSize: 15 }} />
      </span>
      <button type="button" onClick={onToggle} style={{ background: "none", border: "none", padding: 0, display: "flex", marginTop: 1 }}>
        {task.done ? <i className="ph-fill ph-check-circle" style={{ color: "var(--cc-accent)", fontSize: 16 }} /> : <i className="ph ph-circle" style={{ color: "var(--cc-muted)", fontSize: 16 }} />}
      </button>
      <span style={{ flex: 1, color: task.done ? "var(--cc-dim)" : "var(--cc-text)", textDecoration: task.done ? "line-through" : "none", wordBreak: "break-word" }}>
        {task.source === "eclass" && (
          <i className="ph ph-graduation-cap" title="eClass assignment" style={{ color: "var(--cc-accent-soft)", fontSize: 13, marginRight: 5 }} />
        )}
        {task.dueTime && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--cc-accent-soft)", marginRight: 6 }}>{fmtTime(task.dueTime)}</span>}
        {task.title}
      </span>
      <IconBtn icon="ph-star" active={task.important} activeColor="var(--cc-warn)"
        title={task.important ? "Important — tap to unstar" : "Mark important"} onClick={onImportant} />
      <IconBtn icon="ph-bell" active={task.alert} activeColor="var(--cc-accent)"
        title={task.alert ? "Alert on — tap to silence" : (task.dueTime ? "Alert me at its time" : "Alert me (morning · midday · evening)")} onClick={onAlert} />
      <button type="button" onClick={onDuplicate} title="Duplicate" style={{ background: "none", border: "none", color: "var(--cc-dim)", cursor: "pointer", padding: 0, flexShrink: 0 }}>
        <i className="ph ph-copy" style={{ fontSize: 13 }} />
      </button>
      <button type="button" onClick={onRemove} title="Delete" style={{ background: "none", border: "none", color: "var(--cc-dim)", cursor: "pointer", padding: 0, flexShrink: 0 }}>
        <i className="ph ph-x" style={{ fontSize: 12 }} />
      </button>
    </div>
  );
}

// A read-only calendar event mirrored from a source (school / Google / Apple).
// Not draggable and has no done-toggle; "+" spins off a real task you own.
function EventCard({ ev, color, onAdd }: { ev: CalendarEvent; color: string; onAdd: () => void }) {
  const when = ev.allDay ? "all day" : fmtTime(ev.start.slice(11, 19));
  const meta = ev.courseName || ev.location || null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 7, background: "#181a26", border: "1px dashed #2b3048", borderLeft: `3px solid ${color}`, borderRadius: 9, padding: "7px 9px", fontSize: 12.5 }}>
      <i className="ph ph-calendar-blank" style={{ color, fontSize: 14, marginTop: 1, flexShrink: 0 }} />
      <span style={{ flex: 1, wordBreak: "break-word" }}>
        {when && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color, marginRight: 6 }}>{when}</span>}
        <span style={{ color: "var(--cc-text)" }}>{ev.title}</span>
        {meta && <span style={{ display: "block", fontSize: 11, color: "var(--cc-dim)", marginTop: 1 }}>{meta}</span>}
      </span>
      <button type="button" onClick={onAdd} title="Add as a task" style={{ background: "none", border: "none", color: "var(--cc-dim)", cursor: "pointer", padding: 0, flexShrink: 0, marginTop: 1 }}>
        <i className="ph ph-plus-circle" style={{ fontSize: 15 }} />
      </button>
    </div>
  );
}

interface ColumnProps {
  ckey: string; title: string; sub?: string; isToday?: boolean; highlight: boolean; showAdd: boolean;
  triggers?: Trigger[]; placeholder?: string;
  list: Task[]; draft: string; indicator: number | "end" | null;
  events?: CalendarEvent[]; colorFor?: (ev: CalendarEvent) => string; onEventAdd?: (ev: CalendarEvent) => void;
  onDraft: (v: string) => void; onAdd: (e: FormEvent) => void;
  onColumnOver: (e: DragEvent) => void; onLeave: () => void; onColumnDrop: () => void;
  toggle: (t: Task) => void; remove: (id: number) => void; duplicate: (t: Task) => void;
  alertT: (t: Task) => void; importantT: (t: Task) => void;
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
        {p.events?.map((ev) => (
          <EventCard key={`ev-${ev.id}`} ev={ev} color={p.colorFor?.(ev) ?? "#7c9cff"} onAdd={() => p.onEventAdd?.(ev)} />
        ))}
        {p.list.map((t) => (
          <div key={t.id}>
            {p.indicator === t.id && <DropBar />}
            <TaskCard
              task={t}
              onToggle={() => p.toggle(t)}
              onRemove={() => p.remove(t.id)}
              onDuplicate={() => p.duplicate(t)}
              onAlert={() => p.alertT(t)}
              onImportant={() => p.importantT(t)}
              onDragStart={() => p.onCardDragStart(t)}
              onDragEnd={p.onCardDragEnd}
              onOver={(e) => p.onCardOver(t, e)}
              onDrop={(e) => p.onCardDrop(t, e)}
            />
          </div>
        ))}
        {p.indicator === "end" && <DropBar />}
      </div>
      {p.showAdd && (
        <form onSubmit={p.onAdd} style={{ padding: "0 12px 10px" }}>
          <FlagInput className="input" placeholder={p.placeholder ?? "+ add"} value={p.draft} onChange={p.onDraft} triggers={p.triggers ?? ["#"]} style={{ fontSize: 12, minHeight: 28, width: "100%" }} />
        </form>
      )}
    </div>
  );
}

export default function PlannerView() {
  const { tasks, add, toggle, remove, patch } = useTasks();
  const [mode, setMode] = useState<"week" | "day">("week");
  const [filter, setFilter] = useState<SrcFilter>("all");
  const [showEvents, setShowEvents] = useState(false);
  const { events, colorFor } = useCalendarEvents(showEvents);
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

  const matchesFilter = (t: Task) =>
    filter === "all" || (filter === "school" ? t.source === "eclass" : t.source === "manual");

  // Calendar events grouped by day (YYYY-MM-DD), each sorted by start. A
  // multi-day event is placed on every day it spans, not only its start.
  const eventsByDate = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {};
    for (const ev of events) for (const day of eventDays(ev)) (m[day] ??= []).push(ev);
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    return m;
  }, [events]);

  // "Add as task": a deliberate one-time copy the user owns — the synced event
  // is never mutated. eClass events land under the "school" category.
  function addFromEvent(ev: CalendarEvent) {
    const time = ev.allDay ? null : `${ev.start.slice(11, 19)}`;
    const category: TaskCategory | null = ev.source === "eclass" ? "school" : null;
    add(ev.title, ev.start.slice(0, 10), time, category);
  }

  // Duplicate a task: a fresh copy on the same day/time/category, alert carried.
  function duplicate(task: Task) {
    add(task.title, task.dueDate, task.dueTime, task.category, task.projectId, task.alert);
  }

  // 🔔 toggle: turning alert on binds it to the task's time if it has one
  // (fires once then), else it rides the digest + midday/evening re-pings.
  function toggleAlert(t: Task) {
    void patch(t.id, { alert: !t.alert, alert_time: !t.alert ? (t.dueTime ?? null) : null }).catch(() => {});
  }
  function toggleImportant(t: Task) {
    void patch(t.id, { important: !t.important }).catch(() => {});
  }

  const byKey = (k: string | null): Task[] => {
    const list = tasks.filter((t) => (k ? t.dueDate === k : !t.dueDate) && matchesFilter(t));
    // Manual order (position) is authoritative so drag-to-reorder sticks for
    // every card — timed or not. Ties fall back to time, then creation order.
    return list.sort((a, b) =>
      a.position !== b.position
        ? a.position - b.position
        : (a.dueTime ?? "~") < (b.dueTime ?? "~") ? -1 : (a.dueTime ?? "~") > (b.dueTime ?? "~") ? 1 : 0,
    );
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
    const { title, time, dates, category, alert } = parseTaskInput(drafts[key] ?? "");
    if (!title.trim()) return;
    // A day column fixes the date; Unscheduled honors a typed -today/-tomorrow.
    const target = dateStr ?? dates[0] ?? null;
    add(title, target, time, category, null, alert);
    setDrafts((s) => ({ ...s, [key]: "" }));
  }

  const rangeLabel = mode === "week"
    ? `${weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : anchor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  function column(dateStr: string | null, title: string, sub?: string, isToday?: boolean, showAdd = true, extra?: { triggers?: Trigger[]; placeholder?: string }) {
    const key = dateStr ?? "none";
    return (
      <Column
        key={key} ckey={key} title={title} sub={sub} isToday={isToday} showAdd={showAdd}
        triggers={extra?.triggers} placeholder={extra?.placeholder}
        highlight={overKey === key}
        list={byKey(dateStr)} draft={drafts[key] ?? ""}
        events={dateStr ? eventsByDate[dateStr] : undefined}
        colorFor={colorFor} onEventAdd={addFromEvent}
        indicator={indicator?.key === key ? indicator.before : null}
        onDraft={(v) => setDrafts((s) => ({ ...s, [key]: v }))}
        onAdd={(e) => addTo(dateStr, e)}
        onColumnOver={(e) => { e.preventDefault(); setOverKey(key); setIndicator({ key, before: "end" }); }}
        onLeave={() => setOverKey((k) => (k === key ? null : k))}
        onColumnDrop={() => dropColumn(dateStr)}
        toggle={toggle} remove={remove} duplicate={duplicate}
        alertT={toggleAlert} importantT={toggleImportant}
        onCardDragStart={(t) => { dragRef.current = t; setDragActive(true); }}
        onCardDragEnd={endDrag}
        onCardOver={(t, e) => { e.preventDefault(); e.stopPropagation(); setOverKey(key); setIndicator({ key, before: t.id }); }}
        onCardDrop={(t, e) => { e.stopPropagation(); dropOnCard(dateStr, t); }}
      />
    );
  }

  const step = mode === "week" ? 7 : 1;
  const seg = (active: boolean) => ({ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: active ? "var(--cc-accent)" : "transparent", color: active ? "#100f1c" : "var(--cc-muted)" });
  const unscheduledCount = byKey(null).length;

  return (
    <PageShell title="Planner" icon="ph-calendar-check" subtitle={rangeLabel} scroll={false}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4, background: "#161824", border: "1px solid #262a3b", borderRadius: 9, padding: 3 }}>
          {(["week", "day"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} style={{ ...seg(mode === m), textTransform: "capitalize" }}>{m}</button>
          ))}
        </div>
        {/* Scope the list to everything, just eClass, or just your own tasks. */}
        <div style={{ display: "flex", gap: 4, background: "#161824", border: "1px solid #262a3b", borderRadius: 9, padding: 3 }} title="Filter by source">
          {FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} style={seg(filter === k)}>{label}</button>
          ))}
        </div>
        {/* Overlay the read-only calendar (eClass / feeds) on the days. Off by default. */}
        <button onClick={() => setShowEvents((v) => !v)} title="Show calendar events"
          style={{ display: "flex", alignItems: "center", gap: 5, ...seg(showEvents), background: showEvents ? "var(--cc-accent)" : "#161824", border: "1px solid #262a3b", borderRadius: 9, padding: "5px 12px" }}>
          <i className="ph ph-calendar-blank" style={{ fontSize: 14 }} />Events
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => setAnchor((a) => addDays(a, -step))}>‹ Prev</button>
          <button className="btn btn-ghost" onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setAnchor(d); }}>Today</button>
          <button className="btn btn-ghost" onClick={() => setAnchor((a) => addDays(a, step))}>Next ›</button>
        </div>
      </div>

      {/* every-day drop zone — fixed overlay so it never shifts layout mid-drag */}
      {dragActive && (
        <div
          onDragOver={(e) => { e.preventDefault(); setOverKey("everyday"); }}
          onDragLeave={() => setOverKey((k) => (k === "everyday" ? null : k))}
          onDrop={dropEveryDay}
          style={{ position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 100, padding: "10px 20px", borderRadius: 12, textAlign: "center", fontSize: 13, fontFamily: "var(--font-mono)", color: overKey === "everyday" ? "#100f1c" : "var(--cc-accent-soft)", background: overKey === "everyday" ? "var(--cc-accent)" : "#1c1f2e", border: "1px dashed var(--cc-accent)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}
        >
          ＋ drop here to add to every day this week
        </div>
      )}

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: mode === "week" ? "repeat(7,1fr)" : "1fr", gap: 10, minHeight: 0 }}>
        {shownDays.map((d) => column(ymd(d), DAY_NAMES[d.getDay()], String(d.getDate()), ymd(d) === today))}
      </div>

      {/* Unscheduled — a prominent capture bucket: jot it now, schedule it later. */}
      <div style={{ maxHeight: "32%", display: "flex", flexDirection: "column", minHeight: 96 }}>
        {column(null, "Unscheduled", unscheduledCount ? `${unscheduledCount}` : "jot it now, schedule later", false, true,
          { triggers: ["#", "-"], placeholder: "+ jot anything — schedule it later by dragging onto a day" })}
      </div>
      </div>
    </PageShell>
  );
}
