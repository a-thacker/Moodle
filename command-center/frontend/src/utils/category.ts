// Task categories drive the planner's colored stripe. A task's category is the
// one it was tagged with (via a "#home"/"#work"/… flag), else derived from its
// title. Keep this the single source of truth for both the dashboard and the
// planner.

import type { Task, TaskCategory } from "../types";

export const CAT_COLOR: Record<TaskCategory, string> = {
  school: "#e0654e",
  meeting: "#a99cf5",
  home: "#5fce9b",
  work: "#e0a84e",
};

export const CAT_LEGEND: [TaskCategory, string][] = [
  ["school", "SCHOOL"],
  ["meeting", "MEETING"],
  ["home", "HOME"],
  ["work", "WORK"],
];

export function categorize(title: string): TaskCategory {
  const t = title.toLowerCase();
  if (/\b(meeting|advisor|call|standup|check-?in|1:1|sync|interview|appt|appointment)\b/.test(t)) return "meeting";
  if (/\b(dinner|lunch|grocery|groceries|laundry|trash|cook|clean|dishes|apartment|home|rent)\b/.test(t)) return "home";
  if (/\b(shift|desk|work|clock|invoice|client)\b/.test(t)) return "work";
  return "school";
}

export function taskCategory(t: Task): TaskCategory {
  return t.category ?? categorize(t.title);
}

export function taskColor(t: Task): string {
  return CAT_COLOR[taskCategory(t)];
}
