// Roommate view — grocery only (matches their RLS: grocery is the one shared
// table). Single centered ≤440px phone-friendly column: header, add field,
// "To get" list, "Done" section.

import { useState, type FormEvent } from "react";

import { useGrocery } from "../hooks/useGrocery";
import { OWNER_NAME, ROOMMATE_NAME } from "../data/sample";
import GroceryRow from "./GroceryRow.tsx";

export default function RoommateGrocery() {
  const { items, add, toggle } = useGrocery();
  const [draft, setDraft] = useState("");
  const toGet = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  function submit(e: FormEvent) {
    e.preventDefault();
    add(draft);
    setDraft("");
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "auto",
        background: "var(--color-bg)",
        color: "var(--color-text)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          margin: "0 auto",
          padding: "var(--space-8) var(--space-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
        }}
      >
        {/* header */}
        <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-accent)",
            }}
          >
            <i className="ph ph-basket" style={{ fontSize: 20 }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 19, lineHeight: 1.1 }}>
              Apartment Grocery
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--color-neutral-500)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 2,
              }}
            >
              <span className="pulse status-dot" style={{ width: 6, height: 6 }} />
              live · shared with {OWNER_NAME}
            </div>
          </div>
          <div
            title={ROOMMATE_NAME}
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "var(--color-neutral-800)",
              color: "var(--color-neutral-100)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-heading)",
              fontSize: 14,
            }}
          >
            {ROOMMATE_NAME.charAt(0)}
          </div>
        </header>

        {/* add */}
        <form onSubmit={submit} style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            placeholder="Add an item…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" style={{ flex: "none", paddingInline: "var(--space-4)" }}>
            <i className="ph ph-plus" />
            Add
          </button>
        </form>

        {/* to get */}
        <section className="card" style={{ padding: "var(--space-6)", gap: "var(--space-3)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>
              To get
            </span>
            <span style={{ fontSize: 11, color: "var(--color-neutral-500)" }}>{toGet.length} items</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {toGet.map((item) => (
              <GroceryRow key={item.id} item={item} onToggle={toggle} size="roomy" />
            ))}
            {toGet.length === 0 && (
              <span style={{ fontSize: 13, color: "var(--color-neutral-500)", padding: "8px 4px" }}>
                All done. Nice.
              </span>
            )}
          </div>
        </section>

        {/* done */}
        {done.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 var(--space-2)" }}>
              <span style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-neutral-500)" }}>
                Done
              </span>
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => done.forEach((i) => toggle(i.id))}>
                Clear
              </button>
            </div>
            {done.map((item) => (
              <GroceryRow key={item.id} item={item} onToggle={toggle} size="roomy" />
            ))}
          </section>
        )}

        <div style={{ textAlign: "center", fontSize: 11, color: "var(--color-neutral-600)", marginTop: "var(--space-2)" }}>
          Changes appear on {OWNER_NAME}'s dashboard instantly.
        </div>
      </div>
    </div>
  );
}
