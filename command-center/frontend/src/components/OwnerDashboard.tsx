// Owner shell: launcher rail + top bar + the active view + command palette.
// Navigation state lives in NavProvider; the rail and palette switch `view`.

import { NavProvider, useNav } from "../nav/NavContext.tsx";
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
import ScriptsView from "./ScriptsView.tsx";
import SettingsView from "./SettingsView.tsx";
import { useDashboardData } from "../hooks/useDashboardData";

function ActiveView() {
  const { view } = useNav();
  const { courses, deadlines } = useDashboardData();

  switch (view) {
    case "grades":
      return (
        <FocusView title="Grades">
          <GradesCard courses={courses} />
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
    case "scripts":
      return <ScriptsView />;
    case "settings":
      return <SettingsView />;
    default:
      return <DashboardView />;
  }
}

export default function OwnerDashboard() {
  return (
    <NavProvider>
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
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "22px 26px", gap: 16, minWidth: 0 }}>
          <ActiveView />
          <CommandBar />
        </div>
        <CommandPalette />
      </div>
    </NavProvider>
  );
}
