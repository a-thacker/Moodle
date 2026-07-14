// Owner dashboard — the main app. Launcher rail + top bar + three flex
// columns of content-sized Nocturne cards that scroll as one page.
//
// Data is sample data for now (see src/data/sample.ts); each card takes it as
// props, so swapping to live API queries is a per-card change. Grocery is
// already wired to the API with a sample fallback.

import LauncherRail from "./LauncherRail.tsx";
import TopBar from "./TopBar.tsx";
import HeroCard from "./HeroCard.tsx";
import DeadlinesCard from "./DeadlinesCard.tsx";
import GradesCard from "./GradesCard.tsx";
import SyncAgentCard from "./SyncAgentCard.tsx";
import GroceryCard from "./GroceryCard.tsx";
import WhatChangedCard from "./WhatChangedCard.tsx";
import { useDashboardData } from "../hooks/useDashboardData";
import { sampleAgentStatus } from "../data/sample";

export default function OwnerDashboard() {
  // eClass data is live from the backend; the agent-status panel is still
  // sample data until an agent-status endpoint exists.
  const { courses, deadlines, gradeEvents } = useDashboardData();

  return (
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

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar agent={sampleAgentStatus} />

        <div
          style={{
            flex: 1,
            display: "flex",
            gap: "var(--space-6)",
            padding: "var(--space-8)",
            minHeight: 0,
            overflow: "auto",
          }}
        >
          <div className="bento-col" style={{ flex: 1.45 }}>
            <HeroCard deadlines={deadlines} gradeEvents={gradeEvents} />
            <DeadlinesCard deadlines={deadlines} />
          </div>

          <div className="bento-col" style={{ flex: 1 }}>
            <GradesCard courses={courses} />
            <SyncAgentCard agent={sampleAgentStatus} />
          </div>

          <div className="bento-col" style={{ flex: 1 }}>
            <GroceryCard />
            <WhatChangedCard events={gradeEvents} />
          </div>
        </div>
      </div>
    </div>
  );
}
