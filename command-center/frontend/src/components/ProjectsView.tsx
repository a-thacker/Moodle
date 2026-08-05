// Projects — group tasks under a goal and watch progress. Each project card
// shows a progress bar; expand it to see, add, and check off its tasks. Status
// controls (done / archive) and delete live in the expanded header. Tasks stay
// real tasks (they still appear in the Planner); a project just files them.

import { useMemo, useState, type FormEvent } from "react";

import { useProjects } from "../hooks/useProjects";
import { useTasks } from "../hooks/useTasks";
import type { Project, Task } from "../types";
import { fmtTime } from "../utils/time";
import EmptyState from "./EmptyState.tsx";
import PageShell from "./PageShell";

const DEFAULT_COLOR = "#8b7cf0";
const SWATCHES = ["#8b7cf0", "#4ec9b0", "#e0a84e", "#e0654e", "#5fce9b", "#7c9cff"];

function pct(p: Project): number {
  return p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
}

function ProjectCard({
  project,
  tasks,
  open,
  onToggleOpen,
  onAddTask,
  onToggleTask,
  onUnfileTask,
  onSetStatus,
  onDelete,
}: {
  project: Project;
  tasks: Task[];
  open: boolean;
  onToggleOpen: () => void;
  onAddTask: (title: string) => void;
  onToggleTask: (t: Task) => void;
  onUnfileTask: (t: Task) => void;
  onSetStatus: (status: Project["status"]) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState("");
  const color = project.color || DEFAULT_COLOR;
  const done = project.status === "done";
  const p = pct(project);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onAddTask(draft.trim());
    setDraft("");
  }

  return (
    <div style={{ border: "1px solid var(--cc-tile-border)", borderLeft: `3px solid ${color}`, borderRadius: 12, background: "var(--cc-tile)", opacity: project.status === "archived" ? 0.6 : 1 }}>
      <button
        type="button"
        onClick={onToggleOpen}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {done && <i className="ph-fill ph-check-circle" style={{ color: "var(--cc-good)", fontSize: 15, flexShrink: 0 }} />}
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, color: "var(--cc-bright)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: done ? "line-through" : "none" }}>
              {project.name}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <div style={{ flex: 1, height: 6, background: "#20233a", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${p}%`, height: "100%", background: color, borderRadius: 4, transition: "width .5s cubic-bezier(.4,0,.2,1)" }} />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--cc-muted)", flexShrink: 0 }}>
              {project.doneCount}/{project.taskCount}
            </span>
          </div>
        </div>
        <i className={`ph ${open ? "ph-caret-up" : "ph-caret-down"}`} style={{ fontSize: 14, color: "var(--cc-muted)", flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{ padding: "0 15px 14px" }}>
          {/* status + delete controls */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {done ? (
              <button type="button" className="btn btn-ghost" onClick={() => onSetStatus("active")}>Reopen</button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => onSetStatus("done")}><i className="ph ph-check" style={{ marginRight: 5 }} />Mark done</button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => onSetStatus(project.status === "archived" ? "active" : "archived")}>
              {project.status === "archived" ? "Unarchive" : "Archive"}
            </button>
            <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto", color: "var(--cc-bad)" }} onClick={onDelete}>
              <i className="ph ph-trash" style={{ marginRight: 5 }} />Delete
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {tasks.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "#181a26", borderRadius: 8, fontSize: 13 }}>
                <button type="button" onClick={() => onToggleTask(t)} style={{ background: "none", border: "none", padding: 0, display: "flex", cursor: "pointer" }}>
                  {t.done ? <i className="ph-fill ph-check-circle" style={{ color: "var(--cc-accent)", fontSize: 16 }} /> : <i className="ph ph-circle" style={{ color: "var(--cc-muted)", fontSize: 16 }} />}
                </button>
                <span style={{ flex: 1, color: t.done ? "var(--cc-dim)" : "var(--cc-text)", textDecoration: t.done ? "line-through" : "none", wordBreak: "break-word" }}>
                  {t.dueTime && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--cc-accent-soft)", marginRight: 6 }}>{fmtTime(t.dueTime)}</span>}
                  {t.title}
                </span>
                <button type="button" title="Remove from project" onClick={() => onUnfileTask(t)} style={{ background: "none", border: "none", color: "var(--cc-dim)", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                  <i className="ph ph-x" style={{ fontSize: 12 }} />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={submit} style={{ marginTop: 8 }}>
            <input className="input" placeholder="+ add a task to this project" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ fontSize: 13, minHeight: 32 }} />
          </form>
        </div>
      )}
    </div>
  );
}

export default function ProjectsView() {
  const { projects, loaded, add, setStatus, remove } = useProjects();
  const { tasks, add: addTask, toggle, patch } = useTasks();
  const [draft, setDraft] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [open, setOpen] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const tasksByProject = useMemo(() => {
    const m: Record<number, Task[]> = {};
    for (const t of tasks) {
      if (t.projectId == null) continue;
      (m[t.projectId] ??= []).push(t);
    }
    // Open tasks first, then done; stable by position.
    for (const k of Object.keys(m)) {
      m[Number(k)].sort((a, b) => Number(a.done) - Number(b.done) || a.position - b.position);
    }
    return m;
  }, [tasks]);

  const visible = projects
    .filter((p) => showArchived || p.status !== "archived")
    .sort((a, b) => {
      const rank = (s: Project["status"]) => (s === "active" ? 0 : s === "done" ? 1 : 2);
      return rank(a.status) - rank(b.status) || a.position - b.position;
    });
  const archivedCount = projects.filter((p) => p.status === "archived").length;

  function createProject(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    void add(draft.trim(), color);
    setDraft("");
  }

  return (
    <PageShell
      title="Projects"
      icon="ph-kanban"
      subtitle={loaded ? `${projects.filter((p) => p.status === "active").length} active` : undefined}
    >
      <form onSubmit={createProject} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              title="Project color"
              style={{ width: 18, height: 18, borderRadius: "50%", background: c, border: color === c ? "2px solid var(--cc-bright)" : "2px solid transparent", cursor: "pointer", padding: 0 }}
            />
          ))}
        </span>
        <input className="input" placeholder="New project…" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ minHeight: 36 }} />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim()} style={{ flexShrink: 0 }}>
          <i className="ph ph-plus" style={{ marginRight: 5 }} />Add
        </button>
      </form>

      {loaded && projects.length === 0 ? (
        <EmptyState icon="ph-kanban" title="No projects yet" hint="Create a project above, then file tasks under it to track progress toward a goal." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              tasks={tasksByProject[project.id] ?? []}
              open={open === project.id}
              onToggleOpen={() => setOpen(open === project.id ? null : project.id)}
              onAddTask={(title) => addTask(title, null, null, null, project.id)}
              onToggleTask={toggle}
              onUnfileTask={(t) => void patch(t.id, { project_id: -1 })}
              onSetStatus={(status) => void setStatus(project.id, status)}
              onDelete={() => void remove(project.id)}
            />
          ))}
          {archivedCount > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setShowArchived((v) => !v)} style={{ alignSelf: "flex-start", marginTop: 4 }}>
              {showArchived ? "Hide" : "Show"} archived ({archivedCount})
            </button>
          )}
        </div>
      )}
    </PageShell>
  );
}
