// Domain types shared across the UI. These mirror what the FastAPI backend
// will return (see command-center/backend/app/models). Until those endpoints
// exist, components read the same shapes from src/data/sample.ts.

export type Role = "owner" | "roommate" | "sibling";

export interface Course {
  id: number;
  shortName: string;
  fullName: string;
  /** Course total as a percentage, or null when not yet graded. */
  totalPercent: number | null;
}

/** Moodle activity module → drives the Deadlines row icon. */
export type DeadlineModule = "assign" | "quiz" | "forum" | "other";

export interface Deadline {
  id: number;
  title: string;
  courseName: string;
  module: DeadlineModule;
  /** ISO 8601 timestamp. */
  due: string;
  overdue: boolean;
}

export type GradeEventKind = "graded" | "changed" | "feedback" | "synced";

export interface GradeEvent {
  id: number;
  kind: GradeEventKind;
  title: string;
  detail?: string;
}

export interface GroceryItem {
  id: number;
  name: string;
  quantity?: string;
  done: boolean;
  /** Initial of the profile that added it (avatar). */
  addedByInitial: string;
  /** True when added by the current viewer's counterpart (styling only). */
  addedByOwner: boolean;
}

export interface AgentStatus {
  sessionHealthy: boolean;
  lastRun: string;
  nextRun: string;
  notifyChannel: string;
}

export type TaskCategory = "school" | "meeting" | "home" | "work";

export interface Task {
  id: number;
  title: string;
  body: string | null;
  done: boolean;
  dueDate: string | null; // YYYY-MM-DD
  dueTime: string | null; // HH:MM:SS
  category: TaskCategory | null;
  position: number;
  createdAt: string;
  doneAt: string | null;
}

export interface Weather {
  available: boolean;
  label: string;
  temp?: number;
  feelsLike?: number;
  high?: number;
  low?: number;
  text?: string;
  icon?: string; // phosphor icon name, e.g. "ph-sun"
  isDay?: boolean;
}

// Laptop script runner: a script offered by the Mac, and a queued run of one.
export interface ScriptInfo {
  id: string;
  label: string;
  description: string;
}

export interface ScriptJob {
  id: number;
  script: string;
  args: string | null;
  status: "pending" | "running" | "done" | "failed";
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface TaskPatch {
  title?: string;
  body?: string | null;
  done?: boolean;
  due_date?: string | null;
  due_time?: string | null;
  category?: TaskCategory | null;
  position?: number;
}

export interface UsageBucket {
  tokens: number;
  io?: number; // input+output ("real work", excludes cache reads)
  costEst: number;
}

export interface ClaudeUsage {
  generatedAt?: string;
  updatedAt?: string;
  sessionResetsAt?: string | null;
  messages?: number;
  totals?: UsageBucket;
  today?: UsageBucket;
  week?: UsageBucket;
  byModel?: Record<string, UsageBucket>;
}
