import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

// Course totals come from each course's newest snapshot (the report JSONB
// holds GradeReport.to_dict(); the last is_total item is the course total).
function courseTotal(report) {
  const totals = (report?.items ?? []).filter((item) => item.is_total);
  const last = totals[totals.length - 1];
  return last?.percentage || last?.grade || "—";
}

export default function GradesWidget() {
  const [events, setEvents] = useState([]);
  const [totals, setTotals] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      const [eventsRes, coursesRes] = await Promise.all([
        supabase
          .from("grade_events")
          .select("*, courses(shortname)")
          .order("detected_at", { ascending: false })
          .limit(12),
        supabase
          .from("courses")
          .select("id, shortname, hidden, grade_snapshots(report, fetched_at)")
          .eq("hidden", false)
          .order("fetched_at", {
            referencedTable: "grade_snapshots",
            ascending: false,
          })
          .limit(1, { referencedTable: "grade_snapshots" }),
      ]);
      if (eventsRes.error || coursesRes.error) {
        setError((eventsRes.error ?? coursesRes.error).message);
        return;
      }
      setEvents(eventsRes.data);
      setTotals(
        coursesRes.data
          .filter((course) => course.grade_snapshots.length > 0)
          .map((course) => ({
            id: course.id,
            shortname: course.shortname,
            total: courseTotal(course.grade_snapshots[0].report),
          }))
      );
    }
    load();
  }, []);

  return (
    <section className="tile">
      <h2>Grades</h2>
      {error && <p className="error">{error}</p>}
      <ul className="totals">
        {totals.map((course) => (
          <li key={course.id}>
            <span>{course.shortname}</span>
            <strong>{course.total}</strong>
          </li>
        ))}
      </ul>
      <h3>Latest changes</h3>
      {events.length === 0 && <p className="muted">No grade changes yet.</p>}
      <ul className="feed">
        {events.map((event) => (
          <li key={event.id}>
            <span className="muted">
              {new Date(event.detected_at).toLocaleDateString()} ·{" "}
              {event.courses?.shortname}
            </span>
            <br />
            {event.item_name}:{" "}
            {event.kind === "feedback"
              ? "new feedback"
              : event.old
                ? `${event.old} → ${event.new}`
                : `graded ${event.new}`}
          </li>
        ))}
      </ul>
    </section>
  );
}
