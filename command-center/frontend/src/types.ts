// Domain types shared across the UI. These mirror what the FastAPI backend
// will return (see command-center/backend/app/models). Until those endpoints
// exist, components read the same shapes from src/data/sample.ts.

// Roles are just admin vs. everyone-else now; access is per-user capabilities.
export type Role = "owner" | "user";

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
  projectId: number | null;
  createdAt: string;
  doneAt: string | null;
}

// A project groups tasks under a goal; progress is derived from its tasks.
export type ProjectStatus = "active" | "done" | "archived";

export interface Project {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  status: ProjectStatus;
  position: number;
  createdAt: string;
  doneAt: string | null;
  taskCount: number;
  doneCount: number;
}

// Calendar -----------------------------------------------------------------
// A read-only event imported from a source (school eClass feed, or a Google/
// Apple .ics feed). Mirrored into the CC calendar; never edited here.
export interface CalendarEvent {
  id: number;
  sourceId: number;
  source: "eclass" | "ics" | "manual";
  title: string;
  description: string | null;
  location: string | null;
  url: string | null;
  /** ISO 8601 (naive local); date-only semantics when allDay. */
  start: string;
  end: string | null;
  allDay: boolean;
  courseName: string | null;
}

// A configured calendar feed for a user: the agent-fed "eclass" source, or a
// read-only "ics" URL (Google "secret iCal address" / Apple public calendar).
export interface CalendarSource {
  id: number;
  kind: "eclass" | "ics";
  label: string;
  color: string | null;
  url: string | null;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastSyncOk: boolean | null;
  lastSyncError: string | null;
  eventCount: number;
  createdAt: string;
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

export interface RipJob {
  id: number;
  title: string;
  media_type: "movie" | "tv" | string;
  extras: "extras" | "keep" | "delete";
  show_name: string | null;
  season: number | null;
  start_episode: number | null;
  episode_count: number | null;
  status: "pending" | "running" | "done" | "failed";
  progress: string | null;
  exit_code: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface RipRequest {
  media_type: "movie" | "tv";
  title?: string;
  extras?: "extras" | "keep" | "delete";
  show?: string;
  season?: number;
  start_episode?: number;
  episode_count?: number;
}

export interface TaskPatch {
  title?: string;
  body?: string | null;
  done?: boolean;
  due_date?: string | null;
  due_time?: string | null;
  category?: TaskCategory | null;
  position?: number;
  project_id?: number | null; // negative or null clears the project
}

export interface UsageBucket {
  tokens: number;
  io?: number; // input+output ("real work", excludes cache reads)
  costEst: number;
}

export interface SessionUsage {
  io: number;
  tokens: number;
  costEst: number;
  startsAt?: string | null;
  resetsAt?: string | null;
}

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  io: number;
  costEst: number;
}

export interface UsageLimit {
  pct: number;
  resets: string; // human string from /usage, e.g. "Jul 15 at 11:09pm"
}

export interface UsageLimits {
  session?: UsageLimit;
  weekAll?: UsageLimit;
  weekFable?: UsageLimit;
  fetchedAt?: string;
}

// Obsidian vault hub -------------------------------------------------------
export interface Vault {
  id: number;
  name: string;
  git_url: string;
  branch: string;
  subpath: string;
  ai_readable: boolean;
  last_synced_at: string | null;
  last_sync_ok: boolean | null;
  last_sync_error: string | null;
  note_count: number;
  created_at: string;
}

export interface NoteMeta {
  path: string;
  title: string;
  size: number;
  modified: string;
}

export interface NoteContent {
  path: string;
  markdown: string;
}

export interface ClaudeUsage {
  generatedAt?: string;
  updatedAt?: string;
  sessionResetsAt?: string | null;
  limits?: UsageLimits;
  session?: SessionUsage;
  daily?: DailyUsage[];
  messages?: number;
  totals?: UsageBucket;
  today?: UsageBucket;
  week?: UsageBucket;
  byModel?: Record<string, UsageBucket>;
}
