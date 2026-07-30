// Launcher rail. Tools switch the main view and can be dragged to reorder — the
// arrangement is saved in the user's synced preferences (so it follows them to
// any device), like which tools are hidden and the dashboard layout. Which
// tools appear is driven by the user's capabilities (via NavContext
// `available`); Settings / sign-out / avatar stay pinned at the end.
//
// Two orientations: a vertical rail on the left (desktop) and a horizontal bar
// pinned to the bottom (mobile). Drag-to-reorder is desktop-only — touch drag
// is unreliable and the bar scrolls horizontally instead.

import { useMemo, useState, type CSSProperties, type DragEvent } from "react";

import { useAuth } from "../auth/AuthContext.tsx";
import { usePrefs } from "../prefs/PrefsContext.tsx";
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
  { icon: "ph-notebook", title: "Notes — Obsidian", view: "notes" },
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

// Apply a saved order to the currently-allowed tools: keep the saved sequence,
// drop anything no longer allowed, and append newly-granted tools at the end.
function mergeOrder(saved: View[] | undefined, allowed: View[]): View[] {
  if (!saved) return allowed;
  const filtered = saved.filter((v) => allowed.includes(v));
  for (const v of allowed) if (!filtered.includes(v)) filtered.push(v);
  return filtered;
}

export default function LauncherRail({
  orientation = "vertical",
}: {
  orientation?: "vertical" | "horizontal";
}) {
  const { user, logout } = useAuth();
  const { prefs, patch } = usePrefs();
  const { view, setView, available, hidden } = useNav();
  const name = user?.display_name ?? "?";
  const horizontal = orientation === "horizontal";

  // Tools this user is entitled to, minus any they hid from the sidebar.
  const allowed = toolViews(available).filter((v) => !hidden.includes(v));
  const allowedKey = allowed.join(",");
  // Order comes from synced prefs so it ports across machines.
  const order = useMemo(
    () => mergeOrder(prefs.railOrder as View[] | undefined, allowed),
    [prefs.railOrder, allowedKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [dragView, setDragView] = useState<View | null>(null);
  const [overView, setOverView] = useState<View | null>(null);

  function onDrop(target: View) {
    const src = dragView;
    setDragView(null);
    setOverView(null);
    if (!src || src === target) return;
    const arr = order.filter((v) => v !== src);
    arr.splice(arr.indexOf(target), 0, src); // insert before the target
    patch({ railOrder: arr });
  }

  const navStyle: CSSProperties = horizontal
    ? {
        width: "100%",
        flexShrink: 0,
        background: "#0e0f16",
        borderTop: "1px solid #1b1e2c",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        padding: "8px 10px calc(8px + env(safe-area-inset-bottom))",
        overflowX: "auto",
      }
    : {
        width: 76,
        flexShrink: 0,
        background: "#0e0f16",
        borderRight: "1px solid #1b1e2c",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding:
          "calc(20px + env(safe-area-inset-top)) 0 calc(20px + env(safe-area-inset-bottom))",
        paddingLeft: "env(safe-area-inset-left)",
        gap: 4,
      };

  return (
    <nav style={navStyle}>
      {!horizontal && (
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
      )}

      {order.map((v) => {
        const tool = BY_VIEW.get(v)!;
        return (
          <button
            key={v}
            type="button"
            draggable={!horizontal}
            className={`rail-link${view === v ? " active" : ""}${overView === v ? " rail-over" : ""}`}
            title={horizontal ? tool.title : `${tool.title}  ·  drag to reorder`}
            style={{ flexShrink: 0, ...(dragView === v ? { opacity: 0.4 } : undefined) }}
            onClick={() => setView(v)}
            onDragStart={horizontal ? undefined : (e: DragEvent) => { setDragView(v); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={horizontal ? undefined : (e: DragEvent) => { e.preventDefault(); if (dragView && dragView !== v) setOverView(v); }}
            onDragLeave={horizontal ? undefined : () => setOverView((o) => (o === v ? null : o))}
            onDrop={horizontal ? undefined : () => onDrop(v)}
            onDragEnd={horizontal ? undefined : () => { setDragView(null); setOverView(null); }}
          >
            <i className={`ph ${tool.icon}`} style={{ fontSize: 22 }} />
          </button>
        );
      })}

      {/* External services (Jellyfin, Wiki, …) — open in a new tab, gated per
          user via capabilities. Not reorderable; they sit after the tools. */}
      {(user?.links ?? []).map((link) => (
        <a
          key={link.key}
          className="rail-link"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${link.label}  ·  opens in a new tab`}
          style={{ flexShrink: 0 }}
        >
          <i className={`ph ${link.icon}`} style={{ fontSize: 22 }} />
        </a>
      ))}

      <div
        style={
          horizontal
            ? { marginLeft: "auto", display: "flex", flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }
            : { marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }
        }
      >
        <button
          type="button"
          className={`rail-link${view === "settings" ? " active" : ""}`}
          title="Settings"
          style={{ flexShrink: 0 }}
          onClick={() => setView("settings")}
        >
          <i className="ph ph-gear-six" style={{ fontSize: 20 }} />
        </button>
        <button
          type="button"
          className="rail-link"
          title="Sign out"
          style={{ flexShrink: 0 }}
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
            flexShrink: 0,
          }}
        >
          {name.charAt(0)}
        </div>
      </div>
    </nav>
  );
}
