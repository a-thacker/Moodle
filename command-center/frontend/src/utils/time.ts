// Extract a time like "-2pm", "@2pm", "2:30pm", "14:00" from a quick-add
// string, and format a stored time ("HH:MM:SS") for display.

const TIME_12 = /(?:^|[\s@\-])(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
const TIME_24 = /(?:^|[\s@\-])(\d{1,2}):(\d{2})\b/;

export function extractTime(text: string): { title: string; time: string | null } {
  let m = text.match(TIME_12);
  if (m) {
    let hour = Number(m[1]) % 12;
    if (m[3].toLowerCase() === "pm") hour += 12;
    const min = m[2] ? Number(m[2]) : 0;
    const time = `${String(hour % 24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    return { title: (text.slice(0, m.index) + text.slice(m.index! + m[0].length)).replace(/\s{2,}/g, " ").trim(), time };
  }
  m = text.match(TIME_24);
  if (m) {
    const hour = Number(m[1]);
    const min = Number(m[2]);
    if (hour < 24 && min < 60) {
      const time = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      return { title: (text.slice(0, m.index) + text.slice(m.index! + m[0].length)).replace(/\s{2,}/g, " ").trim(), time };
    }
  }
  return { title: text.trim(), time: null };
}

export function fmtTime(time: string | null): string | null {
  if (!time) return null;
  const [h, min] = time.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return min ? `${h12}:${String(min).padStart(2, "0")} ${ampm}` : `${h12} ${ampm}`;
}

// --- Flag parsing for quick-add ("-" flags) ------------------------------
// Time: -1:17, -2pm, -6am, -14:00 ; day flags: -e (every day), -wd (Mon–Fri),
// -we (weekend), and single days -su -m -t -w -th -f -sa (repeatable).

const DAY_FLAG: Record<string, number> = {
  sunday: 0, sun: 0, su: 0,
  monday: 1, mon: 1, m: 1,
  tuesday: 2, tues: 2, tue: 2, t: 2,
  wednesday: 3, wed: 3, w: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4, th: 4,
  friday: 5, fri: 5, f: 5,
  saturday: 6, sat: 6, sa: 6,
};
// Longest alternatives first so "-th" beats "-t", "-sat" beats "-sa", etc.
const FLAG_RE =
  /(?:^|\s)-(every|weekdays|weekend|sunday|saturday|thursday|wednesday|tuesday|monday|friday|thurs|thur|tues|sun|sat|mon|tue|wed|thu|fri|wd|we|su|sa|th|e|m|t|w|f)(?=\s|$)/gi;

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekDates(): Date[] {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const s = new Date(d);
  s.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(s);
    x.setDate(s.getDate() + i);
    return x;
  });
}

export function parseTaskInput(text: string): { title: string; time: string | null; dates: string[] } {
  const t = extractTime(text);
  const days = new Set<number>();
  let every = false;
  let weekdays = false;
  let weekend = false;
  const title = t.title
    .replace(FLAG_RE, (_m, g: string) => {
      const f = g.toLowerCase();
      if (f === "every" || f === "e") every = true;
      else if (f === "weekdays" || f === "wd") weekdays = true;
      else if (f === "weekend" || f === "we") weekend = true;
      else if (f in DAY_FLAG) days.add(DAY_FLAG[f]);
      return " ";
    })
    .replace(/\s{2,}/g, " ")
    .trim();

  const picked = every
    ? [0, 1, 2, 3, 4, 5, 6]
    : weekdays
      ? [1, 2, 3, 4, 5]
      : weekend
        ? [0, 6]
        : [...days];
  const dates = weekDates().filter((d) => picked.includes(d.getDay())).map(ymdLocal);
  return { title, time: t.time, dates };
}
