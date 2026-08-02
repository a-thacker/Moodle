// Calendar state backed by the API: the user's imported events plus their
// feed sources. A global "cc-calendar-changed" event keeps the planner overlay
// and the Settings feed-manager in sync after any mutation.
//
// `enabled` gates the fetch — the planner passes whether the user actually has
// the `calendar` capability, so a user without it never fires a 403 request.

import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../api/client";
import type { CalendarEvent, CalendarSource } from "../types";

const CALENDAR_CHANGED = "cc-calendar-changed";

export function notifyCalendarChanged(): void {
  window.dispatchEvent(new Event(CALENDAR_CHANGED));
}

// Fallback color per source kind when a source has no explicit color set.
const FALLBACK_COLOR: Record<string, string> = {
  eclass: "#7c9cff",
  ics: "#4ec9b0",
  manual: "#c9a26b",
};

// The day-keys (YYYY-MM-DD) an event covers, so a multi-day event shows on
// EVERY day it spans — not just its start. iCal all-day DTEND is exclusive
// (lands at midnight of the day after), so a trailing exact-midnight end
// doesn't add a phantom extra day. Capped so a runaway (e.g. term-long) event
// can't flood a view.
export function eventDays(ev: CalendarEvent): string[] {
  const startKey = ev.start.slice(0, 10);
  if (!ev.end) return [startKey];
  let end = new Date(ev.end);
  if (Number.isNaN(end.getTime())) return [startKey];
  if (ev.end.slice(11, 19) === "00:00:00") end = new Date(end.getTime() - 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const endKey = key(end);
  if (endKey <= startKey) return [startKey];
  const days: string[] = [];
  const cur = new Date(`${startKey}T00:00:00`);
  const last = new Date(`${endKey}T00:00:00`);
  for (let i = 0; cur <= last && i < 120; i++) {
    days.push(key(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export interface UseCalendar {
  events: CalendarEvent[];
  sources: CalendarSource[];
  loaded: boolean;
  refresh: () => void;
  /** Display color for an event, from its source (or a per-kind fallback). */
  colorFor: (ev: CalendarEvent) => string;
  addSource: (label: string, url: string, color?: string | null) => Promise<void>;
  updateSource: (
    id: number,
    patch: Partial<Pick<CalendarSource, "label" | "url" | "color" | "enabled">>,
  ) => Promise<void>;
  removeSource: (id: number) => Promise<void>;
  syncSource: (id: number) => Promise<void>;
}

export function useCalendarEvents(enabled = true): UseCalendar {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    if (!enabled) {
      setEvents([]);
      setSources([]);
      setLoaded(true);
      return;
    }
    Promise.all([api.calendar.events(), api.calendar.sources()])
      .then(([ev, src]) => {
        setEvents(ev);
        setSources(src);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [enabled]);

  useEffect(() => {
    refresh();
    window.addEventListener(CALENDAR_CHANGED, refresh);
    return () => window.removeEventListener(CALENDAR_CHANGED, refresh);
  }, [refresh]);

  const colorBySource = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of sources) if (s.color) m.set(s.id, s.color);
    return m;
  }, [sources]);

  const colorFor = useCallback(
    (ev: CalendarEvent) =>
      colorBySource.get(ev.sourceId) ?? FALLBACK_COLOR[ev.source] ?? FALLBACK_COLOR.eclass,
    [colorBySource],
  );

  const addSource = useCallback(async (label: string, url: string, color?: string | null) => {
    await api.calendar.addSource(label, url, color ?? null);
    notifyCalendarChanged();
  }, []);

  const updateSource = useCallback(
    async (id: number, patch: Partial<Pick<CalendarSource, "label" | "url" | "color" | "enabled">>) => {
      await api.calendar.updateSource(id, patch);
      notifyCalendarChanged();
    },
    [],
  );

  const removeSource = useCallback(async (id: number) => {
    await api.calendar.removeSource(id);
    notifyCalendarChanged();
  }, []);

  const syncSource = useCallback(async (id: number) => {
    await api.calendar.syncSource(id);
    notifyCalendarChanged();
  }, []);

  return { events, sources, loaded, refresh, colorFor, addSource, updateSource, removeSource, syncSource };
}
