// The dashboard: a dense bento grid (TARGET design), rearrangeable within a
// footprint. Each tile has a footprint (wide / big / small); dragging a tile's
// grip onto another tile of the SAME footprint swaps their slots, so the grid
// never breaks. The arrangement is saved per user in localStorage.
//
// Real data drives Grades, Due Soon, Grocery, and the Planner. The Planner is
// the centerpiece: a big today | tomorrow board. The old dedicated Assistant
// and Scripts tiles were removed — chat lives in the bottom bar + rail icon.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { useAuth } from "../auth/AuthContext.tsx";
import { useClock } from "../hooks/useClock";
import { useDashboardData } from "../hooks/useDashboardData";
import { useGrocery } from "../hooks/useGrocery";
import { useTasks } from "../hooks/useTasks";
import { useNav, type View } from "../nav/NavContext.tsx";
import { api } from "../api/client";
import type { ClaudeUsage, Deadline, ScriptInfo, Task } from "../types";
import { relativeDay } from "../utils/format";
import { fmtTime } from "../utils/time";

function untilLabel(iso?: string | null): string {
  if (!iso) return "idle";
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins <= 0) return "now";
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

const MONO = "var(--font-mono)";

function fmtTok(n?: number): string {
  if (!n) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

type WidgetId = "hero" | "dueSoon" | "planner" | "grades" | "scripts" | "claude" | "lists";
type Footprint = "wide" | "big" | "small";

const SLOTS: Record<Footprint, CSSProperties[]> = {
  wide: [{ gridColumn: "1 / 3", gridRow: "1" }, { gridColumn: "1 / 3", gridRow: "2" }],
  big: [{ gridColumn: "3 / 5", gridRow: "1 / 3" }],
  small: [
    { gridColumn: "1", gridRow: "3" },
    { gridColumn: "2", gridRow: "3" },
    { gridColumn: "3", gridRow: "3" },
    { gridColumn: "4", gridRow: "3" },
  ],
};

const DEFAULT: Record<Footprint, WidgetId[]> = {
  wide: ["hero", "dueSoon"],
  big: ["planner"],
  small: ["grades", "scripts", "lists", "claude"],
};

const META: Record<WidgetId, { footprint: Footprint; className?: string; style?: CSSProperties; view?: View }> = {
  hero: { footprint: "wide", style: { background: "linear-gradient(135deg,#8b7cf0,#6857c8)", borderRadius: "var(--cc-radius)", padding: "26px 28px", color: "#100f1c", display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" } },
  dueSoon: { footprint: "wide", className: "cc-tile cc-clickable", view: "deadlines" },
  planner: { footprint: "big", className: "cc-tile cc-clickable", view: "planner" },
  grades: { footprint: "small", className: "cc-tile cc-clickable", view: "grades" },
  scripts: { footprint: "small", className: "cc-tile cc-clickable", view: "scripts" },
  claude: { footprint: "small", className: "cc-tile" },
  lists: { footprint: "small", className: "cc-tile cc-clickable", view: "grocery" },
};

const ORDER: Footprint[] = ["wide", "big", "small"];

function Label({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
      <span className="cc-label" style={{ fontWeight: 500 }}>{children}</span>
      {extra != null && <span className="cc-label">{extra}</span>}
    </div>
  );
}

// One column of the planner board: a day header + its ordered task list.
function DayColumn({ label, sub, tasks, accent }: { label: string; sub: string; tasks: Task[]; accent: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
      <div style={{ marginBottom: 13 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".08em", color: accent }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--cc-muted)", marginTop: 3 }}>{sub}</div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, overflowY: "auto", minHeight: 0 }}>
        {tasks.length === 0 ? (
          <div style={{ color: "var(--cc-dim)", fontSize: 12.5 }}>Nothing planned.</div>
        ) : (
          tasks.map((t) => (
            <div key={t.id} className="row-hover" style={{ display: "flex", gap: 9, alignItems: "baseline", padding: "3px 2px" }}>
              <span style={{ fontFamily: MONO, color: t.dueTime ? "var(--cc-accent-soft)" : "var(--cc-dim)", fontSize: 11, width: 44, flexShrink: 0 }}>{t.dueTime ? fmtTime(t.dueTime) : "—"}</span>
              <span style={{ flex: 1, color: "var(--cc-text)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function dotColor(d: Deadline): string {
  const rel = relativeDay(d.due);
  if (d.overdue || rel === "Today" || rel === "Tomorrow") return "var(--cc-bad)";
  if (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(rel)) return "var(--cc-warn)";
  return "var(--cc-dim)";
}

function loadArrangement(userId: string | undefined): Record<Footprint, WidgetId[]> {
  try {
    const raw = localStorage.getItem(`cc_dashboard_${userId ?? "x"}`);
    if (!raw) return DEFAULT;
    const saved = JSON.parse(raw) as Record<Footprint, WidgetId[]>;
    // Validate: every footprint must contain exactly its default members.
    for (const fp of ORDER) {
      const a = [...(saved[fp] ?? [])].sort();
      const b = [...DEFAULT[fp]].sort();
      if (a.length !== b.length || a.some((x, i) => x !== b[i])) return DEFAULT;
    }
    return saved;
  } catch {
    return DEFAULT;
  }
}

export default function DashboardView() {
  const { user } = useAuth();
  const clock = useClock();
  const { setView } = useNav();
  const { courses, deadlines } = useDashboardData();
  const { items: grocery } = useGrocery();
  const { tasks } = useTasks();
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [ranScript, setRanScript] = useState<string | null>(null);
  const [arrangement, setArrangement] = useState<Record<Footprint, WidgetId[]>>(() => loadArrangement(user?.id));
  const [dragFp, setDragFp] = useState<Footprint | null>(null);
  const dragRef = useRef<{ fp: Footprint; id: WidgetId } | null>(null);

  useEffect(() => { api.claudeUsage().then(setUsage).catch(() => {}); }, []);
  useEffect(() => { api.scripts.list().then(setScripts).catch(() => {}); }, []);
  useEffect(() => setArrangement(loadArrangement(user?.id)), [user?.id]);
  useEffect(() => {
    if (user?.id) localStorage.setItem(`cc_dashboard_${user.id}`, JSON.stringify(arrangement));
  }, [arrangement, user?.id]);

  function onDrop(fp: Footprint, targetId: WidgetId) {
    const src = dragRef.current;
    dragRef.current = null;
    setDragFp(null);
    if (!src || src.fp !== fp || src.id === targetId) return;
    setArrangement((prev) => {
      const arr = [...prev[fp]];
      const i = arr.indexOf(src.id);
      const j = arr.indexOf(targetId);
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...prev, [fp]: arr };
    });
  }

  async function runScript(id: string) {
    try {
      await api.scripts.run(id);
      setRanScript(id);
      setTimeout(() => setRanScript((r) => (r === id ? null : r)), 1600);
    } catch {
      /* the Scripts view surfaces failures */
    }
  }

  const firstName = (user?.display_name ?? "there").split(" ")[0];
  const topCourse = courses[0];
  const grocOutstanding = grocery.filter((g) => !g.done);

  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA"); // YYYY-MM-DD local
  const tmr = new Date(now);
  tmr.setDate(tmr.getDate() + 1);
  const tomorrowStr = tmr.toLocaleDateString("en-CA");
  const dayLabel = (d: Date) => d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  const byTime = (a: { dueTime: string | null; position: number }, b: { dueTime: string | null; position: number }) => {
    if (a.dueTime && b.dueTime) return a.dueTime < b.dueTime ? -1 : 1;
    if (a.dueTime) return -1;
    if (b.dueTime) return 1;
    return a.position - b.position;
  };
  const todayTasks = tasks.filter((t) => !t.done && t.dueDate === todayStr).sort(byTime);
  const tomorrowTasks = tasks.filter((t) => !t.done && t.dueDate === tomorrowStr).sort(byTime);
  const openCount = tasks.filter((t) => !t.done).length;

  // Inner content per widget (closes over the live data above).
  const content = useMemo<Record<WidgetId, ReactNode>>(() => ({
    hero: (
      <>
        <div style={{ position: "absolute", right: -40, top: -40, width: 190, height: 190, borderRadius: "50%", background: "#ffffff1f" }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.65 }}>{clock.dateLong}</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 38, lineHeight: 1.03, marginTop: 8 }}>{clock.greeting}, {firstName}.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.65 }}>Collegedale, TN</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, opacity: 0.9 }}>Weather · soon</div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, opacity: 0.7 }}>{clock.hm} {clock.ampm}</div>
        </div>
      </>
    ),
    dueSoon: (
      <>
        <Label extra="eClass timeline">DUE SOON</Label>
        {deadlines.length === 0 ? (
          <div style={{ color: "var(--cc-muted)", fontSize: 13 }}>Nothing upcoming — Fall '26 activities populate after the next sync.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {deadlines.slice(0, 4).map((d) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 13, fontSize: 14 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: dotColor(d) }} />
                <span style={{ flex: 1, color: "var(--cc-bright)" }}>{d.title}</span>
                <span style={{ fontFamily: MONO, color: "var(--cc-muted)", fontSize: 12 }}>{d.courseName}</span>
                <span style={{ color: "var(--cc-muted)", fontSize: 13, width: 74, textAlign: "right" }}>{relativeDay(d.due)}</span>
              </div>
            ))}
          </div>
        )}
      </>
    ),
    planner: (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span className="cc-label" style={{ fontWeight: 500 }}>PLANNER</span>
          <span className="cc-label">{openCount} open · plan →</span>
        </div>
        <div style={{ flex: 1, display: "flex", gap: 20, minHeight: 0 }}>
          <DayColumn label="TODAY" sub={dayLabel(now)} tasks={todayTasks} accent="var(--cc-accent-soft)" />
          <div style={{ width: 1, background: "#232739", flexShrink: 0 }} />
          <DayColumn label="TOMORROW" sub={dayLabel(tmr)} tasks={tomorrowTasks} accent="var(--cc-muted)" />
        </div>
      </>
    ),
    grades: (
      <>
        <div className="cc-label" style={{ marginBottom: 12 }}>GRADES · S26</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, color: "var(--cc-bright)", lineHeight: 1 }}>{topCourse?.totalPercent != null ? `${topCourse.totalPercent}%` : "—"}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16, fontSize: 12 }}>
          {courses.slice(0, 4).map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 58, color: "#8a90a8", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.shortName}</span>
              <div style={{ flex: 1, height: 5, background: "#232739", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${c.totalPercent ?? 0}%`, height: "100%", background: "var(--cc-accent)" }} /></div>
              <span style={{ color: "var(--cc-text)", width: 26, textAlign: "right" }}>{c.totalPercent ?? "—"}</span>
            </div>
          ))}
          {courses.length === 0 && <span style={{ color: "var(--cc-muted)" }}>Populates after sync.</span>}
        </div>
      </>
    ),
    scripts: (
      <>
        <div className="cc-label" style={{ marginBottom: 12 }}>SCRIPTS <span style={{ color: "var(--cc-dim)" }}>· one-tap</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {scripts.slice(0, 3).map((s) => (
            <button
              key={s.id}
              onClick={(e) => { e.stopPropagation(); runScript(s.id); }}
              style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "left", background: "#0f101a", border: "1px solid #262a3b", borderRadius: 9, padding: "8px 11px", cursor: "pointer" }}
            >
              <span style={{ color: "var(--cc-accent-soft)", fontFamily: MONO, fontSize: 12 }}>▸</span>
              <span style={{ flex: 1, color: "var(--cc-text)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
              {ranScript === s.id && <span style={{ color: "var(--cc-good)", fontSize: 11, fontFamily: MONO }}>queued ✓</span>}
            </button>
          ))}
          {scripts.length === 0 && <span style={{ color: "var(--cc-muted)", fontSize: 12.5 }}>Mac runner offline.</span>}
        </div>
      </>
    ),
    claude: (
      <>
        <Label extra={usage?.updatedAt ? new Date(usage.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "run agent"}>CLAUDE USAGE</Label>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, color: "var(--cc-bright)", lineHeight: 1 }}>{fmtTok(usage?.today?.io)}</span>
          <span style={{ fontSize: 12, color: "var(--cc-muted)" }}>generated today</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14, fontSize: 12, fontFamily: MONO }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--cc-muted)" }}>today est</span><span style={{ color: "var(--cc-text)" }}>~${usage?.today?.costEst ?? 0}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--cc-muted)" }}>this week</span><span style={{ color: "var(--cc-text)" }}>{fmtTok(usage?.week?.io)} · ~${usage?.week?.costEst ?? 0}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--cc-muted)" }}>all time</span><span style={{ color: "var(--cc-text)" }}>{fmtTok(usage?.totals?.io)} · ~${usage?.totals?.costEst ?? 0}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--cc-dim)", fontSize: 11 }}><span>session resets in</span><span>{untilLabel(usage?.sessionResetsAt)}</span></div>
          <div style={{ color: "var(--cc-dim)", fontSize: 11 }}>+{fmtTok(usage?.today?.tokens)} ctx read today</div>
          {!usage && <div style={{ color: "var(--cc-muted)" }}>Run `agent claude-usage`.</div>}
        </div>
      </>
    ),
    lists: (
      <>
        <div className="cc-label" style={{ marginBottom: 12 }}>APARTMENT LIST <span style={{ color: "var(--cc-dim)" }}>· shared</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13 }}>
          {grocery.slice(0, 5).map((g) => (
            <div key={g.id} style={{ color: g.done ? "var(--cc-dim)" : "var(--cc-text)", textDecoration: g.done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}{g.quantity ? ` · ${g.quantity}` : ""}</div>
          ))}
          {grocery.length === 0 && <div style={{ color: "var(--cc-muted)" }}>List is empty.</div>}
          {grocOutstanding.length > 5 && <div style={{ color: "var(--cc-muted)" }}>+ {grocOutstanding.length - 5} more</div>}
        </div>
      </>
    ),
  }), [clock, firstName, deadlines, courses, grocery, grocOutstanding, topCourse, usage, scripts, ranScript, todayTasks, tomorrowTasks, openCount, now, tmr]);

  return (
    <div className="cc-grid">
      {ORDER.flatMap((fp) =>
        arrangement[fp].map((id, k) => {
          const m = META[id];
          const dropOk = dragFp === fp;
          return (
            <div
              key={id}
              className={`cc-slot ${m.className ?? ""} ${dropOk ? "cc-drop-ok" : ""}`}
              style={{ ...m.style, ...SLOTS[fp][k] }}
              onClick={m.view ? () => setView(m.view!) : undefined}
              onDragOver={(e) => { if (dragFp === fp) e.preventDefault(); }}
              onDrop={() => onDrop(fp, id)}
            >
              <span
                className="cc-handle"
                draggable
                title="Drag to rearrange"
                onClick={(e) => e.stopPropagation()}
                onDragStart={(e) => { dragRef.current = { fp, id }; setDragFp(fp); e.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => { dragRef.current = null; setDragFp(null); }}
              >
                <i className="ph ph-dots-six-vertical" style={{ fontSize: 15 }} />
              </span>
              {content[id]}
            </div>
          );
        }),
      )}
    </div>
  );
}
