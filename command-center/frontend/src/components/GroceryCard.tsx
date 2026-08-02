// Grocery — the shared list (syncs with the roommate's phone). Add box on top,
// live rows below, a status footer. Loading skeletons + empty state. Rendered
// inside the Grocery tool page (PageShell provides the header).

import { useState, type FormEvent } from "react";

import { useGrocery } from "../hooks/useGrocery";
import { ROOMMATE_NAME } from "../data/sample";
import EmptyState from "./EmptyState.tsx";
import GroceryRow from "./GroceryRow.tsx";

export default function GroceryCard() {
  const { items, loaded, add, toggle, remove } = useGrocery();
  const [draft, setDraft] = useState("");
  const doneCount = items.filter((i) => i.done).length;

  function submit(e: FormEvent) {
    e.preventDefault();
    add(draft);
    setDraft("");
  }

  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
      <form onSubmit={submit} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--space-4)" }}>
        <input
          className="input"
          placeholder="Add an item…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ minHeight: 36, fontSize: 14 }}
        />
        <button type="submit" className="btn btn-primary btn-icon" disabled={!draft.trim()} style={{ width: 36, height: 36, flex: "none" }}>
          <i className="ph ph-plus" />
        </button>
      </form>

      {!loaded ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="cc-skeleton" style={{ height: 34, width: "100%", borderRadius: 8 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon="ph-basket" title="The list is empty" hint="Add the first item above — it shows up on the roommate's phone too." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {items.map((item) => (
            <GroceryRow key={item.id} item={item} onToggle={toggle} onRemove={remove} />
          ))}
        </div>
      )}

      {loaded && items.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: "var(--space-4)",
            paddingTop: "var(--space-3)",
            borderTop: "1px solid var(--cc-tile-border)",
            fontSize: 11.5,
            color: "var(--cc-muted)",
          }}
        >
          <span className="pulse status-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--cc-good)", display: "inline-block" }} />
          live · syncs with {ROOMMATE_NAME}'s phone · {doneCount} of {items.length} done
        </div>
      )}
    </section>
  );
}
