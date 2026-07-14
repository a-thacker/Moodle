# Layout Fix — make the dashboard look like `Command Center TARGET.dc.html`

## The problem
Claude Code built the layout from `Command Center v2.dc.html` — a **sparse**
design where a few cards float in a 3-column flex row and everything is
crammed to the top-left, leaving most of the screen empty (see the screenshot
that shipped: huge dead space below and to the right).

**What's wanted instead:** the **dense, edge-to-edge bento grid** from
`Command Center App.dc.html`, keeping **v2's icon sidebar**. The finished
target is `Command Center TARGET.dc.html` — build to match that file.

## The two concrete changes

### 1. Replace the sparse layout with the dense bento grid
- The dashboard is a **fixed full-viewport grid that fills the whole screen**
  — no page scroll, no floating cards, no empty right half.
- Main area: `display: grid; grid-template-columns: repeat(4, 1fr);`
  `grid-template-rows: minmax(150px,1.1fr) minmax(150px,1fr) minmax(150px,1fr) auto;`
  `gap: 16px;` inside a flex column with `height: 100vh`.
- Tiles span cells explicitly (`grid-column` / `grid-row`) so every cell is
  filled. The tile map:
  - **Hero** (greeting + weather) — `col 1/3, row 1`
  - **Agenda / Today** (tall) — `col 3, row 1/3`
  - **Assistant** (tall) — `col 4, row 1/3`
  - **Due Soon / Deadlines** — `col 1/3, row 2`
  - **Scripts** — `col 1, row 3`
  - **Grades** — `col 2, row 3`
  - **Homelab** — `col 3, row 3`
  - **Lists / Grocery** — `col 4, row 3`
  - **Activity log** (thin strip) — `col 1/5, row 4`
- Cards: `#161824` fill, `border-radius: 20px`, `padding: ~22px 24px`.
  Section labels are `JetBrains Mono`, 12px, `#6b7089`, letter-spacing .08em,
  uppercase. Numbers/time use `Space Grotesk`.
- Accent `#8b7cf0`; the hero is the one saturated fill
  (`linear-gradient(135deg,#8b7cf0,#6857c8)`), everything else stays dark.

### 2. Keep the sidebar from v2 (already in the TARGET file)
- 76px rail, `#0e0f16`, right border `#1b1e2c`.
- **Phosphor icons** (not emoji/unicode glyphs): load
  `@phosphor-icons/web` regular + fill. Top command-mark in an accent-outlined
  box, then Dashboard (active = filled `#8b7cf0`) / Grades / Deadlines /
  Grocery; a divider; then Notes / Scripts / Assistant dimmed to 0.42 opacity
  (planned); Settings + avatar pinned bottom.
- Active/hover states via a `.rail-link` class, not inline `style-hover`.

## Data (unchanged from the real backend — see DESIGN_HANDOFF.md)
The TARGET file still carries some of App's original **mock** content (weather,
homelab, GPA 3.71, CS3320, the Assistant chat, sample agenda). Those are the
**vision/roadmap** tiles — keep the layout, but wire real data the same way
DESIGN_HANDOFF.md specifies:
- **Grades** → real: only `S26 Service-Learning Student Initiated Project`, 100%.
- **Deadlines** → real: eClass `timeline_events` (empty until Fall '26).
- **Grocery** (the "Lists" tile) → real shared `grocery_items`, owner Alden + roommate.
- **Activity strip / Assistant / Homelab / Weather / Agenda** → roadmap;
  keep the tiles as placeholders so the grid stays full, label them clearly.
- Name is **Alden**, not Andrew.

## How to verify
Open `Command Center TARGET.dc.html` in a browser. The dashboard should fill
the viewport with no empty regions and no scrollbar at 1280×800+. If cards are
floating with big gaps, you're still on the v2 layout — switch to the grid above.
