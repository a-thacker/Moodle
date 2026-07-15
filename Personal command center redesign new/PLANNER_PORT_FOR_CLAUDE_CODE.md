# Planner redesign + color pops — port spec for Claude Code

**Visual target:** `Command Center Planner.dc.html` (open in a browser). It's the
whole dashboard so you can see everything in context. It uses the exact
`--cc-*` tokens from `frontend/src/styles/app.css` and the `Task` shape from
`frontend/src/types.ts`, so this is a drop-in refactor — no new data, no new
deps. Task data in the prototype is sample; the live app already has the real
`useTasks()` / `useDashboardData()` / `useGrocery()` hooks wired.

All edits are in **`frontend/src/components/DashboardView.tsx`** unless noted.

---

## 1. Planner widget — the centerpiece (replace `DayColumn` + the `planner` content)

Today | Tomorrow become real agendas instead of a flat `time · title` list.

**Per-day column** (`DayColumn`), each gets:
- A header: mono weekday label (accent for today, muted for tomorrow), a short
  sub `Tue · Jul 14`, and a **count pill** on the right: `{remaining} left`
  (accent-tinted bg for today `#8b7cf022`/`#a99cf5`, neutral `#20233a`/`#9aa0b8`
  for tomorrow). `white-space:nowrap` on the pill.
- Today's column gets a subtle tint: `background:#8b7cf00a; border:1px solid #2f2a55; border-radius:14px`.
  Tomorrow: `background:transparent; border:1px solid #20233a`.
- A footer line inside the column: `+ add to today` / `+ add to tomorrow`
  (mono, dim, top-border). Wire it to focus the quick-add for that day.

**Task card** (replaces the bare row) — a checkable card with a category stripe:
```
display:flex; align-items:center; gap:8px; padding:8px 9px;
background:#12131d; border:1px solid #20233a;
border-left:3px solid {catColor}; border-radius:9px;
```
- Left: a real toggle button — `ph-fill ph-check-circle` (in `catColor`) when
  done, else `ph ph-circle` (`#3a3f57`). Call `toggle(t)` from `useTasks`.
- One line, ellipsis: an inline mono time prefix + the title.
  `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`. **Do not wrap** —
  full title shows at desktop width, truncates gracefully when narrow.
  - time: `fmtTime(t.dueTime)` shortened to `8:30a` / `2p` style; color
    `#a99cf5` if timed, `#3a3f57` if untimed (show `—`). Done tasks: time+title
    go to `#4a5170` + `line-through`.
- **Category → stripe color.** Derive a category per task (see §4). Map:
  `school #e0654e · meeting #a99cf5 · home #5fce9b · work #e0a84e`.

**Live "now" divider** — inside Today only, inserted between the last past
timed task and the next upcoming one (fall through to the bottom if all are
past). A pulsing accent dot + a fading `linear-gradient(90deg,#8b7cf0,transparent)`
rule + a mono `NOW · 7:57 PM`. Compute the insert index from the current
minutes-of-day vs each task's `dueTime`.

**Planner header:** keep `PLANNER` + `{openCount} open · plan →`, and add a
one-line **category legend** under it (4 small rounded swatches +
`SCHOOL / MEETING / HOME / WORK`) so the stripe colors are self-explanatory.

---

## 2. Color pops on the other tiles (each is a 1-line change)

- **Hero:** add a pulsing green dot (`#1f7a4d`, `@keyframes glow`) before
  "Agent synced · Collegedale, TN". Keep the heading responsive
  (`font-size:clamp(26px,3.4vw,38px)`) so it never clips the weather line.
- **Due Soon:** already has `dotColor()` (red/amber/dim) — good, keep it. Make
  the relative-day text red (`var(--cc-bad)`) when it's Today/Tomorrow.
- **Grades:** render the `100%` in green with a gradient bar
  `linear-gradient(90deg,#5fce9b,#8b7cf0)` and a small `on track` chip
  (`#5fce9b` on `#5fce9b1a`).
- **Scripts:** color the `▸` per script (cycle good/warn/accent-soft) instead of
  all accent.
- **Apartment list:** a small dot before each item colored by who added it
  (owner `#5fce9b`, roommate `#a99cf5`), initial on the right.
- **Claude usage:** replace the last stat row with a green pulse + `healthy`
  session indicator.

Keep it restrained — semantic trio (green/amber/red) + the purple accent, no new
hues.

---

## 3. Grid robustness

Bump dashboard row-1 min-height so the hero never clips when the heading wraps:
`grid-template-rows: minmax(158px,1.1fr) minmax(110px,1fr) minmax(120px,1fr)`
(in `.cc-grid`, `app.css`).

---

## 4. The one new thing you need: a task category

Nothing in `Task` carries a category today. Cheapest path that matches the
prototype: **derive it** with a small helper (keyword match on `title`, e.g.
`meeting|advisor|call|standup → meeting`, `dinner|grocery|laundry|trash|cook →
home`, `shift|desk|work → work`, else `school`). Better long-term: add an
optional `category` column to the tasks table + `Task.category` and let the
quick-add set it (e.g. a `#home` flag alongside the existing `-` flags in
`utils/time.ts parseTaskInput`). Ship the derived version first; the stripe is
the only thing that depends on it, so it degrades fine.

---

## Verify
Wide monitor: two full agendas side by side, titles on one line. Narrow: titles
ellipsize, nothing wraps ugly, hero stays inside its tile. Toggling a task
checks it off and updates the day's `N left` pill.
