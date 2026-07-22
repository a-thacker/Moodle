// Per-account UI preferences, synced to the backend so a user's layout follows
// them across every device they sign in on (sidebar tool order + which tools
// are hidden, dashboard tile arrangement, weather location).
//
// The server (`GET/PUT /api/v1/prefs`) is the source of truth; `/auth/me`
// already hands us the current blob, so we seed from `user.preferences`. Writes
// are optimistic + debounced. On a user's first load after this shipped, any
// layout they'd saved in this browser's localStorage is migrated up once so
// nothing is lost.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext.tsx";

export type Prefs = Record<string, unknown>;

interface PrefsState {
  prefs: Prefs;
  /** Shallow-merge a patch of top-level keys (a value of null clears that key). */
  patch: (partial: Prefs) => void;
}

const PrefsContext = createContext<PrefsState | null>(null);

function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Legacy per-browser localStorage keys → the new server-side pref keys. Read
// once to migrate a user who already had a layout here before prefs synced.
function legacyPrefs(userId: string): Prefs {
  const out: Prefs = {};
  const rail = readJSON(`cc_rail_${userId}`);
  if (Array.isArray(rail)) out.railOrder = rail;
  const hidden = readJSON(`cc_rail_hidden_${userId}`);
  if (Array.isArray(hidden)) out.hiddenTools = hidden;
  const dash = readJSON(`cc_dashboard_${userId}`);
  if (dash && typeof dash === "object") out.dashboard = dash;
  const wloc = readJSON("cc_weather_loc");
  if (wloc && typeof wloc === "object") out.weatherLoc = wloc;
  return out;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...(user?.preferences ?? {}) }));

  const pending = useRef<Prefs>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const migratedFor = useRef<string | null>(null);

  const flush = useCallback(() => {
    const toSend = pending.current;
    pending.current = {};
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (Object.keys(toSend).length === 0) return;
    api.prefs.update(toSend).catch(() => {});
  }, []);

  const patch = useCallback(
    (partial: Prefs) => {
      setPrefs((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(partial)) {
          if (v === null || v === undefined) delete next[k];
          else next[k] = v;
        }
        return next;
      });
      Object.assign(pending.current, partial);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 500);
    },
    [flush],
  );

  // Reseed from the server whenever the account changes, and migrate a legacy
  // localStorage layout up on first sight of an account with no server prefs.
  useEffect(() => {
    const id = user?.id;
    if (!id) return;
    const server = { ...(user?.preferences ?? {}) };
    setPrefs(server);
    pending.current = {};

    if (migratedFor.current === id) return;
    migratedFor.current = id;
    if (Object.keys(server).length > 0) return; // already synced before

    const legacy = legacyPrefs(id);
    if (Object.keys(legacy).length > 0) {
      setPrefs((prev) => ({ ...prev, ...legacy }));
      api.prefs.update(legacy).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Never lose a pending write on unmount / tab close.
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      flush();
    };
  }, [flush]);

  return <PrefsContext.Provider value={{ prefs, patch }}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsState {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used within PrefsProvider");
  return ctx;
}
