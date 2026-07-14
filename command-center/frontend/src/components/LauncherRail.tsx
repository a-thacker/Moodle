// Left 62px launcher rail. Tools switch the main view; planned tools (Notes,
// Assistant) stay dimmed until their backends exist.

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
  { icon: "ph-terminal-window", title: "Scripts", view: "scripts" },
];

const PLANNED = [{ icon: "ph-sparkle", title: "Assistant — planned" }];

export default function LauncherRail() {
  const { user, logout } = useAuth();
  const { view, setView } = useNav();
  const name = user?.display_name ?? "?";

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

      {TOOLS.map((tool) => (
        <button
          key={tool.view}
          type="button"
          className={`rail-link${view === tool.view ? " active" : ""}`}
          title={tool.title}
          onClick={() => setView(tool.view)}
          style={{ background: "none", border: "none" }}
        >
          <i className={`ph ${tool.icon}`} style={{ fontSize: 22 }} />
        </button>
      ))}

      <div style={{ width: 28, height: 1, background: "#1b1e2c", margin: "8px 0" }} />

      {PLANNED.map((tool) => (
        <span key={tool.title} className="rail-link dim" title={tool.title} style={{ cursor: "default" }}>
          <i className={`ph ${tool.icon}`} style={{ fontSize: 22 }} />
        </span>
      ))}

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          className={`rail-link${view === "settings" ? " active" : ""}`}
          title="Settings"
          onClick={() => setView("settings")}
          style={{ background: "none", border: "none" }}
        >
          <i className="ph ph-gear-six" style={{ fontSize: 20 }} />
        </button>
        <button
          type="button"
          className="rail-link"
          title="Sign out"
          onClick={logout}
          style={{ background: "none", border: "none" }}
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
