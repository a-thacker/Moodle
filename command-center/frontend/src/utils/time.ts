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
