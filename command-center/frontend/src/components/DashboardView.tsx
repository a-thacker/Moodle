// The default view: the three-column bento of cards.

import HeroCard from "./HeroCard.tsx";
import DeadlinesCard from "./DeadlinesCard.tsx";
import GradesCard from "./GradesCard.tsx";
import SyncAgentCard from "./SyncAgentCard.tsx";
import GroceryCard from "./GroceryCard.tsx";
import WhatChangedCard from "./WhatChangedCard.tsx";
import { useDashboardData } from "../hooks/useDashboardData";
import { sampleAgentStatus } from "../data/sample";

export default function DashboardView() {
  const { courses, deadlines, gradeEvents } = useDashboardData();

  return (
    <div style={{ flex: 1, display: "flex", gap: "var(--space-6)", padding: "var(--space-8)", minHeight: 0, overflow: "auto" }}>
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
  );
}
