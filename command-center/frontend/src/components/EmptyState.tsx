// A shared, friendly empty state for tool pages — centered icon + title + hint.
// Keeps "nothing here yet" moments consistent across the app.

export default function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: string;
  title: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 8,
        padding: "44px 20px",
        color: "var(--cc-muted)",
      }}
    >
      <i className={`ph ${icon}`} style={{ fontSize: 30, color: "var(--cc-accent-soft)" }} />
      <div style={{ fontSize: 15, color: "var(--cc-text)", fontFamily: "var(--font-display)" }}>{title}</div>
      {hint && <div style={{ fontSize: 13, lineHeight: 1.55, maxWidth: 340 }}>{hint}</div>}
    </div>
  );
}
