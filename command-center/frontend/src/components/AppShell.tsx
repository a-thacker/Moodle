// The single app shell for every authenticated user: launcher rail + top bar +
// the active view + command palette. What each person sees is driven entirely
// by their capabilities (see backend app/core/capabilities.py) — there's no
// per-role component anymore. NavProvider gets the user's capabilities so the
// rail, palette, and navigation all stay in sync.

import { NavProvider, useNav } from "../nav/NavContext.tsx";
import { PrefsProvider } from "../prefs/PrefsContext.tsx";
import { useAuth } from "../auth/AuthContext.tsx";
import { useIsMobile } from "../hooks/useMediaQuery";
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
import CalendarView from "./CalendarView.tsx";
import AssistantView from "./AssistantView.tsx";
import ScriptsView from "./ScriptsView.tsx";
import RipView from "./RipView.tsx";
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
  const { courses, deadlines, loading } = useDashboardData();
  const isOwner = user?.role === "owner";

  switch (view) {
    case "grades":
      return (
        <FocusView
          title="Grades"
          icon="ph-exam"
          meta={isOwner ? (loading ? "Loading…" : `S26 · ${courses.length} course${courses.length === 1 ? "" : "s"}`) : undefined}
        >
          {isOwner ? <GradesCard courses={courses} loading={loading} /> : <GradesPlaceholder />}
        </FocusView>
      );
    case "deadlines":
      return (
        <FocusView title="Deadlines" icon="ph-calendar-dots" meta="from the eClass timeline">
          <DeadlinesCard deadlines={deadlines} loading={loading} />
        </FocusView>
      );
    case "grocery":
      return (
        <FocusView title="Grocery" icon="ph-basket" meta="Shared list">
          <GroceryCard />
        </FocusView>
      );
    case "notes":
      return <NotesView />;
    case "planner":
      return <PlannerView />;
    case "calendar":
      return <CalendarView />;
    case "assistant":
      return <AssistantView />;
    case "scripts":
      return <ScriptsView />;
    case "rip":
      return <RipView />;
    case "settings":
      return <SettingsView />;
    default:
      return <DashboardView />;
  }
}

function Shell() {
  const isMobile = useIsMobile();

  // Desktop: vertical rail on the left. Mobile: a horizontal bar pinned to the
  // bottom (thumb reach), content stacked above it.
  return (
    <div
      style={{
        // Pin to all four viewport edges. On an iOS standalone PWA, `100dvh`
        // can resolve shorter than the real screen, leaving a strip of
        // background below the app (the "bars float too high" bug); fixed +
        // inset:0 glues the shell — and the bottom rail — to the true edges.
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        fontFamily: "var(--font-body)",
        overflow: "hidden",
      }}
    >
      {!isMobile && <LauncherRail />}
      {/* Safe-area padding so a standalone launch doesn't hide content under the
          status bar / notch (top) or the home indicator (bottom). Padding
          tightens on mobile so the UI isn't cramped. */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          // On mobile the command bar + rail hug the very bottom: no bottom
          // padding here, so the content column runs straight into them (the
          // rail carries the home-indicator safe-area inset itself).
          padding: isMobile
            ? "calc(12px + env(safe-area-inset-top)) calc(12px + env(safe-area-inset-right)) 0 calc(12px + env(safe-area-inset-left))"
            : "calc(22px + env(safe-area-inset-top)) calc(26px + env(safe-area-inset-right)) calc(22px + env(safe-area-inset-bottom)) 26px",
          gap: isMobile ? 8 : 16,
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {/* Contained so no view can overflow onto (and cover) the command bar. */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <ActiveView />
        </div>
        <CommandBar />
      </div>
      {isMobile && <LauncherRail orientation="horizontal" />}
      <CommandPalette />
    </div>
  );
}

export default function AppShell() {
  const { user } = useAuth();

  return (
    <PrefsProvider>
      <NavProvider capabilities={user?.capabilities ?? []}>
        <Shell />
      </NavProvider>
    </PrefsProvider>
  );
}
