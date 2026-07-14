// Notes & Tasks — quick capture. Jot a line (Enter), optionally give it a
// day, and it becomes a task. Check it off or delete it. (Later: the
// assistant reads free-form notes and files them here automatically.)

import { useState, type FormEvent } from "react";

import { useTasks } from "../hooks/useTasks";
import type { Task } from "../types";
import { extractTime, fmtTime } from "../utils/time";

function dueLabel(due: string | null): string | null {
  if (!due) return null;
  const d = new Date(due + "T00:00:00");
  const days = Math.round((d.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TaskRow({ task, onToggle, onRemove }: { task: Task; onToggle: () => void; onRemove: () => void }) {
  const due = dueLabel(task.dueDate);
  const overdue = task.dueDate != null && !task.done && new Date(task.dueDate + "T00:00:00").getTime() < new Date().setHours(0, 0, 0, 0);
  return (
    <div className="row-hover" style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 8px" }}>
      <button type="button" onClick={onToggle} title="Toggle done" style={{ background: "none", border: "none", padding: 0, display: "flex" }}>
        {task.done ? (
          <i className="ph-fill ph-check-circle" style={{ color: "var(--cc-accent)", fontSize: 20 }} />
        ) : (
          <i className="ph ph-circle" style={{ color: "var(--cc-muted)", fontSize: 20 }} />
        )}
      </button>
      <span style={{ flex: 1, fontSize: 14, color: task.done ? "var(--cc-dim)" : "var(--cc-text)", textDecoration: task.done ? "line-through" : "none" }}>
        {task.dueTime && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--cc-accent-soft)", marginRight: 6 }}>{fmtTime(task.dueTime)}</span>}
        {task.title}
      </span>
      {due && (
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", padding: "2px 9px", borderRadius: 6, color: overdue ? "#f08e79" : "var(--cc-muted)", background: overdue ? "#e0654e26" : "#20233440" }}>
          {due}
        </span>
      )}
      <button type="button" onClick={onRemove} title="Delete" style={{ background: "none", border: "none", color: "var(--cc-dim)", cursor: "pointer", padding: 4 }}>
        <i className="ph ph-x" style={{ fontSize: 14 }} />
      </button>
    </div>
  );
}

export default function NotesView() {
  const { tasks, add, toggle, remove } = useTasks();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = extractTime(title);
    if (!parsed.title.trim()) return;
    add(parsed.title, due || null, parsed.time);
    setTitle("");
    setDue("");
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "4px 2px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <i className="ph ph-note" style={{ color: "var(--cc-accent)", fontSize: 20 }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: 0 }}>Notes &amp; Tasks</h2>
          <span style={{ fontSize: 12, color: "var(--cc-muted)" }}>{open.length} open</span>
        </div>

        {/* quick capture */}
        <form onSubmit={submit} className="card" style={{ padding: 14, display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="input"
            placeholder="Jot something down… (Enter to add)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            style={{ flex: 1, fontSize: 15 }}
          />
          <input
            className="input"
            type="date"
            title="Optional due date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            style={{ width: 150, fontSize: 13, colorScheme: "dark" }}
          />
          <button type="submit" className="btn btn-primary" style={{ paddingInline: 18 }}>Add</button>
        </form>

        {/* open */}
        <section className="card" style={{ padding: "10px 14px" }}>
          {open.length === 0 ? (
            <div style={{ color: "var(--cc-muted)", fontSize: 14, padding: "8px 4px" }}>Nothing to do. Nice.</div>
          ) : (
            open.map((t) => <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} onRemove={() => remove(t.id)} />)
          )}
        </section>

        {/* done */}
        {done.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div className="cc-label" style={{ padding: "0 4px 4px" }}>DONE · {done.length}</div>
            <div className="card" style={{ padding: "6px 14px", opacity: 0.75 }}>
              {done.map((t) => <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} onRemove={() => remove(t.id)} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
