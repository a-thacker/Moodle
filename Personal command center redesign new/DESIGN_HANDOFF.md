# Command Center — Design Handoff (for Claude Code)

Redesign of Alden's Personal Command Center. Replaces the old flat Netlify
`hub/` UI with a **Nocturne**-based dark dashboard. These files are the
visual/UX source of truth; port them into the real `hub/` React app.

## Files in this package
- `Command Center v2.dc.html` — **owner dashboard** (Alden). The main app.
- `Roommate Grocery.dc.html` — **roommate's grocery-only view** (matches their RLS: grocery is the only shared table).
- `Command Center App.dc.html` — earlier full bento (pre-design-system). Reference only.
- `Command Center.dc.html` — the original 3-direction exploration (1a Ops Console / 1b Almanac / 1c Bento). Reference only.
- `_ds/nocturne-6658c5cb-9796-49b5-8461-03176e4af34c/` — the Nocturne design system: `styles.css` (all tokens + component classes) and the bundle. Everything visual derives from `styles.css` variables.

## What a `.dc.html` file is
A "Design Component": a self-contained HTML file that opens directly in a
browser. Structure = one `<x-dc>` template + a `<script data-dc-script>`
logic class (plain JS). For Claude Code, **treat them as static HTML/CSS
reference** — read the markup and lift the structure, Nocturne classes, and
inline styles into React/JSX components. The only JS logic here is a live
clock (`renderVals()` computes greeting/date; `componentDidMount` ticks the
`data-clock="hm"` node every second).

## Design system: Nocturne (binding)
- Load `_ds/.../styles.css`; take **every** color/space/radius/shadow from its
  `var(--*)` tokens. Never hard-code hex/px the tokens already carry.
- Ground `--color-bg` #161826, surface `--color-surface` #232532, text
  `--color-text` #e9e9ed, one accent `--color-accent` #9184d9 (blurple).
- Accent is used as **line + glow**, never a flood. The one saturated field
  is the hero (uses `--color-section*` deep-indigo, the sanctioned
  "presence" exception).
- Tonal ramps `--color-{neutral,accent}-100..900`; muted text = neutral-400/500.
- Components are CSS classes (no JS): `.card`, `.btn`/`.btn-primary`(outlined)/`.btn-ghost`/`.btn-icon`,
  `.tag`/`.tag-accent`/`.tag-neutral`/`.tag-outline`, `.input`, `.table`.
- Inter font. Phosphor icons (`@phosphor-icons/web`, classes `ph ph-*` / `ph-fill ph-*`).
- Rules fade to transparent at ends; focus ring is 2px accent. Density 0.7×.

## Layout
- **Owner:** left 66px launcher rail (Dashboard active; Grades / Deadlines /
  Grocery live; Notes / Scripts / Assistant dimmed = planned; Settings +
  avatar bottom) → top bar (⌘K search stub, agent-sync status, live clock)
  → 3 flex columns of Nocturne `.card`s that size to content and scroll as
  one page. **Do NOT** reintroduce a fixed 3-row `1fr` grid — it starved the
  middle row and caused card collapse/overlap. Columns of stacked cards is
  the fix.
- **Roommate:** single centered ≤440px column, phone-friendly — header, add
  field, "To get" list, "Done" section. Grocery only.

## Data mapping (real, from Supabase `supabase/schema.sql`)
- `courses` + `grade_snapshots` → **Grades** card (course totals).
- `grade_events` (kind: graded/changed/feedback) → **What changed** feed.
- `timeline_events` (module: assign/quiz/forum) → **Deadlines** card;
  map module→Phosphor icon (assign=ph-file-text, quiz=ph-question, forum=ph-chats).
- `grocery_items` (name, quantity, added_by, done) → **Grocery** (both
  views). Realtime. Avatar = initial of `added_by` profile.
- Sync-agent panel reflects `agent/` runs: session health, last/next run,
  ntfy notify. When the eClass SSO session expires the agent exits code 2 —
  surface this as a **re-login banner** (see TODO).

## Current sample data (replace with live queries)
- Owner is **Alden** (owner role); roommate avatar "**S**" is a placeholder —
  get the real name.
- **Only one real S26 course**: "S26 Service-Learning Student Initiated
  Project" (id 62950), course total 100%, real feedback from C. Craven on the
  Proposal Form. Grades/Deadlines show honest "Fall '26 populates after sync"
  placeholders — keep that pattern for empty states.

## TODO (design, not yet built)
1. **Session-expired re-login banner** on the owner dashboard — the agent
   can only *nudge*; interactive Microsoft SSO must be completed on Alden's
   Mac (`python -m eclass.main login`).
2. **Functional ⌘K command bar**: run non-interactive agent actions inline
   (`agent check`, user scripts) via a localhost endpoint or a Supabase
   "command" row the agent polls; `login` becomes an "open on Mac" action,
   not an in-browser run (browser is sandboxed).
3. Wire the dimmed rail tools (Notes / Scripts / Assistant → future Ollama)
   when their backends exist.

## Integration notes for the `hub/` React app
- The old `hub/src/components/{Dashboard,GradesWidget,DeadlinesWidget,GroceryList,Login}.jsx`
  map 1:1 to these cards — restyle them with Nocturne, don't rebuild the data layer.
- Keep the writer/reader split: Hub reads eClass tables (owner-only via RLS),
  reads/writes `grocery_items`. Service-role key stays on the Mac.
