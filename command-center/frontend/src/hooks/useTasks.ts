// Tasks state backed by the API. Optimistic toggle/remove, reload after
// mutations. A global "cc-tasks-changed" event keeps every view in sync — so
// a task added from the omni-bar shows up in Notes/Planner without a refresh.

import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client";
import type { Task, TaskPatch } from "../types";

const TASKS_CHANGED = "cc-tasks-changed";

export function notifyTasksChanged(): void {
  window.dispatchEvent(new Event(TASKS_CHANGED));
}

export interface UseTasks {
  tasks: Task[];
  loaded: boolean;
  refresh: () => void;
  add: (title: string, dueDate?: string | null, dueTime?: string | null) => void;
  toggle: (task: Task) => void;
  remove: (id: number) => void;
  patch: (id: number, patch: TaskPatch) => Promise<void>;
}

export function useTasks(): UseTasks {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    api.tasks
      .list()
      .then((rows) => {
        setTasks(rows);
        setLoaded(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(TASKS_CHANGED, refresh);
    return () => window.removeEventListener(TASKS_CHANGED, refresh);
  }, [refresh]);

  const add = useCallback((title: string, dueDate?: string | null, dueTime?: string | null) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    api.tasks.add(trimmed, dueDate ?? null, dueTime ?? null).then(notifyTasksChanged).catch(() => {});
  }, []);

  const toggle = useCallback((task: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    api.tasks.update(task.id, { done: !task.done }).then(notifyTasksChanged).catch(() => {});
  }, []);

  const remove = useCallback((id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    api.tasks.remove(id).then(notifyTasksChanged).catch(() => {});
  }, []);

  const patch = useCallback(async (id: number, p: TaskPatch) => {
    await api.tasks.update(id, p);
    notifyTasksChanged();
  }, []);

  return { tasks, loaded, refresh, add, toggle, remove, patch };
}
