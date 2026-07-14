// Grocery card on the owner dashboard — compact, interactive, shared with the
// roommate. Uses the useGrocery hook (live API with sample fallback).

import { useState, type FormEvent } from "react";

import { useGrocery } from "../hooks/useGrocery";
import { ROOMMATE_NAME } from "../data/sample";
import GroceryRow from "./GroceryRow.tsx";

export default function GroceryCard() {
  const { items, loaded, add, toggle } = useGrocery();
  const [draft, setDraft] = useState("");
  const doneCount = items.filter((i) => i.done).length;

  function submit(e: FormEvent) {
    e.preventDefault();
    add(draft);
    setDraft("");
  }

  return (
    <section className="card" style={{ padding: "var(--space-6)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i className="ph ph-basket" style={{ color: "var(--color-accent)" }} />
          <span className="card-title" style={{ fontSize: 15 }}>Grocery</span>
        </div>
        <span className="tag tag-neutral" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <i className="ph ph-users-three" style={{ fontSize: 12 }} />
          shared
        </span>
      </div>

      <form onSubmit={submit} style={{ display: "flex", alignItems: "center", gap: 8, margin: "var(--space-2) 0 var(--space-4)" }}>
        <input
          className="input"
          placeholder="Add an item…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ minHeight: 32, fontSize: 13 }}
        />
        <button type="submit" className="btn btn-primary btn-icon" style={{ width: 32, height: 32, flex: "none" }}>
          <i className="ph ph-plus" />
        </button>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((item) => (
          <GroceryRow key={item.id} item={item} onToggle={toggle} />
        ))}
      </div>

      <div
        className="card-meta"
        style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--color-divider)" }}
      >
        <i className="ph ph-lightning" style={{ fontSize: 12 }} />
        {loaded ? "live" : "syncing…"} · syncs with {ROOMMATE_NAME}'s phone · {doneCount} of {items.length} done
      </div>
    </section>
  );
}
