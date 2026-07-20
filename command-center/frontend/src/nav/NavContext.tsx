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
  | "rip"
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
  "rip",
  "assistant",
  "settings",
];

interface NavState {
  view: View;
  setView: (view: View) => void;
  /** Views this user is entitled to, in canonical order (includes settings). */
  available: View[];
  /** Tools the user chose to hide from the sidebar (still reachable via ⌘K). */
  hidden: View[];
  toggleHidden: (view: View) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

const NavContext = createContext<NavState | null>(null);

// Settings is pinned in the rail (not part of the customizable tool list), so
// it can never be hidden.
const NEVER_HIDE: View[] = ["settings"];

function landingView(available: View[], hidden: View[]): View {
  // Land on the first visible real tool, not Settings.
  return (
    available.find((v) => v !== "settings" && !hidden.includes(v)) ??
    available.find((v) => v !== "settings") ??
    available[0] ??
    "settings"
  );
}

function loadHidden(userId: string | undefined): View[] {
  try {
    const raw = localStorage.getItem(`cc_rail_hidden_${userId ?? "x"}`);
    if (!raw) return [];
    return (JSON.parse(raw) as View[]).filter((v) => !NEVER_HIDE.includes(v));
  } catch {
    return [];
  }
}

export function NavProvider({
  children,
  capabilities,
  userId,
}: {
  children: ReactNode;
  capabilities: string[];
  userId?: string;
}) {
  const available = useMemo(
    () => VIEW_ORDER.filter((v) => capabilities.includes(v)),
    [capabilities],
  );
  const [hidden, setHidden] = useState<View[]>(() => loadHidden(userId));
  const [view, setViewState] = useState<View>(() => landingView(available, hidden));
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Reload the hidden set when the user changes; persist it on change.
  useEffect(() => setHidden(loadHidden(userId)), [userId]);
  useEffect(() => {
    if (userId) localStorage.setItem(`cc_rail_hidden_${userId}`, JSON.stringify(hidden));
  }, [hidden, userId]);

  const toggleHidden = useCallback((v: View) => {
    if (NEVER_HIDE.includes(v)) return;
    setHidden((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }, []);

  // Only navigate to a view the user is entitled to.
  const setView = useCallback(
    (next: View) => setViewState((prev) => (available.includes(next) ? next : prev)),
    [available],
  );

  // If the entitlement set changes out from under the current view, snap back.
  useEffect(() => {
    if (!available.includes(view)) setViewState(landingView(available, hidden));
  }, [available, view, hidden]);

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
      value={{ view, setView, available, hidden, toggleHidden, paletteOpen, setPaletteOpen }}
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
