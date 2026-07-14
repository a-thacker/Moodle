// Fetches the owner dashboard's eClass data (courses, deadlines, grade-event
// feed) from the backend. Empty arrays until the agent has synced — the cards
// render honest empty states for the pre-semester lull.

import { useEffect, useState } from "react";

import { api } from "../api/client";
import type { Course, Deadline, GradeEvent } from "../types";

export interface DashboardData {
  courses: Course[];
  deadlines: Deadline[];
  gradeEvents: GradeEvent[];
  loading: boolean;
}

export function useDashboardData(): DashboardData {
  const [courses, setCourses] = useState<Course[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [gradeEvents, setGradeEvents] = useState<GradeEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.allSettled([api.courses(), api.deadlines(), api.gradeEvents()])
      .then(([c, d, g]) => {
        if (!active) return;
        if (c.status === "fulfilled") setCourses(c.value);
        if (d.status === "fulfilled") setDeadlines(d.value);
        if (g.status === "fulfilled") setGradeEvents(g.value);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return { courses, deadlines, gradeEvents, loading };
}
