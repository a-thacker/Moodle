// The dashboard: a dense 4x4 bento grid (TARGET design), now rearrangeable.
// Each tile has a footprint (wide / tall / small / strip); dragging a tile's
// grip onto another tile of the SAME footprint swaps their slots, so the grid
// never breaks. The arrangement is saved per user in localStorage.
//
// Real data drives Grades, Due Soon, Grocery, Scripts; the roadmap tiles
// (Agenda, Assistant, Homelab, weather) are clearly labeled placeholders.

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
import type { ClaudeUsage, Deadline, ScriptInfo } from "../types";
import { relativeDay } from "../utils/format";

const MONO = "var(--font-mono)";

function fmtTok(n?: number): string {
  if (!n) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

type WidgetId =
  | "hero" | "dueSoon" | "agenda" | "assistant"
  | "scripts" | "grades" | "claude" | "lists";
type Footprint = "wide" | "tall" | "small";

const SLOTS: Record<Footprint, CSSProperties[]> = {
  wide: [{ gridColumn: "1 / 3", gridRow: "1" }, { gridColumn: "1 / 3", gridRow: "2" }],
  tall: [{ gridColumn: "3", gridRow: "1 / 3" }, { gridColumn: "4", gridRow: "1 / 3" }],
  small: [
    { gridColumn: "1", gridRow: "3" }, { gridColumn: "2", gridRow: "3" },
    { gridColumn: "3", gridRow: "3" }, { gridColumn: "4", gridRow: "3" },
  ],
};

const DEFAULT: Record<Footprint, WidgetId[]> = {
  wide: ["hero", "dueSoon"],
  tall: ["agenda", "assistant"],
  small: ["scripts", "grades", "claude", "lists"],
};

const META: Record<WidgetId, { footprint: Footprint; className?: string; style?: CSSProperties; view?: View }> = {
  hero: { footprint: "wide", style: { background: "linear-gradient(135deg,#8b7cf0,#6857c8)", borderRadius: "var(--cc-radius)", padding: "26px 28px", color: "#100f1c", display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" } },
  dueSoon: { footprint: "wide", className: "cc-tile cc-clickable", view: "deadlines" },
  agenda: { footprint: "tall", className: "cc-tile cc-clickable", view: "planner" },
  assistant: { footprint: "tall", style: { background: "linear-gradient(180deg,#181a2b,#141420)", border: "1px solid #2a2550", borderRadius: "var(--cc-radius)", padding: "22px 24px", display: "flex", flexDirection: "column", minHeight: 0 } },
  scripts: { footprint: "small", className: "cc-tile cc-clickable", view: "scripts" },
  grades: { footprint: "small", className: "cc-tile cc-clickable", view: "grades" },
  claude: { footprint: "small", className: "cc-tile" },
  lists: { footprint: "small", className: "cc-tile cc-clickable", view: "grocery" },
};

const ORDER: Footprint[] = ["wide", "tall", "small"];

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
  const [scripts, setScripts] = useState<ScriptInfo[]>([]);
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);
  const [arrangement, setArrangement] = useState<Record<Footprint, WidgetId[]>>(() => loadArrangement(user?.id));
  const [dragFp, setDragFp] = useState<Footprint | null>(null);
  const dragRef = useRef<{ fp: Footprint; id: WidgetId } | null>(null);

  useEffect(() => { api.scripts.list().then(setScripts).catch(() => {}); }, []);
  useEffect(() => { api.claudeUsage().then(setUsage).catch(() => {}); }, []);
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

  const firstName = (user?.display_name ?? "there").split(" ")[0];
  const topCourse = courses[0];
  const grocOutstanding = grocery.filter((g) => !g.done);
  const weekTasks = tasks
    .filter((t) => !t.done && t.dueDate)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
    .slice(0, 7);

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
    agenda: (
      <>
        <Label extra="this week">PLANNER</Label>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11, overflowY: "auto", minHeight: 0, fontSize: 13 }}>
          {weekTasks.length === 0 ? (
            <div style={{ color: "var(--cc-muted)" }}>No dated tasks yet — plan some in the week planner.</div>
          ) : (
            weekTasks.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <span style={{ fontFamily: MONO, color: "var(--cc-accent-soft)", fontSize: 12, width: 58, flexShrink: 0 }}>{relativeDay(t.dueDate + "T00:00:00")}</span>
                <span style={{ flex: 1, color: "var(--cc-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
              </div>
            ))
          )}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #232739", fontFamily: MONO, fontSize: 12, color: "var(--cc-muted)" }}>
          {tasks.filter((t) => !t.done).length} open · tap to plan →
        </div>
      </>
    ),
    assistant: (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
          <span className="pulse" style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--cc-accent)" }} />
          <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".08em", color: "var(--cc-accent-soft)" }}>ASSISTANT · ollama</span>
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: "#dcdfea" }}>The local assistant lives here once a model is loaded. It'll read your grades, deadlines, and notes to help you plan.</div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, background: "#0f101a", border: "1px solid #2a2e42", borderRadius: 11, padding: "11px 14px" }}>
          <span style={{ color: "var(--cc-muted)", fontSize: 14, flex: 1 }}>Ask anything… (soon)</span>
          <span style={{ color: "var(--cc-accent)", fontSize: 16 }}>↑</span>
        </div>
      </>
    ),
    scripts: (
      <>
        <div className="cc-label" style={{ marginBottom: 14 }}>SCRIPTS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: MONO, fontSize: 12 }}>
          {scripts.slice(0, 3).map((s) => (
            <div key={s.id} style={{ border: "1px solid #262a3b", borderRadius: 8, padding: "9px 11px", color: "var(--cc-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>▸ {s.id}</div>
          ))}
          <div style={{ border: "1px dashed #3a3f58", borderRadius: 8, padding: "9px 11px", color: "var(--cc-muted)" }}>▸ open terminal</div>
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
    claude: (
      <>
        <Label extra={usage?.updatedAt ? new Date(usage.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "run agent"}>CLAUDE USAGE</Label>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 700, color: "var(--cc-bright)", lineHeight: 1 }}>{fmtTok(usage?.today?.tokens)}</span>
          <span style={{ fontSize: 12, color: "var(--cc-muted)" }}>tok today</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14, fontSize: 12, fontFamily: MONO }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--cc-muted)" }}>today</span><span style={{ color: "var(--cc-text)" }}>~${usage?.today?.costEst ?? 0}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--cc-muted)" }}>this week</span><span style={{ color: "var(--cc-text)" }}>{fmtTok(usage?.week?.tokens)} · ~${usage?.week?.costEst ?? 0}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--cc-muted)" }}>all time</span><span style={{ color: "var(--cc-text)" }}>{fmtTok(usage?.totals?.tokens)} · ~${usage?.totals?.costEst ?? 0}</span></div>
          {usage?.byModel && Object.keys(usage.byModel)[0] && (
            <div style={{ color: "var(--cc-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>top: {Object.keys(usage.byModel)[0].replace("claude-", "")}</div>
          )}
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
  }), [clock, firstName, deadlines, courses, scripts, grocery, grocOutstanding, topCourse, usage, weekTasks, tasks]);

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
