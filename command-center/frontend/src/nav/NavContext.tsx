// Client-side navigation + command-palette state for the owner shell. No
// router library: the app is a single authenticated shell that swaps the main
// panel between a handful of views. ⌘K / Ctrl-K toggles the palette globally.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type View =
  | "dashboard"
  | "grades"
  | "deadlines"
  | "grocery"
  | "notes"
  | "scripts"
  | "settings";

interface NavState {
  view: View;
  setView: (view: View) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

const NavContext = createContext<NavState | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>("dashboard");
  const [paletteOpen, setPaletteOpen] = useState(false);

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
    <NavContext.Provider value={{ view, setView, paletteOpen, setPaletteOpen }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav(): NavState {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}
