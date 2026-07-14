// Tasks state backed by the API. Optimistic toggle/remove, reload after
// mutations so the ordering (open first, by due date) stays correct.

import { useEffect, useState } from "react";

import { api } from "../api/client";
import type { Task } from "../types";

export interface UseTasks {
  tasks: Task[];
  loaded: boolean;
  add: (title: string, dueDate?: string | null) => void;
  toggle: (task: Task) => void;
  remove: (id: number) => void;
  setDue: (id: number, dueDate: string | null) => void;
}

export function useTasks(): UseTasks {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  function refresh(): void {
    api.tasks
      .list()
      .then((rows) => {
        setTasks(rows);
        setLoaded(true);
      })
      .catch(() => {});
  }

  useEffect(refresh, []);

  function add(title: string, dueDate?: string | null): void {
    const trimmed = title.trim();
    if (!trimmed) return;
    api.tasks.add(trimmed, dueDate ?? null).then(refresh).catch(() => {});
  }

  function toggle(task: Task): void {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    api.tasks.update(task.id, { done: !task.done }).then(refresh).catch(() => {});
  }

  function remove(id: number): void {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    api.tasks.remove(id).then(refresh).catch(() => {});
  }

  function setDue(id: number, dueDate: string | null): void {
    api.tasks.update(id, { due_date: dueDate }).then(refresh).catch(() => {});
  }

  return { tasks, loaded, add, toggle, remove, setDue };
}
