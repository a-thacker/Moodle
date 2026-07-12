import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

// Shared with the roommate; Supabase Realtime keeps both phones in sync
// (any change to the table triggers a refetch — simple and always right).
export default function GroceryList({ profile }) {
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState("");
  const [error, setError] = useState(null);

  async function refresh() {
    const { data, error: queryError } = await supabase
      .from("grocery_items")
      .select("*, profiles(display_name)")
      .order("done", { ascending: true })
      .order("created_at", { ascending: false });
    if (queryError) setError(queryError.message);
    else setItems(data);
  }

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("grocery")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "grocery_items" },
        refresh
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  async function addItem(event) {
    event.preventDefault();
    const name = newItem.trim();
    if (!name) return;
    setNewItem("");
    const { data: userData } = await supabase.auth.getUser();
    const { error: insertError } = await supabase
      .from("grocery_items")
      .insert({ name, added_by: userData.user.id });
    if (insertError) setError(insertError.message);
  }

  async function toggle(item) {
    const done = !item.done;
    await supabase
      .from("grocery_items")
      .update({ done, done_at: done ? new Date().toISOString() : null })
      .eq("id", item.id);
  }

  async function remove(item) {
    await supabase.from("grocery_items").delete().eq("id", item.id);
  }

  return (
    <section className="tile">
      <h2>Grocery list</h2>
      {error && <p className="error">{error}</p>}
      <form className="add-row" onSubmit={addItem}>
        <input
          placeholder="Add item…"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>
      <ul className="grocery">
        {items.map((item) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <label>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggle(item)}
              />
              <span>{item.name}</span>
            </label>
            <span className="muted">
              {item.profiles?.display_name}
              <button className="link" onClick={() => remove(item)}>
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="muted">List is empty.</p>}
    </section>
  );
}
