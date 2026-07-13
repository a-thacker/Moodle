// Typed client for the FastAPI backend. The base URL is empty by default so
// requests are same-origin (the Vite dev proxy forwards /api to :8000, and in
// production the frontend is served behind the same reverse proxy). Override
// with VITE_API_BASE_URL when the API lives elsewhere.

import type { GroceryItem } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(`${init?.method ?? "GET"} ${path} → ${res.status}`, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// Endpoint wrappers. These are the seam: they exist now, the backend routes
// land in Phase 3. Grocery is first (it's the shared, interactive tool).
export const api = {
  health: () => apiFetch<{ status: string }>("/health"),

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
};
