// Left launcher rail. Tools switch the main view, and can be dragged to
// reorder — the arrangement is saved per user in localStorage (like the
// dashboard tiles). Which tools appear is driven by the user's capabilities
// (via NavContext `available`); Settings / sign-out / avatar stay pinned at the
// bottom.

import { useEffect, useState, type DragEvent } from "react";

import { useAuth } from "../auth/AuthContext.tsx";
import { useNav, type View } from "../nav/NavContext.tsx";

export interface RailTool {
  icon: string;
  title: string;
  view: View;
}

// The canonical tool list — shared with the Settings → Sidebar customizer.
export const RAIL_TOOLS: RailTool[] = [
  { icon: "ph-squares-four", title: "Dashboard", view: "dashboard" },
  { icon: "ph-exam", title: "Grades", view: "grades" },
  { icon: "ph-calendar-dots", title: "Deadlines", view: "deadlines" },
  { icon: "ph-basket", title: "Grocery — shared", view: "grocery" },
  { icon: "ph-note", title: "Notes & Tasks", view: "notes" },
  { icon: "ph-calendar-check", title: "Week planner", view: "planner" },
  { icon: "ph-terminal-window", title: "Scripts — on my Mac", view: "scripts" },
  { icon: "ph-film-reel", title: "Movie ripper", view: "rip" },
  { icon: "ph-sparkle", title: "Assistant", view: "assistant" },
];
const TOOLS = RAIL_TOOLS;
const BY_VIEW = new Map(TOOLS.map((t) => [t.view, t]));

// The rail's tools = the catalog above, limited to what this user can see
// (Settings is pinned separately, so it's excluded here).
function toolViews(available: View[]): View[] {
  return TOOLS.map((t) => t.view).filter((v) => available.includes(v));
}

function loadOrder(userId: string | undefined, allowed: View[]): View[] {
  try {
    const raw = localStorage.getItem(`cc_rail_${userId ?? "x"}`);
    if (!raw) return allowed;
    const saved = (JSON.parse(raw) as View[]).filter((v) => allowed.includes(v));
    // Append any tools added / newly granted since the order was saved.
    for (const v of allowed) if (!saved.includes(v)) saved.push(v);
    return saved;
  } catch {
    return allowed;
  }
}

export default function LauncherRail() {
  const { user, logout } = useAuth();
  const { view, setView, available, hidden } = useNav();
  const name = user?.display_name ?? "?";
  // Tools this user is entitled to, minus any they hid from the sidebar.
  const allowed = toolViews(available).filter((v) => !hidden.includes(v));
  const [order, setOrder] = useState<View[]>(() => loadOrder(user?.id, allowed));
  const [dragView, setDragView] = useState<View | null>(null);
  const [overView, setOverView] = useState<View | null>(null);

  const allowedKey = allowed.join(",");
  useEffect(() => setOrder(loadOrder(user?.id, allowed)), [user?.id, allowedKey]);
  useEffect(() => {
    if (user?.id) localStorage.setItem(`cc_rail_${user.id}`, JSON.stringify(order));
  }, [order, user?.id]);

  function onDrop(target: View) {
    const src = dragView;
    setDragView(null);
    setOverView(null);
    if (!src || src === target) return;
    setOrder((prev) => {
      const arr = prev.filter((v) => v !== src);
      arr.splice(arr.indexOf(target), 0, src); // insert before the target
      return arr;
    });
  }

  return (
    <nav
      style={{
        width: 76,
        flexShrink: 0,
        background: "#0e0f16",
        borderRight: "1px solid #1b1e2c",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 0",
        gap: 4,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 13,
          border: "1px solid var(--cc-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--cc-accent)",
          marginBottom: 14,
        }}
      >
        <i className="ph-fill ph-command" style={{ fontSize: 20 }} />
      </div>

      {order.map((v) => {
        const tool = BY_VIEW.get(v)!;
        return (
          <button
            key={v}
            type="button"
            draggable
            className={`rail-link${view === v ? " active" : ""}${overView === v ? " rail-over" : ""}`}
            title={`${tool.title}  ·  drag to reorder`}
            style={dragView === v ? { opacity: 0.4 } : undefined}
            onClick={() => setView(v)}
            onDragStart={(e: DragEvent) => { setDragView(v); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e: DragEvent) => { e.preventDefault(); if (dragView && dragView !== v) setOverView(v); }}
            onDragLeave={() => setOverView((o) => (o === v ? null : o))}
            onDrop={() => onDrop(v)}
            onDragEnd={() => { setDragView(null); setOverView(null); }}
          >
            <i className={`ph ${tool.icon}`} style={{ fontSize: 22 }} />
          </button>
        );
      })}

      {/* External services (Jellyfin, Wiki, …) — open in a new tab, gated per
          user via capabilities. Not reorderable; they sit below the tools. */}
      {(user?.links ?? []).map((link) => (
        <a
          key={link.key}
          className="rail-link"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${link.label}  ·  opens in a new tab`}
        >
          <i className={`ph ${link.icon}`} style={{ fontSize: 22 }} />
        </a>
      ))}

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          className={`rail-link${view === "settings" ? " active" : ""}`}
          title="Settings"
          onClick={() => setView("settings")}
        >
          <i className="ph ph-gear-six" style={{ fontSize: 20 }} />
        </button>
        <button
          type="button"
          className="rail-link"
          title="Sign out"
          onClick={logout}
        >
          <i className="ph ph-sign-out" style={{ fontSize: 20 }} />
        </button>
        <div
          title={`${name} · ${user?.role ?? "user"}`}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "#2d2a55",
            color: "#c9c2f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          {name.charAt(0)}
        </div>
      </div>
    </nav>
  );
}
