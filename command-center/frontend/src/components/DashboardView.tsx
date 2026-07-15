// The dashboard: a dense bento grid, rearrangeable within a footprint. Each
// tile has a footprint (wide / big / small); dragging a tile's grip onto
// another tile of the SAME footprint swaps their slots. Saved per user in
// localStorage.
//
// The Planner is the centerpiece: a today | tomorrow board of checkable task
// cards with category stripes and a live "now" divider. The other tiles carry
// restrained semantic color pops (green/amber/red + the purple accent).

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

const MONO = "var(--font-mono)";

function fmtTok(n?: number): string {
  if (!n) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// --- Task categories (derived from the title; the stripe is the only thing
// that depends on it, so it degrades fine). ------------------------------
type Category = "school" | "meeting" | "home" | "work";
const CAT_COLOR: Record<Category, string> = {
  school: "#e0654e",
  meeting: "#a99cf5",
  home: "#5fce9b",
  work: "#e0a84e",
};
const CAT_LEGEND: [Category, string][] = [["school", "SCHOOL"], ["meeting", "MEETING"], ["home", "HOME"], ["work", "WORK"]];

function categorize(title: string): Category {
  const t = title.toLowerCase();
  if (/\b(meeting|advisor|call|standup|check-?in|1:1|sync|interview|appt|appointment)\b/.test(t)) return "meeting";
  if (/\b(dinner|lunch|grocery|groceries|laundry|trash|cook|clean|dishes|apartment|home|rent)\b/.test(t)) return "home";
  if (/\b(shift|desk|work|clock|invoice|client)\b/.test(t)) return "work";
  return "school";
}

function toMin(dueTime: string): number {
  const [h, m] = dueTime.split(":").map(Number);
  return h * 60 + m;
}

// Compact time: "8:30a" / "2p" / "—" when untimed.
function shortTime(dueTime: string | null): string {
  if (!dueTime) return "—";
  const [hh, mm] = dueTime.split(":").map(Number);
  const ap = hh < 12 ? "a" : "p";
  const h12 = ((hh + 11) % 12) + 1;
  return mm ? `${h12}:${String(mm).padStart(2, "0")}${ap}` : `${h12}${ap}`;
}

type PlannerItem = { kind: "now"; label: string } | { kind: "task"; task: Task };

// Build a day's rows, inserting a "now" marker (today only) before the first
// upcoming timed task — or at the bottom if everything's in the past.
function buildItems(tasks: Task[], nowMin: number | null, nowLabel: string): PlannerItem[] {
  const items: PlannerItem[] = [];
  let placed = false;
  for (const task of tasks) {
    const min = task.dueTime ? toMin(task.dueTime) : null;
    if (nowMin != null && !placed && min != null && min > nowMin) {
      items.push({ kind: "now", label: nowLabel });
      placed = true;
    }
    items.push({ kind: "task", task });
  }
  if (nowMin != null && !placed && tasks.length > 0) items.push({ kind: "now", label: nowLabel });
  return items;
}

type ColumnProps = {
  label: string;
  sub: string;
  accent: string;
  count: number;
  pillBg: string;
  pillColor: string;
  colBg: string;
  colBorder: string;
  addLabel: string;
  addDate: string;
  items: PlannerItem[];
  onToggle: (t: Task) => void;
};

function DayColumn(props: ColumnProps) {
  const { label, sub, accent, count, pillBg, pillColor, colBg, colBorder, addLabel, addDate, items, onToggle } = props;
  const hasTasks = items.some((i) => i.kind === "task");
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: colBg, border: `1px solid ${colBorder}`, borderRadius: 14, padding: "13px 13px 11px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", color: accent }}>{label}</div>
          <div style={{ fontSize: 12, color: "var(--cc-muted)", marginTop: 3 }}>{sub}</div>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10.5, padding: "3px 9px", borderRadius: 999, background: pillBg, color: pillColor, whiteSpace: "nowrap", flexShrink: 0 }}>{count} left</span>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto", minHeight: 0, paddingRight: 2 }}>
        {!hasTasks && <div style={{ color: "var(--cc-dim)", fontSize: 12.5, padding: "6px 2px" }}>Nothing planned — enjoy the gap.</div>}
        {items.map((item, i) => {
          if (item.kind === "now") {
            return (
              <div key={`now-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, margin: "3px 0 2px" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--cc-accent)", animation: "nowpulse 2.2s ease-in-out infinite", flexShrink: 0 }} />
                <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg,#8b7cf0,#8b7cf022 70%,transparent)" }} />
                <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".09em", color: "var(--cc-accent-soft)" }}>NOW · {item.label}</span>
              </div>
            );
          }
          const t = item.task;
          const cat = CAT_COLOR[categorize(t.title)];
          const timeColor = t.dueTime ? (t.done ? "#4a5170" : "#a99cf5") : "#3a3f57";
          const titleColor = t.done ? "#4a5170" : "#dfe2ec";
          return (
            <div key={t.id} className="cc-taskcard" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 9px", background: "#12131d", border: "1px solid #20233a", borderLeft: `3px solid ${cat}`, borderRadius: 9 }}>
              <button onClick={(e) => { e.stopPropagation(); onToggle(t); }} style={{ background: "none", border: "none", padding: 0, display: "flex", cursor: "pointer", flexShrink: 0 }} title={t.done ? "Mark not done" : "Mark done"}>
                {t.done
                  ? <i className="ph-fill ph-check-circle" style={{ fontSize: 16, color: cat }} />
                  : <i className="ph ph-circle" style={{ fontSize: 16, color: "#3a3f57" }} />}
              </button>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.35, color: titleColor, textDecoration: t.done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: timeColor, marginRight: 7 }}>{shortTime(t.dueTime)}</span>{t.title}
              </span>
            </div>
          );
        })}
      </div>
      <div
        onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("cc:quickadd", { detail: { date: addDate } })); }}
        style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${colBorder}`, fontFamily: MONO, fontSize: 11, color: "var(--cc-dim)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        title={`Add a task to ${addLabel}`}
      >
        <i className="ph ph-plus" style={{ fontSize: 12 }} /> add to {addLabel}
      </div>
    </div>
  );
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

function dotColor(d: Deadline): string {
  const rel = relativeDay(d.due);
  if (d.overdue || rel === "Today" || rel === "Tomorrow") return "var(--cc-bad)";
  if (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(rel)) return "var(--cc-warn)";
  return "var(--cc-dim)";
}

const SCRIPT_STRIPE = ["var(--cc-good)", "var(--cc-warn)", "var(--cc-accent-soft)"];

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
  const { tasks, toggle } = useTasks();
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
  const gradePct = topCourse?.totalPercent ?? null;
  const gradeColor = gradePct == null ? "var(--cc-bright)" : gradePct >= 90 ? "var(--cc-good)" : gradePct >= 80 ? "var(--cc-warn)" : "var(--cc-bad)";
  const gradeChip = gradePct == null ? null
    : gradePct >= 90 ? { label: "on track", color: "#5fce9b", bg: "#5fce9b1a" }
    : gradePct >= 80 ? { label: "steady", color: "#e0a84e", bg: "#e0a84e1a" }
    : { label: "heads up", color: "#e0654e", bg: "#e0654e1a" };
  const grocOutstanding = grocery.filter((g) => !g.done);

  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA"); // YYYY-MM-DD local
  const tmr = new Date(now);
  tmr.setDate(tmr.getDate() + 1);
  const tomorrowStr = tmr.toLocaleDateString("en-CA");
  const daySub = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowLabel = `${clock.hm} ${clock.ampm}`;

  const byTime = (a: { dueTime: string | null; position: number }, b: { dueTime: string | null; position: number }) => {
    if (a.dueTime && b.dueTime) return a.dueTime < b.dueTime ? -1 : 1;
    if (a.dueTime) return -1;
    if (b.dueTime) return 1;
    return a.position - b.position;
  };
  const todayTasks = tasks.filter((t) => t.dueDate === todayStr).sort(byTime);
  const tomorrowTasks = tasks.filter((t) => t.dueDate === tomorrowStr).sort(byTime);
  const todayItems = buildItems(todayTasks, nowMin, nowLabel);
  const tomorrowItems = buildItems(tomorrowTasks, null, nowLabel);
  const remToday = todayTasks.filter((t) => !t.done).length;
  const remTomorrow = tomorrowTasks.filter((t) => !t.done).length;
  const openCount = tasks.filter((t) => !t.done).length;

  // Inner content per widget (closes over the live data above).
  const content = useMemo<Record<WidgetId, ReactNode>>(() => ({
    hero: (
      <>
        <div style={{ position: "absolute", right: -40, top: -40, width: 190, height: 190, borderRadius: "50%", background: "#ffffff1f" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.62 }}>{clock.dateLong}</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "clamp(26px,3.4vw,38px)", lineHeight: 1.05, marginTop: 6 }}>{clock.greeting}, {firstName}.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", position: "relative" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, opacity: 0.66 }}>
              <span className="pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#1f7a4d" }} />Agent synced · Collegedale, TN
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, opacity: 0.9, marginTop: 2 }}>Weather · soon</div>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, opacity: 0.72 }}>{clock.hm} {clock.ampm}</div>
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
            {deadlines.slice(0, 4).map((d) => {
              const rel = relativeDay(d.due);
              const soon = d.overdue || rel === "Today" || rel === "Tomorrow";
              return (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 13, fontSize: 14 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: dotColor(d) }} />
                  <span style={{ flex: 1, color: "var(--cc-bright)" }}>{d.title}</span>
                  <span style={{ fontFamily: MONO, color: "var(--cc-muted)", fontSize: 12 }}>{d.courseName}</span>
                  <span style={{ color: soon ? "var(--cc-bad)" : "var(--cc-muted)", fontSize: 13, width: 74, textAlign: "right" }}>{rel}</span>
                </div>
              );
            })}
          </div>
        )}
      </>
    ),
    planner: (
      <>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <i className="ph ph-calendar-check" style={{ color: "var(--cc-accent-soft)", fontSize: 17 }} />
            <span className="cc-label" style={{ fontWeight: 500 }}>PLANNER</span>
          </div>
          <span className="cc-label">{openCount} open · plan →</span>
        </div>
        <div style={{ display: "flex", gap: 15, marginBottom: 16, fontFamily: MONO, fontSize: 10, letterSpacing: ".04em", color: "var(--cc-dim)", flexWrap: "wrap" }}>
          {CAT_LEGEND.map(([cat, name]) => (
            <span key={cat} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: CAT_COLOR[cat] }} />{name}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, display: "flex", gap: 14, minHeight: 0 }} onClick={(e) => e.stopPropagation()}>
          <DayColumn
            label="TODAY" sub={daySub(now)} addLabel="today" addDate={todayStr}
            accent="var(--cc-accent-soft)" pillBg="#8b7cf022" pillColor="#a99cf5"
            colBg="#8b7cf00a" colBorder="#2f2a55" count={remToday} items={todayItems} onToggle={toggle}
          />
          <DayColumn
            label="TOMORROW" sub={daySub(tmr)} addLabel="tomorrow" addDate={tomorrowStr}
            accent="#8a90a8" pillBg="#20233a" pillColor="#9aa0b8"
            colBg="transparent" colBorder="#20233a" count={remTomorrow} items={tomorrowItems} onToggle={toggle}
          />
        </div>
      </>
    ),
    grades: (
      <>
        <div className="cc-label" style={{ marginBottom: 12 }}>GRADES <span style={{ color: "var(--cc-dim)" }}>· S26</span></div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 34, fontWeight: 700, color: gradeColor, lineHeight: 1 }}>{gradePct != null ? `${gradePct}%` : "—"}</span>
          {gradeChip && <span style={{ fontSize: 11, color: gradeChip.color, background: gradeChip.bg, padding: "2px 7px", borderRadius: 6, fontFamily: MONO }}>{gradeChip.label}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 16, fontSize: 12 }}>
          {courses.slice(0, 4).map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 60, color: "#8a90a8", fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.shortName}</span>
              <div style={{ flex: 1, height: 5, background: "#232739", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${c.totalPercent ?? 0}%`, height: "100%", background: "linear-gradient(90deg,#5fce9b,#8b7cf0)" }} /></div>
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
          {scripts.slice(0, 3).map((s, i) => (
            <button
              key={s.id}
              className="cc-scriptrow"
              onClick={(e) => { e.stopPropagation(); runScript(s.id); }}
              style={{ display: "flex", alignItems: "center", gap: 9, textAlign: "left", background: "#0f101a", border: "1px solid #262a3b", borderRadius: 9, padding: "8px 11px", cursor: "pointer" }}
            >
              <span style={{ color: SCRIPT_STRIPE[i % SCRIPT_STRIPE.length], fontFamily: MONO, fontSize: 12 }}>▸</span>
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
          <span style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, color: "var(--cc-accent-soft)", lineHeight: 1 }}>{fmtTok(usage?.today?.io)}</span>
          <span style={{ fontSize: 12, color: "var(--cc-muted)" }}>today</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14, fontSize: 11.5, fontFamily: MONO }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--cc-muted)" }}>today est</span><span style={{ color: "var(--cc-text)" }}>~${usage?.today?.costEst ?? 0}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--cc-muted)" }}>this week</span><span style={{ color: "var(--cc-text)" }}>{fmtTok(usage?.week?.io)} · ~${usage?.week?.costEst ?? 0}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--cc-muted)" }}>session</span>
            <span style={{ color: "var(--cc-good)", display: "flex", alignItems: "center", gap: 5 }}>
              <span className="pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cc-good)" }} />{usage ? "healthy" : "idle"}
            </span>
          </div>
          {!usage && <div style={{ color: "var(--cc-muted)" }}>Run `agent claude-usage`.</div>}
        </div>
      </>
    ),
    lists: (
      <>
        <div className="cc-label" style={{ marginBottom: 13 }}>APARTMENT LIST <span style={{ color: "var(--cc-dim)" }}>· shared</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 13 }}>
          {grocery.slice(0, 5).map((g) => (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 9, opacity: g.done ? 0.5 : 1 }}>
              {g.done
                ? <i className="ph-fill ph-check-circle" style={{ fontSize: 12, color: "var(--cc-good)", flexShrink: 0 }} />
                : <span style={{ width: 6, height: 6, borderRadius: "50%", background: g.addedByOwner ? "var(--cc-good)" : "var(--cc-accent-soft)", flexShrink: 0 }} />}
              <span style={{ flex: 1, color: g.done ? "var(--cc-dim)" : "var(--cc-text)", textDecoration: g.done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}{g.quantity ? ` · ${g.quantity}` : ""}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--cc-dim)" }}>{g.addedByInitial}</span>
            </div>
          ))}
          {grocery.length === 0 && <div style={{ color: "var(--cc-muted)" }}>List is empty.</div>}
          {grocOutstanding.length > 5 && <div style={{ color: "var(--cc-muted)" }}>+ {grocOutstanding.length - 5} more</div>}
        </div>
      </>
    ),
  }), [clock, firstName, deadlines, courses, grocery, grocOutstanding, gradePct, gradeColor, gradeChip, topCourse, usage, scripts, ranScript, todayItems, tomorrowItems, remToday, remTomorrow, openCount, now, tmr, todayStr, tomorrowStr, toggle]);

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
