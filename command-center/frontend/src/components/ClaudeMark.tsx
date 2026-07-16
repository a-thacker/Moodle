// The Claude Code logomark — the little terminal that "types" (the body hops
// 1px on a 1s step loop). Animation lives in app.css (.cc-claude-body).

export default function ClaudeMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Claude Code" style={{ display: "block", flexShrink: 0 }}>
      <title>Claude Code</title>
      <path
        fill="#D97757"
        fillRule="evenodd"
        d="M 21 15 v 1 h -1.487 V 20 H 18 v -4 h -1.487 V 20 H 15 v -4 H 9 V 20 H 7.488 v -4 H 6 V 20 H 4.487 v -4 H 3 V 15 h 18 Z"
      />
      <path
        className="cc-claude-body"
        d="M 20.998 10.949 H 24 v 3.102 h -3 V 17 H 3 V 14.05 H 0 V 10.95 h 3 V 5 h 17.998 v 5.949 z M 6 10.949 h 1.488 V 8.102 H 6 v 2.847 z m 10.51 0 H 18 V 8.102 h -1.49 v 2.847 z"
        fill="#D97757"
        fillRule="evenodd"
      />
    </svg>
  );
}
