// Client-side navigation + command-palette state for the app shell. No router
// library: the app is a single authenticated shell that swaps the main panel
// between a handful of views. Which views a user actually has is driven by
// their capabilities (see backend app/core/capabilities.py) — the rail, the
// palette, and `setView` all respect `available`. ⌘K / Ctrl-K toggles the
// palette globally.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type View =
  | "dashboard"
  | "grades"
  | "deadlines"
  | "grocery"
  | "notes"
  | "planner"
  | "scripts"
  | "assistant"
  | "settings";

// Canonical order; capability keys are 1:1 with view names.
const VIEW_ORDER: View[] = [
  "dashboard",
  "grades",
  "deadlines",
  "grocery",
  "notes",
  "planner",
  "scripts",
  "assistant",
  "settings",
];

interface NavState {
  view: View;
  setView: (view: View) => void;
  /** Views this user is entitled to, in canonical order (includes settings). */
  available: View[];
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

const NavContext = createContext<NavState | null>(null);

function landingView(available: View[]): View {
  // Land on the first real tool, not Settings.
  return available.find((v) => v !== "settings") ?? available[0] ?? "settings";
}

export function NavProvider({
  children,
  capabilities,
}: {
  children: ReactNode;
  capabilities: string[];
}) {
  const available = useMemo(
    () => VIEW_ORDER.filter((v) => capabilities.includes(v)),
    [capabilities],
  );
  const [view, setViewState] = useState<View>(() => landingView(available));
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Only navigate to a view the user is entitled to.
  const setView = useCallback(
    (next: View) => setViewState((prev) => (available.includes(next) ? next : prev)),
    [available],
  );

  // If the entitlement set changes out from under the current view, snap back.
  useEffect(() => {
    if (!available.includes(view)) setViewState(landingView(available));
  }, [available, view]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <NavContext.Provider
      value={{ view, setView, available, paletteOpen, setPaletteOpen }}
    >
      {children}
    </NavContext.Provider>
  );
}

export function useNav(): NavState {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}
