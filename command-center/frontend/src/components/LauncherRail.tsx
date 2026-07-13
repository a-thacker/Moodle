// Left 66px launcher rail. Active tool highlighted; planned tools (Notes,
// Scripts, Assistant) are dimmed until their backends exist.

import { OWNER_NAME } from "../data/sample";

interface RailTool {
  icon: string;
  title: string;
  active?: boolean;
  dim?: boolean;
}

const TOOLS: RailTool[] = [
  { icon: "ph-squares-four", title: "Dashboard", active: true },
  { icon: "ph-exam", title: "Grades" },
  { icon: "ph-calendar-dots", title: "Deadlines" },
  { icon: "ph-basket", title: "Grocery — shared" },
];

const PLANNED: RailTool[] = [
  { icon: "ph-note", title: "Notes — planned", dim: true },
  { icon: "ph-terminal-window", title: "Scripts — planned", dim: true },
  { icon: "ph-sparkle", title: "Assistant — planned", dim: true },
];

function RailLink({ tool }: { tool: RailTool }) {
  const cls = ["rail-link", tool.active ? "active" : "", tool.dim ? "dim" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <a href="#" className={cls} title={tool.title}>
      <i className={`ph ${tool.icon}`} style={{ fontSize: 21 }} />
    </a>
  );
}

export default function LauncherRail() {
  return (
    <nav
      style={{
        width: 66,
        flexShrink: 0,
        background: "var(--color-neutral-900)",
        borderRight: "1px solid var(--color-divider)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "16px 0",
        gap: 4,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--color-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-accent)",
          marginBottom: 14,
        }}
      >
        <i className="ph-fill ph-command" style={{ fontSize: 19 }} />
      </div>

      {TOOLS.map((tool) => (
        <RailLink key={tool.title} tool={tool} />
      ))}

      <div style={{ width: 26, height: 1, background: "var(--color-divider)", margin: "8px 0" }} />

      {PLANNED.map((tool) => (
        <RailLink key={tool.title} tool={tool} />
      ))}

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <a href="#" className="rail-link" title="Settings">
          <i className="ph ph-gear-six" style={{ fontSize: 20 }} />
        </a>
        <div
          title={`${OWNER_NAME} · owner`}
          style={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            background: "var(--color-accent-800)",
            color: "var(--color-accent-100)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-heading)",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {OWNER_NAME.charAt(0)}
        </div>
      </div>
    </nav>
  );
}
