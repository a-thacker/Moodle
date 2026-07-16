// Left launcher rail. Tools switch the main view, and can be dragged to
// reorder — the arrangement is saved per user in localStorage (like the
// dashboard tiles). Settings / sign-out / avatar stay pinned at the bottom.

import { useEffect, useState, type DragEvent } from "react";

import { useAuth } from "../auth/AuthContext.tsx";
import { useNav, type View } from "../nav/NavContext.tsx";

interface RailTool {
  icon: string;
  title: string;
  view: View;
}

const TOOLS: RailTool[] = [
  { icon: "ph-squares-four", title: "Dashboard", view: "dashboard" },
  { icon: "ph-exam", title: "Grades", view: "grades" },
  { icon: "ph-calendar-dots", title: "Deadlines", view: "deadlines" },
  { icon: "ph-basket", title: "Grocery — shared", view: "grocery" },
  { icon: "ph-note", title: "Notes & Tasks", view: "notes" },
  { icon: "ph-calendar-check", title: "Week planner", view: "planner" },
  { icon: "ph-terminal-window", title: "Scripts — on my Mac", view: "scripts" },
  { icon: "ph-sparkle", title: "Assistant", view: "assistant" },
];
const BY_VIEW = new Map(TOOLS.map((t) => [t.view, t]));

function loadOrder(userId: string | undefined): View[] {
  const known = TOOLS.map((t) => t.view);
  try {
    const raw = localStorage.getItem(`cc_rail_${userId ?? "x"}`);
    if (!raw) return known;
    const saved = (JSON.parse(raw) as View[]).filter((v) => BY_VIEW.has(v));
    // Append any tools added since the order was saved; drop unknown ones.
    for (const v of known) if (!saved.includes(v)) saved.push(v);
    return saved;
  } catch {
    return known;
  }
}

export default function LauncherRail() {
  const { user, logout } = useAuth();
  const { view, setView } = useNav();
  const name = user?.display_name ?? "?";
  const [order, setOrder] = useState<View[]>(() => loadOrder(user?.id));
  const [dragView, setDragView] = useState<View | null>(null);
  const [overView, setOverView] = useState<View | null>(null);

  useEffect(() => setOrder(loadOrder(user?.id)), [user?.id]);
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
          title={`${name} · owner`}
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
