# The main Design screen, three rows with one job each

**Status:** decided by the maintainer on 2026-11-23, from a design review with three full-screen
examples; this is example **B**. It changes what F.8, R-06 and U.5–U.11 built around the board;
the board, the panels' contents and the Sheets view's own behaviour stay as they are.
Plan: [`2026-11-23-main-screen.md`](../plans/2026-11-23-main-screen.md).

## Why

The window had three stacked bars, about 108 px tall, that did not divide their work: the
project's name was on a tab, Save one row down and Undo two rows down; the work bar ran history,
*Draw as* and hints together at one weight; five button shapes shared 108 px; the middle of the
project bar and the right of the tab strip were empty. Print looked almost the same ready or not.

The loop the screen serves is: draw an outline, add a stitch line, stitch holes, check the
numbers, check the sheets, print at 1:1. Each row now answers one question of that loop.

## The rows

| Row | Height | Job | Holds, left to right |
|---|---|---|---|
| 1 | 36 px | The document | ☰ project menu · Undo · Redo · the project tabs · + |
| 2 | 40 px | What you look at, and where it goes | Design · Sheets (view tabs) ··· Paper · Export PDF ▾ · Print |
| 3 | 36 px | The active tool | the rail's head cell (the tool) · Draw as: Cut · Stitch · Mark ··· ? all keys |

The status bar (24 px) holds the panel keys, the tool's hint, the cursor, and **?** (Help) at the
far right.

Every row's first glyph starts 12 px from the window's left edge, as the rail's icons do. Every
button is 28 px high; every Draw as choice is 24 px. Groups are separated by space (16 px), not
by lines; the only boxes are the Draw as groups and the field-style paper control.

### Row 1 — the document

- **No Save button.** Ctrl+S saves; the active tab's dot says there is unsaved work; the
  announcer still says "Saved" / "Unsaved changes" for a screen reader.
- **Undo and Redo** move here from the work bar, icon only, after ☰, named in their tooltips with
  the action they undo, as today.
- An inactive project tab ends with a short hairline, so it does not float; the active tab keeps
  its box, open into row 2.

### Row 2 — the view, and the output

- **Design | Sheets are tabs**, not a segmented control: a view switch belongs in tabs, not in a
  toolbar (Apple HIG, *Segmented controls*; Fluent 2, *TabList*). Icon and word each — the app's
  `view-design` and `view-sheets` icons — at 14 px; the selected tab is marked two ways, semibold
  text and a 2 px accent underline on the row's bottom edge; the Sheets tab ends with the sheet
  count as a quiet number. Arrow keys, Home, End, Ctrl+1 and Ctrl+2 keep working.
- **Paper** is a field-style choice, not a quiet button: the word "Paper", then "2 × A4
  landscape", then ▾, inside a hairline box. No icon.
- **Export PDF ▾** is unchanged: its second half has a chevron because it is a menu.
- **Print** is green only when there is nothing to fix:

  | State | Main half | Second half |
  |---|---|---|
  | Ready | `#4ADE80`, label in `on-primary` (10.4:1) | `#22C55E`, a check (7.9:1) |
  | Warnings | `shell-600` (`#2A2E34`), label in `text` | `warning`, triangle and count |
  | Errors | `shell-600`, label in `text` | `error`, dot and count |

  The second half never carries a chevron: it is a status, not a menu. It opens Problems, as
  today, and its name says both, for example "Problems: nothing to fix. Show Problems". Print still
  works with warnings and errors; they are the maker's to weigh. The fold green on the board is far
  darker (`#2E7D53`) and lives on the drafting ground, so the two greens differ in lightness and in
  place. This reverses 1.5's "green is not used for actions" for this one control.
- **Settings and Help leave the bar.** Settings… is the last item of the ☰ menu, with Ctrl+, and,
  when a newer version exists, the update mark — which also shows on the ☰ button. Help is the
  **?** at the status bar's right; F1 opens it; it lists *Keyboard shortcuts* and *About
  LeatherCAD*.

### Row 3 — the tool

- The row's first cell is as wide as the rail (`--rail-w`) and sits above it, so the rail rises
  into the row: it shows the active tool's icon, name and key, and only the icon when the rail is
  narrow. The row then reads "Line · Draw as …".
- **Draw as** leads the options, then three boxed groups with a quiet name before each:
  **Cut** (Outline, Cut-out) · **Stitch** (Stitch line, Stitch line + allowance) · **Mark** (Fold,
  Marking). The groups follow the workshop. Each choice shows a line sample — the app's
  `FeatureMark` on a drafting-ground tile, in the colour and dash the line has on the board and on
  paper — and its word. No group icons.
- Whether a choice starts a new piece or adds to the selected one (`commitDrawn.ts`) is said in
  each choice's tooltip: "Outline: a new piece's cut edge", "Cut-out: a hole in the selected
  piece".
- **? all keys** stays at the row's right. The tool's ranked hints move to the status bar.

### The panels and the status bar

- Panel titles drop to label weight (12 px, `text-dim`): "Parts", "Properties". The selection's
  name below is the loudest text beside the drawing.
- The Parts heading carries the count: "Parts 3 pieces".
- The status bar keeps the three panel chips, the tool's hint and the cursor, and gains **?**. The
  version and the counts leave it: the version is in About and the update mark on ☰; the piece
  count is in Parts' heading.
- The start screen gets the same status bar, holding the version at the left and **?** at the
  right; its tab strip no longer ends with Settings and Help.

## Narrow windows

What gives way, in order: the rail's names (below 1280, as today), Properties to its strip (below
1280), the paper's orientation word ("2 × A4"), Parts to its strip (below 900), "? all keys" (the
? corner still lists every key), the group names Cut, Stitch and Mark, and, only when the choices
themselves do not fit, the Draw as choices become the select the app already has. The rail's head
cell shows the tool's icon only while the rail is narrow.

## Words

New: "Cut", "Stitch", "Mark" (Draw as groups), the choices' tooltips, the Print status's names,
"Keyboard shortcuts" in Help, "Settings…" in ☰. Newly visible: "Paper". Every one through `t()`
from `en.json`; translations may run 30 % longer.

## Open, carried

1. Whether people expect a menu under Print's second half: a first-click test.
2. Two rows of tabs (projects, views): ask five new people to "open the other project" and "see
   the sheets".
3. The design system's tokens and README still say Print is the paper colour; update them with
   this change.

## Sources

Apple HIG: Toolbars, Tab views, Segmented controls. Microsoft: Command bar; Fluent 2: Toolbar,
TabList. Nielsen Norman Group: Icon usability, Tabs used right, Split buttons, Proximity, Common
region, Closeness of actions and objects, Visibility of system status. WCAG 2.2: 1.4.3, 1.4.11,
2.5.8. Maker and CAD tools compared: Fusion 360, Affinity, Figma, Bambu Studio, Cura, Cricut
Design Space, Seamly2D.
