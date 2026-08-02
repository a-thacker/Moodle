// A single grocery line — checkbox circle, name (+ optional quantity), and an
// avatar for who added it. Shared by the owner card and the roommate view;
// `size` scales it between the compact dashboard tile and the roommate page.

import type { GroceryItem } from "../types";

interface GroceryRowProps {
  item: GroceryItem;
  onToggle: (id: number) => void;
  onRemove?: (id: number) => void;
  size?: "compact" | "roomy";
}

export default function GroceryRow({ item, onToggle, onRemove, size = "compact" }: GroceryRowProps) {
  const roomy = size === "roomy";
  const iconSize = roomy ? 20 : 18;
  const avatar = roomy ? 22 : 20;

  return (
    <label
      className="row-hover"
      style={{
        display: "flex",
        alignItems: "center",
        gap: roomy ? 12 : 10,
        padding: roomy ? "11px 10px" : "7px 8px",
        cursor: "pointer",
        opacity: item.done && roomy ? 0.65 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={item.done}
        onChange={() => onToggle(item.id)}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
      />
      {item.done ? (
        <i className="ph-fill ph-check-circle" style={{ color: "var(--cc-accent)", fontSize: iconSize }} />
      ) : (
        <i className="ph ph-circle" style={{ color: "var(--cc-dim)", fontSize: iconSize }} />
      )}
      <span
        style={{
          flex: 1,
          fontSize: roomy ? 15 : 13,
          color: item.done ? "var(--cc-muted)" : "var(--cc-text)",
          textDecoration: item.done ? "line-through" : "none",
        }}
      >
        {item.name}
        {item.quantity && <span style={{ color: "var(--cc-muted)" }}> · {item.quantity}</span>}
      </span>
      <span
        style={{
          width: avatar,
          height: avatar,
          borderRadius: "50%",
          background: item.addedByOwner ? "color-mix(in srgb, var(--cc-accent) 30%, transparent)" : "#20233a",
          color: item.addedByOwner ? "var(--cc-accent-soft)" : "var(--cc-text)",
          fontSize: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {item.addedByInitial}
      </span>
      {onRemove && (
        <button
          type="button"
          title="Remove"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(item.id); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--cc-dim)", padding: 2, display: "flex", flexShrink: 0 }}
        >
          <i className="ph ph-x" style={{ fontSize: roomy ? 14 : 12 }} />
        </button>
      )}
    </label>
  );
}
