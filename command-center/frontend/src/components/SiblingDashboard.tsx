// A scaled-down shell for the "sibling" account: just Planner, Grades, and an
// OpenAI-backed Assistant — no grocery, scripts, eClass, or shared data. Fully
// self-contained (its own nav state, no NavContext) so the whole feature can be
// removed by deleting this file + its route in App.tsx.

import { useState } from "react";

import { useAuth } from "../auth/AuthContext.tsx";
import PlannerView from "./PlannerView.tsx";
import AssistantView from "./AssistantView.tsx";
import SettingsView from "./SettingsView.tsx";

type SibView = "planner" | "grades" | "assistant" | "settings";

const TOOLS: { icon: string; title: string; view: SibView }[] = [
  { icon: "ph-calendar-check", title: "Planner", view: "planner" },
  { icon: "ph-exam", title: "Grades", view: "grades" },
  { icon: "ph-sparkle", title: "Assistant", view: "assistant" },
];

function GradesPlaceholder() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 }}>
      <div style={{ maxWidth: 440, textAlign: "center", padding: 24 }}>
        <i className="ph ph-exam" style={{ fontSize: 34, color: "var(--cc-accent-soft)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "12px 0 6px" }}>Grades</h2>
        <p style={{ color: "var(--cc-muted)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Your grades aren't connected yet. This shows your own eClass once a sync
          is set up for your account — it never shows anyone else's.
        </p>
      </div>
    </div>
  );
}

export default function SiblingDashboard() {
  const { user, logout } = useAuth();
  const [view, setView] = useState<SibView>("planner");
  const name = user?.display_name ?? "?";

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", overflow: "hidden" }}>
      <nav style={{ width: 76, flexShrink: 0, background: "#0e0f16", borderRight: "1px solid #1b1e2c", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0", gap: 4 }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, border: "1px solid var(--cc-accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cc-accent)", marginBottom: 14 }}>
          <i className="ph-fill ph-command" style={{ fontSize: 20 }} />
        </div>

        {TOOLS.map((tool) => (
          <button
            key={tool.view}
            type="button"
            className={`rail-link${view === tool.view ? " active" : ""}`}
            title={tool.title}
            onClick={() => setView(tool.view)}
          >
            <i className={`ph ${tool.icon}`} style={{ fontSize: 22 }} />
          </button>
        ))}

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <button type="button" className={`rail-link${view === "settings" ? " active" : ""}`} title="Settings" onClick={() => setView("settings")}>
            <i className="ph ph-gear-six" style={{ fontSize: 20 }} />
          </button>
          <button type="button" className="rail-link" title="Sign out" onClick={logout}>
            <i className="ph ph-sign-out" style={{ fontSize: 20 }} />
          </button>
          <div title={`${name} · sibling`} style={{ width: 40, height: 40, borderRadius: "50%", background: "#2d2a55", color: "#c9c2f5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>
            {name.charAt(0)}
          </div>
        </div>
      </nav>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "22px 26px", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        {view === "planner" && <PlannerView />}
        {view === "grades" && <GradesPlaceholder />}
        {view === "assistant" && (
          <AssistantView
            subtitle="OpenAI · knows your planner and can add tasks"
            errorHint="Assistant unavailable — check the OpenAI key is set."
            suggestions={["What's on my plate today?", "Add study group tue/thu at 4pm", "Plan my week"]}
          />
        )}
        {view === "settings" && <SettingsView />}
      </div>
    </div>
  );
}
