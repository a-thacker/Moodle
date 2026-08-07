// Quick-add flag registry + autocomplete helpers. Flags are the "-" (date /
// recurrence) and "#" (category) tokens parseTaskInput understands. The
// autocomplete surfaces them, ranked by how often you've used each (persisted
// in localStorage) with a sensible base order before any usage data.

export type Trigger = "-" | "#";

export interface FlagDef {
  trigger: Trigger;
  token: string; // inserted after the trigger, e.g. "today", "school"
  label: string;
  hint: string;
  priority: number; // base ordering (higher first) before usage kicks in
}

export const FLAGS: FlagDef[] = [
  // Kind ("-")
  { trigger: "-", token: "reminder", label: "Reminder", hint: "fires once · -r", priority: 88 },
  // Dates / recurrence ("-")
  { trigger: "-", token: "today", label: "Today", hint: "due today", priority: 100 },
  { trigger: "-", token: "tomorrow", label: "Tomorrow", hint: "due tomorrow", priority: 95 },
  { trigger: "-", token: "weekdays", label: "Weekdays", hint: "Mon–Fri this week", priority: 72 },
  { trigger: "-", token: "weekend", label: "Weekend", hint: "Sat & Sun this week", priority: 66 },
  { trigger: "-", token: "every", label: "Every day", hint: "all 7 days this week", priority: 60 },
  { trigger: "-", token: "monday", label: "Monday", hint: "this Monday", priority: 52 },
  { trigger: "-", token: "tuesday", label: "Tuesday", hint: "this Tuesday", priority: 51 },
  { trigger: "-", token: "wednesday", label: "Wednesday", hint: "this Wednesday", priority: 50 },
  { trigger: "-", token: "thursday", label: "Thursday", hint: "this Thursday", priority: 49 },
  { trigger: "-", token: "friday", label: "Friday", hint: "this Friday", priority: 48 },
  { trigger: "-", token: "saturday", label: "Saturday", hint: "this Saturday", priority: 47 },
  { trigger: "-", token: "sunday", label: "Sunday", hint: "this Sunday", priority: 46 },
  // Categories ("#")
  { trigger: "#", token: "school", label: "School", hint: "category", priority: 90 },
  { trigger: "#", token: "home", label: "Home", hint: "category", priority: 82 },
  { trigger: "#", token: "work", label: "Work", hint: "category", priority: 80 },
  { trigger: "#", token: "meeting", label: "Meeting", hint: "category", priority: 74 },
];

const USAGE_KEY = "cc:flagUsage";

function loadUsage(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(USAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

/** Record a flag pick so it ranks higher next time. */
export function bumpFlag(token: string): void {
  const u = loadUsage();
  u[token] = (u[token] || 0) + 1;
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(u));
  } catch {
    /* storage disabled — ranking just stays on the base order */
  }
}

/** Flags for a trigger, prefix-filtered, most-used first (then base order). */
export function suggestFlags(trigger: Trigger, partial: string, allow: Trigger[]): FlagDef[] {
  if (!allow.includes(trigger)) return [];
  const u = loadUsage();
  const p = partial.toLowerCase();
  return FLAGS.filter(
    (f) => f.trigger === trigger && (f.token.startsWith(p) || f.label.toLowerCase().startsWith(p)),
  ).sort(
    (a, b) => (u[b.token] || 0) - (u[a.token] || 0) || b.priority - a.priority || a.label.localeCompare(b.label),
  );
}

export interface ActiveFlag {
  trigger: Trigger;
  partial: string;
  start: number; // index of the trigger char
}

const WS = " \t\n";

/** The flag being typed at the caret, if any: a trigger char at a word boundary
 *  with no whitespace between it and the caret. */
export function activeFlag(text: string, caret: number, allow: Trigger[]): ActiveFlag | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i];
    if (WS.includes(ch)) return null;
    if (ch === "-" || ch === "#") {
      if (!allow.includes(ch)) return null;
      const boundary = i === 0 || WS.includes(text[i - 1]);
      return boundary ? { trigger: ch, partial: text.slice(i + 1, caret), start: i } : null;
    }
  }
  return null;
}

/** Replace the flag word at the caret with the chosen flag + a trailing space. */
export function applyCompletion(
  text: string,
  caret: number,
  start: number,
  flag: FlagDef,
): { value: string; caret: number } {
  let end = caret;
  while (end < text.length && !WS.includes(text[end])) end++;
  const insert = `${flag.trigger}${flag.token} `;
  return { value: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length };
}
