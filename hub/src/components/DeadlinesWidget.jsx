import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

function dueLabel(due) {
  const date = new Date(due);
  const days = Math.floor((date - Date.now()) / 86400000);
  const when = date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (days < 0) return `${when} (past)`;
  if (days === 0) return `${when} (today!)`;
  if (days === 1) return `${when} (tomorrow)`;
  return `${when} (${days}d)`;
}

export default function DeadlinesWidget() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase
      .from("timeline_events")
      .select("*")
      .order("due", { ascending: true })
      .limit(15)
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        else setEvents(data);
      });
  }, []);

  return (
    <section className="tile">
      <h2>Deadlines</h2>
      {error && <p className="error">{error}</p>}
      {events.length === 0 && !error && (
        <p className="muted">Nothing upcoming. Enjoy it.</p>
      )}
      <ul className="feed">
        {events.map((event) => (
          <li key={event.id} className={event.overdue ? "overdue" : ""}>
            <span className="muted">
              {dueLabel(event.due)} · {event.course_name ?? "eClass"}
            </span>
            <br />
            {event.url ? (
              <a href={event.url} target="_blank" rel="noreferrer">
                {event.name}
              </a>
            ) : (
              event.name
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
