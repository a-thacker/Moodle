// Projects state backed by the API. Progress counts are derived from tasks, so
// this refreshes on both project mutations AND task changes (a completed task
// changes its project's progress). Mirrors useTasks/useCalendarEvents.

import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client";
import type { Project, ProjectStatus } from "../types";

const PROJECTS_CHANGED = "cc-projects-changed";
const TASKS_CHANGED = "cc-tasks-changed";

export function notifyProjectsChanged(): void {
  window.dispatchEvent(new Event(PROJECTS_CHANGED));
}

export interface UseProjects {
  projects: Project[];
  loaded: boolean;
  refresh: () => void;
  add: (name: string, color?: string | null) => Promise<void>;
  update: (id: number, patch: Partial<Pick<Project, "name" | "description" | "color" | "status" | "position">>) => Promise<void>;
  setStatus: (id: number, status: ProjectStatus) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export function useProjects(): UseProjects {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    api.projects
      .list()
      .then((rows) => {
        setProjects(rows);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(PROJECTS_CHANGED, refresh);
    window.addEventListener(TASKS_CHANGED, refresh);
    return () => {
      window.removeEventListener(PROJECTS_CHANGED, refresh);
      window.removeEventListener(TASKS_CHANGED, refresh);
    };
  }, [refresh]);

  const add = useCallback(async (name: string, color?: string | null) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await api.projects.create({ name: trimmed, color: color ?? null });
    notifyProjectsChanged();
  }, []);

  const update = useCallback(
    async (id: number, patch: Partial<Pick<Project, "name" | "description" | "color" | "status" | "position">>) => {
      await api.projects.update(id, patch);
      notifyProjectsChanged();
    },
    [],
  );

  const setStatus = useCallback(async (id: number, status: ProjectStatus) => {
    await api.projects.update(id, { status });
    notifyProjectsChanged();
  }, []);

  const remove = useCallback(async (id: number) => {
    await api.projects.remove(id);
    notifyProjectsChanged();
  }, []);

  return { projects, loaded, refresh, add, update, setStatus, remove };
}
