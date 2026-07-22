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
import { useIsMobile } from "../hooks/useMediaQuery";
import { useDashboardData } from "../hooks/useDashboardData";
import { useGrocery } from "../hooks/useGrocery";
import { useTasks } from "../hooks/useTasks";
import { useNav, type View } from "../nav/NavContext.tsx";
import { usePrefs } from "../prefs/PrefsContext.tsx";
import { api } from "../api/client";
import type { ClaudeUsage, Deadline, Task, Weather } from "../types";
import { relativeDay } from "../utils/format";
import { CAT_COLOR, CAT_LEGEND, taskColor } from "../utils/category";
import ClaudeMark from "./ClaudeMark.tsx";
import WeatherLocationPicker, { type WeatherLoc } from "./WeatherLocationPicker.tsx";

const MONO = "var(--font-mono)";

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
          const cat = taskColor(t);
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

type WidgetId = "hero" | "dueSoon" | "planner" | "grades" | "claude" | "lists";
type Footprint = "wide" | "big" | "small";

const SLOTS: Record<Footprint, CSSProperties[]> = {
  wide: [{ gridColumn: "1 / 3", gridRow: "1" }, { gridColumn: "1 / 3", gridRow: "2" }],
  big: [{ gridColumn: "3 / 5", gridRow: "1 / 3" }],
  // Row 3: grades, grocery, then Claude usage spanning the last two columns.
  small: [
    { gridColumn: "1", gridRow: "3" },
    { gridColumn: "2", gridRow: "3" },
    { gridColumn: "3 / 5", gridRow: "3" },
  ],
};

const DEFAULT: Record<Footprint, WidgetId[]> = {
  wide: ["hero", "dueSoon"],
  big: ["planner"],
  small: ["grades", "lists", "claude"],
};

// Which capability each tile needs to be shown (null = always; "owner" = the
// admin only, e.g. the personal Claude-subscription usage). Keeps the dashboard
// home in sync with the rail so a user never sees a tool they lack.
const WIDGET_CAP: Record<WidgetId, string | null> = {
  hero: null,
  dueSoon: "deadlines",
  planner: "planner",
  grades: "grades",
  lists: "grocery",
  claude: "owner",
};

function visibleWidgets(caps: string[], isOwner: boolean): Record<Footprint, WidgetId[]> {
  const ok = (id: WidgetId) => {
    const need = WIDGET_CAP[id];
    if (need === null) return true;
    if (need === "owner") return isOwner;
    return caps.includes(need);
  };
  return {
    wide: DEFAULT.wide.filter(ok),
    big: DEFAULT.big.filter(ok),
    small: DEFAULT.small.filter(ok),
  };
}

const META: Record<WidgetId, { footprint: Footprint; className?: string; style?: CSSProperties; view?: View }> = {
  hero: { footprint: "wide", style: { background: "linear-gradient(135deg,#8b7cf0,#6857c8)", borderRadius: "var(--cc-radius)", padding: "26px 28px", color: "#100f1c", display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" } },
  dueSoon: { footprint: "wide", className: "cc-tile cc-clickable", view: "deadlines" },
  planner: { footprint: "big", className: "cc-tile cc-clickable", view: "planner" },
  grades: { footprint: "small", className: "cc-tile cc-clickable", view: "grades" },
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

function loadArrangement(
  saved: Record<Footprint, WidgetId[]> | undefined,
  visible: Record<Footprint, WidgetId[]>,
): Record<Footprint, WidgetId[]> {
  if (!saved) return visible;
  // Keep a saved arrangement only if it's a permutation of what this user is
  // allowed to see; otherwise fall back to the visible defaults.
  for (const fp of ORDER) {
    const a = [...(saved[fp] ?? [])].sort();
    const b = [...visible[fp]].sort();
    if (a.length !== b.length || a.some((x, i) => x !== b[i])) return visible;
  }
  return saved;
}

export default function DashboardView() {
  const { user } = useAuth();
  const { prefs, patch } = usePrefs();
  const isMobile = useIsMobile();
  const clock = useClock();
  const { setView } = useNav();
  const { courses, deadlines } = useDashboardData();
  const { items: grocery } = useGrocery();
  const { tasks, toggle } = useTasks();
  const [usage, setUsage] = useState<ClaudeUsage | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  // Weather location + tile arrangement live in synced prefs so they follow the
  // user across devices.
  const weatherLoc = (prefs.weatherLoc as WeatherLoc | null | undefined) ?? null;
  const [locPickerOpen, setLocPickerOpen] = useState(false);
  const isOwner = user?.role === "owner";
  const capsKey = (user?.capabilities ?? []).join(",");
  const visible = useMemo(
    () => visibleWidgets(user?.capabilities ?? [], isOwner),
    [capsKey, isOwner], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const savedArrangement = prefs.dashboard as Record<Footprint, WidgetId[]> | undefined;
  const savedKey = JSON.stringify(savedArrangement ?? null);
  const [arrangement, setArrangement] = useState<Record<Footprint, WidgetId[]>>(() => loadArrangement(savedArrangement, visible));
  const [dragFp, setDragFp] = useState<Footprint | null>(null);
  const dragRef = useRef<{ fp: Footprint; id: WidgetId } | null>(null);

  // Only the owner has the Claude-usage tile; skip the (403-ing) fetch for
  // others. Re-poll so server-side refreshes show up without a page reload.
  useEffect(() => {
    if (!isOwner) return;
    const load = () => api.claudeUsage().then(setUsage).catch(() => {});
    load();
    const iv = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(iv);
  }, [isOwner]);
  useEffect(() => {
    const load = () => api.weather(weatherLoc ?? undefined).then(setWeather).catch(() => {});
    load();
    const iv = setInterval(load, 15 * 60 * 1000); // refresh every 15 min
    return () => clearInterval(iv);
  }, [weatherLoc]);

  function changeWeatherLoc(loc: WeatherLoc | null) {
    patch({ weatherLoc: loc });
    setLocPickerOpen(false);
  }
  // Re-derive the arrangement when the allowed tiles change or synced prefs
  // arrive (e.g. from another device / first load).
  useEffect(() => setArrangement(loadArrangement(savedArrangement, visible)), [savedKey, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  function onDrop(fp: Footprint, targetId: WidgetId) {
    const src = dragRef.current;
    dragRef.current = null;
    setDragFp(null);
    if (!src || src.fp !== fp || src.id === targetId) return;
    const arr = [...arrangement[fp]];
    const i = arr.indexOf(src.id);
    const j = arr.indexOf(targetId);
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const next = { ...arrangement, [fp]: arr };
    setArrangement(next);
    patch({ dashboard: next });
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
              <span className="pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#1f7a4d" }} />Agent synced ·{" "}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLocPickerOpen(true); }}
                title="Change weather location"
                style={{ background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "underline", textUnderlineOffset: 2, textDecorationColor: "#100f1c66" }}
              >
                {weather?.label ?? "Collegedale, TN"}
                <i className="ph ph-caret-down" style={{ fontSize: 11 }} />
              </button>
            </div>
            {weather?.available ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                <i className={`ph ${weather.icon}`} style={{ fontSize: 26 }} />
                <span style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{weather.temp}°</span>
                <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.72 }}>{weather.text} · H {weather.high}° L {weather.low}°</span>
              </div>
            ) : (
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, opacity: 0.9, marginTop: 2 }}>Weather · soon</div>
            )}
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
        <div className="cc-planner-cols" style={{ flex: 1, display: "flex", gap: 14, minHeight: 0 }} onClick={(e) => e.stopPropagation()}>
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
    claude: ((): ReactNode => {
      const lim = usage?.limits;
      const barColor = (p: number) => (p >= 90 ? "var(--cc-bad)" : p >= 75 ? "var(--cc-warn)" : "var(--cc-accent)");
      const rows = [
        { label: "SESSION", entry: lim?.session, showReset: true },
        { label: "WEEK · ALL", entry: lim?.weekAll, showReset: true },
        { label: "WEEK · FABLE", entry: lim?.weekFable, showReset: false },
      ].filter((r) => r.entry || r.label !== "WEEK · FABLE"); // hide Fable if absent
      const updated = usage?.updatedAt
        ? new Date(usage.updatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
        : null;
      return (
        <div style={{ display: "flex", height: "100%", gap: 16, alignItems: "stretch", minHeight: 0 }}>
          {/* Left half: the mascot, big. */}
          <div style={{ flex: "0 0 42%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, minWidth: 0 }}>
            <ClaudeMark size={96} />
            <span className="cc-label" style={{ fontWeight: 500 }}>CLAUDE USAGE</span>
          </div>
          {/* Right half: the usage meters. */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
            {updated && (
              <div className="cc-label" style={{ textAlign: "right", marginBottom: -2 }}>updated {updated}</div>
            )}
            {!lim ? (
              <div style={{ color: "var(--cc-muted)", fontSize: 12.5, lineHeight: 1.5 }}>Waiting for the server to report your session &amp; weekly limits…</div>
            ) : (
              rows.map(({ label, entry, showReset }) => {
                const p = Math.max(0, Math.min(100, entry?.pct ?? 0));
                return (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                      <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".05em", color: "var(--cc-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {label}
                        {showReset && entry && <span style={{ color: "var(--cc-dim)" }}> · resets {entry.resets}</span>}
                      </span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: entry ? barColor(p) : "var(--cc-dim)" }}>{entry ? `${p}%` : "—"}</span>
                    </div>
                    <div style={{ height: 7, background: "#232739", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${p}%`, height: "100%", background: barColor(p), transition: "width .3s" }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    })(),
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
  }), [clock, firstName, weather, deadlines, courses, grocery, grocOutstanding, gradePct, gradeColor, gradeChip, topCourse, usage, todayItems, tomorrowItems, remToday, remTomorrow, openCount, now, tmr, todayStr, tomorrowStr, toggle]);

  return (
    <>
    <div className={isMobile ? "cc-grid-mobile" : "cc-grid"}>
      {ORDER.flatMap((fp) =>
        arrangement[fp].map((id, k) => {
          const m = META[id];
          const dropOk = dragFp === fp;
          // On mobile, drop the grid-span positioning (tiles just stack) and
          // give each a sensible min-height — the planner needs the most room.
          const mobileStyle: CSSProperties = { minHeight: fp === "big" ? 520 : fp === "wide" ? 150 : 168 };
          return (
            <div
              key={id}
              className={`cc-slot ${m.className ?? ""} ${dropOk ? "cc-drop-ok" : ""}`}
              style={isMobile ? { ...m.style, ...mobileStyle } : { ...m.style, ...SLOTS[fp][k] }}
              onClick={m.view ? () => setView(m.view!) : undefined}
              onDragOver={isMobile ? undefined : (e) => { if (dragFp === fp) e.preventDefault(); }}
              onDrop={isMobile ? undefined : () => onDrop(fp, id)}
            >
              {!isMobile && (
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
              )}
              {content[id]}
            </div>
          );
        }),
      )}
    </div>
    <WeatherLocationPicker open={locPickerOpen} onClose={() => setLocPickerOpen(false)} onPick={changeWeatherLoc} />
    </>
  );
}
