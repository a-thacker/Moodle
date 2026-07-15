// Claude's sunburst mark, drawn inline (no asset/dep). A ring of radiating
// spokes of alternating length — the Anthropic "spark".

export default function ClaudeMark({ size = 16, color = "var(--cc-accent-soft)" }: { size?: number; color?: string }) {
  const cx = 12;
  const cy = 12;
  const n = 12;
  const spokes = Array.from({ length: n }, (_, i) => {
    const ang = (i * 2 * Math.PI) / n - Math.PI / 2;
    const inner = 2.6;
    const outer = i % 2 === 0 ? 10.5 : 7.8;
    return {
      x1: (cx + inner * Math.cos(ang)).toFixed(2),
      y1: (cy + inner * Math.sin(ang)).toFixed(2),
      x2: (cx + outer * Math.cos(ang)).toFixed(2),
      y2: (cy + outer * Math.sin(ang)).toFixed(2),
    };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Claude" style={{ display: "block", flexShrink: 0 }}>
      <g stroke={color} strokeWidth="1.7" strokeLinecap="round">
        {spokes.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
        ))}
      </g>
    </svg>
  );
}
