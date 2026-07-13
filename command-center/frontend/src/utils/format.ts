// Small date helpers for due dates. Kept framework-free so any component can
// use them.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Today" | "Tomorrow" | "Fri" (this week) | "Jul 22" (further out). */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const due = new Date(iso);
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) return DAYS[due.getDay()];
  return `${MONTHS[due.getMonth()]} ${due.getDate()}`;
}

/** "11:59 PM" */
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
