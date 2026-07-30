// The shared frame for every tool page. Each page sits inside one titled
// surface card — an icon chip + title (+ optional subtitle and right-aligned
// actions) above a hairline divider, then a padded body. This is what gives
// the tools a single consistent look; individual views only supply their
// content. The frame fills the content area and the body scrolls inside it, so
// no page can spill over the command bar.

import type { ReactNode } from "react";

import { useIsMobile } from "../hooks/useMediaQuery";

export default function PageShell({
  title,
  icon,
  subtitle,
  actions,
  children,
  contentClassName,
  // Views that manage their own internal scroll regions (chat, job lists,
  // planner columns) pass scroll={false} so the body is a fixed flex column.
  scroll = true,
  // Set false when the body wants to own its padding edge-to-edge.
  pad = true,
}: {
  title: string;
  /** Phosphor icon name for the header chip (e.g. "ph-film-reel"). */
  icon?: string;
  /** One-line muted context under the title. */
  subtitle?: ReactNode;
  /** Right-aligned header controls (buttons, counts). */
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  scroll?: boolean;
  pad?: boolean;
}) {
  const isMobile = useIsMobile();
  return (
    <section
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--cc-tile)",
        border: "1px solid var(--color-divider)",
        borderRadius: isMobile ? 16 : "var(--cc-radius)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 13,
          flexShrink: 0,
          padding: isMobile ? "13px 15px" : "16px 22px",
          borderBottom: "1px solid var(--color-divider)",
        }}
      >
        {icon && (
          <span
            aria-hidden
            style={{
              display: "grid",
              placeItems: "center",
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "color-mix(in srgb, var(--cc-accent) 15%, transparent)",
              color: "var(--cc-accent-soft)",
              flexShrink: 0,
            }}
          >
            <i className={`ph ${icon}`} style={{ fontSize: 18 }} />
          </span>
        )}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: isMobile ? 17 : 19,
              fontWeight: 600,
              margin: 0,
              color: "var(--cc-bright)",
              lineHeight: 1.15,
            }}
          >
            {title}
          </h2>
          {subtitle != null && (
            <span
              style={{
                fontSize: 12.5,
                color: "var(--cc-muted)",
                lineHeight: 1.4,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
        {actions != null && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </header>
      <div
        className={contentClassName}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: scroll ? "auto" : "hidden",
          display: "flex",
          flexDirection: "column",
          padding: pad ? (isMobile ? 15 : "20px 22px") : 0,
        }}
      >
        {children}
      </div>
    </section>
  );
}
