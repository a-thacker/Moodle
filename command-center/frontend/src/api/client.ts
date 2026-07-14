// Typed client for the FastAPI backend. Same-origin by default (nginx proxies
// /api to the backend; the Vite dev server proxies it too), so API_BASE is
// usually empty. The bearer token is stored in localStorage and attached to
// every request; a 401 on a normal request broadcasts `cc-unauthorized` so the
// auth layer can log the user out.

import type {
  Course,
  Deadline,
  GradeEvent,
  GroceryItem,
  RunResult,
  ScriptInfo,
  Task,
  TaskPatch,
} from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "cc_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface FetchOptions extends RequestInit {
  /** Skip the global 401 → logout broadcast (used by the login call). */
  silent401?: boolean;
}

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { silent401, headers, ...init } = opts;
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
    ...init,
  });
  if (res.status === 401 && !silent401) {
    window.dispatchEvent(new Event("cc-unauthorized"));
  }
  if (!res.ok) {
    throw new ApiError(`${init.method ?? "GET"} ${path} → ${res.status}`, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface CurrentUser {
  id: string;
  email: string;
  display_name: string;
  role: "owner" | "roommate";
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      apiFetch<{ access_token: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        silent401: true,
      }),
    me: () => apiFetch<CurrentUser>("/api/v1/auth/me"),
    changePassword: (current_password: string, new_password: string) =>
      apiFetch<void>("/api/v1/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password, new_password }),
      }),
  },

  scripts: {
    list: () => apiFetch<ScriptInfo[]>("/api/v1/scripts"),
    run: (body: { script_id?: string; command?: string }) =>
      apiFetch<RunResult>("/api/v1/scripts/run", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  grocery: {
    list: () => apiFetch<GroceryItem[]>("/api/v1/grocery"),
    add: (name: string, quantity?: string) =>
      apiFetch<GroceryItem>("/api/v1/grocery", {
        method: "POST",
        body: JSON.stringify({ name, quantity }),
      }),
    setDone: (id: number, done: boolean) =>
      apiFetch<GroceryItem>(`/api/v1/grocery/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ done }),
      }),
  },

  tasks: {
    list: () => apiFetch<Task[]>("/api/v1/tasks"),
    add: (title: string, dueDate?: string | null) =>
      apiFetch<Task>("/api/v1/tasks", {
        method: "POST",
        body: JSON.stringify({ title, due_date: dueDate ?? null }),
      }),
    update: (id: number, patch: TaskPatch) =>
      apiFetch<Task>(`/api/v1/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    remove: (id: number) =>
      apiFetch<void>(`/api/v1/tasks/${id}`, { method: "DELETE" }),
  },

  // eClass reads (owner only).
  courses: () => apiFetch<Course[]>("/api/v1/courses"),
  deadlines: () => apiFetch<Deadline[]>("/api/v1/deadlines"),
  gradeEvents: () => apiFetch<GradeEvent[]>("/api/v1/grade-events"),
};
