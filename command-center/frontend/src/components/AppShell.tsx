// The single app shell for every authenticated user: launcher rail + top bar +
// the active view + command palette. What each person sees is driven entirely
// by their capabilities (see backend app/core/capabilities.py) — there's no
// per-role component anymore. NavProvider gets the user's capabilities so the
// rail, palette, and navigation all stay in sync.

import { NavProvider, useNav } from "../nav/NavContext.tsx";
import { useAuth } from "../auth/AuthContext.tsx";
import LauncherRail from "./LauncherRail.tsx";
import CommandBar from "./CommandBar.tsx";
import CommandPalette from "./CommandPalette.tsx";
import DashboardView from "./DashboardView.tsx";
import FocusView from "./FocusView.tsx";
import GradesCard from "./GradesCard.tsx";
import DeadlinesCard from "./DeadlinesCard.tsx";
import GroceryCard from "./GroceryCard.tsx";
import NotesView from "./NotesView.tsx";
import PlannerView from "./PlannerView.tsx";
import AssistantView from "./AssistantView.tsx";
import ScriptsView from "./ScriptsView.tsx";
import SettingsView from "./SettingsView.tsx";
import { useDashboardData } from "../hooks/useDashboardData";

// Shown for a grades view when the account has no synced eClass data of its own
// (every account except the owner, until per-user sync exists).
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

function ActiveView() {
  const { view } = useNav();
  const { user } = useAuth();
  const { courses, deadlines } = useDashboardData();
  const isOwner = user?.role === "owner";

  switch (view) {
    case "grades":
      return (
        <FocusView title="Grades">
          {isOwner ? <GradesCard courses={courses} /> : <GradesPlaceholder />}
        </FocusView>
      );
    case "deadlines":
      return (
        <FocusView title="Deadlines">
          <DeadlinesCard deadlines={deadlines} />
        </FocusView>
      );
    case "grocery":
      return (
        <FocusView title="Grocery">
          <GroceryCard />
        </FocusView>
      );
    case "notes":
      return <NotesView />;
    case "planner":
      return <PlannerView />;
    case "assistant":
      return <AssistantView />;
    case "scripts":
      return <ScriptsView />;
    case "settings":
      return <SettingsView />;
    default:
      return <DashboardView />;
  }
}

export default function AppShell() {
  const { user } = useAuth();

  return (
    <NavProvider capabilities={user?.capabilities ?? []}>
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          background: "var(--color-bg)",
          color: "var(--color-text)",
          fontFamily: "var(--font-body)",
          overflow: "hidden",
        }}
      >
        <LauncherRail />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "22px 26px", gap: 16, minWidth: 0, minHeight: 0 }}>
          {/* Contained so no view can overflow onto (and cover) the command bar. */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <ActiveView />
          </div>
          <CommandBar />
        </div>
        <CommandPalette />
      </div>
    </NavProvider>
  );
}
