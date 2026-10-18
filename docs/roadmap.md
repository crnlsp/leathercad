# Roadmap

**Released:** v1.3.5 (2026-10-09) · **Next:** 1.5, then 1.6 · **Last updated:** 2026-10-17

What comes next, and everything known that is not done yet. What already shipped is in
[`CHANGELOG.md`](../CHANGELOG.md). The full record of how 1.0 was built — every slice from 0.1 to
8.6, with what each found — is kept in [`history/roadmap-to-1.0.md`](history/roadmap-to-1.0.md),
what shipped in 1.1.0 to 1.2.0 in [`history/roadmap-1.1-and-1.2.md`](history/roadmap-1.1-and-1.2.md),
what shipped in 1.3.0 in [`history/roadmap-1.3.md`](history/roadmap-1.3.md), and what shipped in
1.3.5 in [`history/roadmap-1.3.5.md`](history/roadmap-1.3.5.md). Where the work after 1.6 is
heading, and why in that order, is drawn in [`product-roadmap.md`](product-roadmap.md): this file
holds the items themselves, their status and their order.

---

## How to read this

- **Every item has a number** — a slice (`3.9`, `6.2`) or a finding (`Q1`). The numbers are stable:
  `/slice 3.9` always means the same thing, and slice numbers continue the ones in the 1.0 record.
- **A slice is a vertical piece of work** that ends with the app running, tests green, and
  something a person can see. How one is planned, built and landed is in
  [`CONTRIBUTING.md`](../CONTRIBUTING.md).
- **Marks:** ☐ planned · ◐ in progress · ✅ done. A done item stays here until its release ships,
  then moves to the record in [`history/`](history/) and is deleted here.
- **A release is its whole section.** Everything under *the next release* ships together, and
  `develop` goes to `main` only when every item in it is ✅. An item that will not make it is moved
  to the release after, or to *Later*, in a change of its own — never left behind by a release
  happening. The *Release gate* check on pull requests into `main` refuses a section with ☐ or ◐
  still in it ([`CONTRIBUTING.md`](../CONTRIBUTING.md#changelog-and-releases)).
- **Scope rule,** carried over from 1.0: an idea that is not needed for everyday use, the
  leathercraft workflow, pattern correctness or print correctness waits for a later release — even
  when it turns up halfway through something else. Write it under *Later* instead.
- **Later is candidate milestones,** each a theme, in the order suggested for work, then *Also
  later*, *Exploring* and *Not planned*. A milestone becomes a release only when it is next, so
  nothing in *Later* is a promise. Items 9.12 to 9.24 and the findings Q33 and Q34 were added on
  2026-10-17 by the product roadmap refresh, whose evidence is in
  [its record](superpowers/specs/2026-10-17-product-direction-audit.md).
- **The UI refinement's slices are `U.1` to `U.20`** (1.5). Each builds requirements of
  [its spec](superpowers/specs/2026-10-08-ui-refinement-requirements.md), whose ids are `R-01` to
  `R-16` — not the release-engineering items `R1` to `R7` below. U.20, added later, fixes what
  Chromium left at its defaults and cites no `R-` id. Each slice's whole task is in
  [the plan](superpowers/plans/2026-10-08-ui-refinement.md): why it matters to a maker, what the
  code does today, what to find out first, and how to check it is done.

## Where 1.0 left things

| Milestone | Proves | |
|---|---|---|
| **M1** | A 100 mm square, drawn from data, on a zoomable canvas with a mm ruler | ✅ |
| **M2** | Draw a rounded rectangle with snapping, undo and redo it | ✅ |
| **M3** | Change a rectangle's width; its stitch line and holes update live | ✅ |
| **M4** | Save, quit, reopen, and everything is exactly as it was | ✅ |
| **M5** | Print a wallet pattern and measure 100.0 mm with a steel rule | ✅ Measured by the maintainer, and on Linux recorded in [`print-verification-log.md`](print-verification-log.md) (**R1**, 2026-10-09) |

1.0 shipped on Linux, Windows and macOS, unsigned by decision (see *Release engineering*).

---

## 1.5 — the next release

**The window, refined.** The UI/UX final audit's requirements, received 2026-10-08: a refinement pass, not a redesign. The
layout, the look and the words stay, and **printed output does not change**. The theme is *a maker
gets more done at the bench*: the pattern reads at every zoom, the board gets the room, sizes are
typed where the eye already is, and the next step is one click away.
[Requirements](superpowers/specs/2026-10-08-ui-refinement-requirements.md) (R-01 to R-16) and
[mockups](superpowers/specs/2026-10-08-ui-refinement-mockups/); [the
plan](superpowers/plans/2026-10-08-ui-refinement.md) holds each slice's whole task, the answers to
the requirements' open questions, and what reading the code turned up. One pull request per slice,
in this order: U.1 first, and the plan's §0 says why. U.1 to U.3 shipped in 1.3.5, and 1.5 begins at U.4. R-10 and the keys move up into Phase 1 as
U.3, because the controls after them show keys; R-15 leads Phase 3, because R-14 and R-16 read it.

### Phase 1 — the canvas, the keys and the frame

- ✅ **U.4 A zoom control, and true size** (R-03). − · % · + · Fit at the canvas's bottom-right;
  *Fit drawing* `Shift+1`, *Fit selection* `Shift+2`, *True size* `Ctrl+0` — which fits today.
  ✅ Built as described, on Design and on Sheets. Measured in the app: at *True size* a 100 mm
  panel is 378 CSS px across on a 1× and a 2× display (377.95 by the arithmetic). `Ctrl+0` means
  true size now, and fitting moved to `Shift+1`, matched by place, so a German `!` or a French `1`
  fits. *Fit selection* is refused, with its reason, when nothing selected is drawn, and on Sheets.
  100 % is the CSS reference pixel, 96 to the inch, one constant a screen calibration would
  replace. Found on the way, and fixed: the status sent the Design camera's scale even on Sheets,
  and only when the pointer moved — after `Ctrl+=` it still said 124.5 % for a board at 155.6 %,
  and on Sheets the board's zoom for paper at 27.6 % — so the zoom is now read off whichever camera
  is painted; Fit framed hidden features, which it does not draw; choosing from a menu by keyboard
  dropped focus to the page, and now gives it back to the button; `getting-started.md` said a
  German keyboard zooms from the key right of 0, which U.3's review had changed; a button of the
  control pressed with the mouse kept focus, so the Enter that finishes a polyline zoomed again,
  and now leaves the keys to the board; a window moved to a display of another ratio kept its
  device pixels per mm, so 100 % read 50 % on a 2× screen, and now keeps its zoom. From review:
  − and + step along round stops (1 … 25, 33, 50, 67, 75, 100, 125, 150, 200, 300, 400 … 10 000 %)
  instead of ×1.25, so + from any fit reaches 100 %; and the zoom limits, which were device pixels
  (about 10 600 % at 1×, 5 300 % at 2×), are 1 % and 10 000 % on every display. Printed output
  did not move: no export test, golden fixture or format fixture changed.
- ✅ **U.5 Panels fold, and focus mode** (R-04). `[` Parts, `]` Properties, `\` both; 40 px strips;
  three status-bar chips, always; the widths of the requirements' §5; the maker's choices
  remembered; nothing unreachable.
  ✅ Built as described. Measured in the app at 1×, the board is 1280, 800 (1384 in focus mode),
  640, 720 and 804 px wide at 1920, 1440, 1280, 1024 and 860 — it was 1260, 780, 620, 488 and 808.
  Each panel's header has its fold, and a folded panel is a 40 px strip: Parts a thumbnail of each
  piece, which selects it, a locked one too; Properties the mark of what is selected, named in its
  tooltip. `\` hides both and turns the rail to keys; `\` or Esc brings back exactly what was
  there. The keys are matched by place, so a German keyboard folds on `ü`, `+` and `#`. Below 1280 px
  Properties folds by itself and below 900 Parts too; there a panel opens over the board, takes
  focus, gives it back, and closes on Esc or a press on the board. The status bar always holds
  *Parts*, *Focus* and *Properties*, the one for a hidden panel in the accent. The maker's folds
  are kept in `preferences.json` (`partsFolded`, `propertiesFolded`); a narrow window's never are,
  and focus mode is the session's. The drawing stays where it is through every fold. Thumbnails
  are `thumbnailPath` in `packages/render`, for U.8. Found on the way: no tool claimed Escape, so
  one press would have cancelled a drawing and left focus mode — a tool now claims it when it gives
  something up, and the window takes it only after; the link tick on a derived line chose between
  a rectangle's equal top and bottom by the last bit of a float, so the same panel drawn 10 px
  further right wore it on the other side — the first of equal runs keeps it now; the status bar's
  height was its content's, so the chips made it a pixel taller (and the old narrow-window chips
  37 px instead of 28) — it is a fixed 28 px from the theme now, as the work bar's 36 is; and the
  preload declared three of the preferences' fields. Parts at 208 px keeps every row that fitted
  at 220 on one line. Printed output did not move.
- ✅ **U.6 Properties: order, weight and job totals** (R-05). A hole set reads iron, result, name,
  arrange, then Delete alone at its foot; with nothing selected, the pieces to cut, the holes to
  punch and the sheets to print.
  ✅ Built as described. Holes, Spacing and Runs at 17/22, then one line: *Spacing matches the
  pitch* with a check, or *Spacing is stretched 1.8 %* — "matches" when the Spacing readout shows
  the Pitch field's number, and the warning glyph only when Problems warns about the set too.
  Every kind follows the same order; Flip and Mirror are icon pairs; Delete sits in a footer with
  its *Del* cap, in view at 860 × 600, where it sat 188 px below the window's foot. Under the
  name, "Outer · Cut ×1 › Stitch line › Stitch holes"; the piece's name (*Piece*) and Cut only for
  the outline or the piece. With nothing selected the sample reads *3 · 4 to cut*, *250 · 146 +
  52 ×2*, *2 · A4, portrait*, counting what prints. Labels are 68 px and the panel's scrollbar
  thin, so "A hole on each corner" is no longer clipped, even while the panel scrolls at 264 px.
  Found on the way: matched to a tenth of a percent, the sample's own outer read *stretched 0.1 %*
  under a readout of *3.85 mm* (3.8532 mm on a 3.85 iron), where the mockup draws a check — it now
  matches, as its numbers do; and Lucide 1.x's flip icons are swapped, so the right-click menu's
  *Flip horizontal* showed a top-to-bottom flip — fixed for the menu, Arrange and the parts list's
  mirror mark.
- ✅ **U.7 The top bar in three zones** (R-06). The project and its save state · Design | Sheets ·
  the paper, then Export PDF and Print as split buttons, Print's second half showing the problems;
  green leaves the actions; the window's edited flag.
  ✅ Built as described. The Project menu's button is the project's name, cut short with its
  tooltip whole, and *Rename…* in it turns the name back into the field it was — as the roadmap's
  decision asked; a check and *Saved*, or an open dot and *Unsaved changes*, and Save says
  *Nothing to save* when there is none. Design | Sheets is a tab list in the middle, the Sheets tab
  carrying the sheet count. The paper is a quiet "2 × A4 portrait" opening the paper, which way up,
  what it comes to and *See the sheets*. Export PDF and Print are two-tone split buttons, each half
  its own button; Print is the paper's colour, and its second half says the problems — a check, or
  the worst severity and how many — and opens the drawer, which says the same from the same
  count (`countBySeverity`). Print stays enabled, and its preview lists the drawer's problems first.
  F1 opens Help. At 1024 px the words shorten, at 860 px only the paper's count, the save state's
  dot and the switch's icons stay. The save state and the problems are said politely, once per
  change, and not while a drag is under way; the window's edited flag follows unsaved work
  (checked through the fake and on Linux, where Electron ignores it, not on a Mac). Green left the
  palette. Found on the way: typing the project's name made every letter an undo step of its own —
  renaming is one step now; and the export notice counted the severities on its own while the
  drawer said only a total — one count serves all three now. No key changed meaning; F1 is new. Printed output did not move.

### Phase 2 — panels, lists and small fixes

- ✅ **U.8 The Parts tree** (R-07). Pieces fold; features nest under what they follow; keys for the
  tree; *Sheet N, turned* leaves Design.
  ✅ Built as described. Each piece is a row with its fold, its outline in small (U.5's
  `thumbnailPath`) and its ×N; under it what it is made of, a level deeper for each thing it
  follows — *Outline › Stitch line › Stitch holes* — joined by elbows, in 28 px rows
  (`row-height`, the theme's `DENSITY`), a hole set's count at the right. At rest no row shows its
  lock and eye, though their room is kept at every row's end, so hover or keyboard focus shows
  them and nothing moves — a hole set's count stays in sight beside them (on review, after #89);
  a hidden or locked feature keeps its toggle in sight, the mirror mark always shows. A WAI-ARIA tree with one
  Tab stop: ↑ ↓ move and select, → opens or goes in, ← closes or goes up, Home and End, **Space**
  hides or shows, **F2** renames in place (one undo step), Shift+F10 the row's menu; the window's
  keys — Delete, Ctrl+Z, a tool's letter — pass through a focused row. A selection on the board
  opens its piece and scrolls its row into view without taking focus. *Sheet 1, turned* is the
  Sheets view's now; in Design a piece that will not print has a mark whose tooltip says why
  (*Not printed. It is hidden.*). Pieces start open, and a fold lasts the session. Found on the
  way: a piece's ⋯ menu, once its button showed only on hover, faded out with the row as the
  pointer left for it — it stays while open; forced colours drew a box round every row; a rename whose row went from under it — undone
  away from macOS's Edit menu while its field had focus — reopened its field when the row came
  back, and now ends with the row, keeping nothing half-typed. With the actions' room kept, rows
  step 12 px a level with 4 px between their parts; at 208 and 224 px the deepest *Stitch holes*
  and *Cut-out mirrored* wrap between their words, and *Card pocket ×2*'s marks take a line below
  its name. A selection paints in 4.5 ms with 32 features (3.0 ms
  before). Printed output did not move.
- ✅ **U.9 The Sheets view gets its own panels** (R-08). Pieces by sheet, the paper in Properties,
  the reminder to measure. No Turn: no piece is turned by hand.
  ✅ Built as described, less Turn and Measure. The rail is Select and the note *Drawing tools are
  in Design · Ctrl+1* (the key read from the keymap). Parts is the sheets in the PDF's order —
  *Sheet 1 of 2 · 2 pieces* — with each piece's thumbnail, a *Taped* badge or a turned mark
  (tooltip *Turned 90°*), then *Not printed* with the reason, then *Taped across sheets*
  (*None. Every piece fits on one sheet.*). Properties is the paper (the paper button's own
  fields, so one undo step), the sheet count, *Scale 100 % · locked*, then the picked piece's
  sheet, placement and fit, then the reminder to measure the 100 × 5 mm box. The options row says
  *Click a piece to see where it prints · ? all keys*; the sheet summary stays as a polite
  announcement, out of sight. Every number is read from `sheetPlanFor` through `sheetContents.ts`
  (`sheetContents`, `tapedPieces`, `placementOf`), never paginated again. On the board a sheet's
  label is the board's own 12 px voice in `GROUND.label` (4.5:1 on the sheets' ground; the
  furniture magenta was 3.5:1), in the app's words — *Sheet 1 of 3 · 2 pieces* — and a sheet
  holding a turned piece names it below, *Pocket, turned 90°*, never over the pattern. Found on the
  way: the label's halo, first tried, cut the paper's edge at fit zoom, and a caption laid over a
  turned piece ran far wider than the piece at fit zoom, so neither is drawn. Parts' own print line
  and its hover plumbing left `PartsList`, which Design alone uses. Printed output did not move: the PDFs of every
  paper are the plan the panels read.
- ✅ **U.10 The legend** (R-09). Open with names by default; folds to a chip that is remembered.
  ✅ Built as described. The legend sits at the canvas's bottom-left — moved from the top-right U.4
  left it at — and opens with names on any window with room; folded, it is a chip reading *Legend*
  whose tooltip names the marks, and a window 1024 px wide or narrower, or shorter than 720 px,
  folds it for the session. That fold never reaches `preferences.json`. `preferences.json` is
  version 2: version 1 wrote `legendOpen: false` out whenever any preference changed, so a stored
  `false` could not be told from the old default, and a version 1 file is reset once to the new one.
  Found on the way: the fold is the window's, so it reads at every size and not only at start-up;
  the toggle had to follow the legend's shown state rather than the stored preference — opening it
  by hand in a small window holds it open, and folding it there writes the choice; and the open
  legend covered the empty bottom-left corner a pixel reference clicked to deselect, so that
  reference now clicks an empty point below the ruler. Printed output did not move.
- ✅ **U.11 Options-row hints** (R-11). Short hints with keys as caps, dropping from the right; `?`
  never drops.
  ✅ Built as described: the work bar's one sentence is three to five hints per tool and state —
  Select with nothing picked, with something, with an outline (Enter edits its sizes); every drawing
  tool idle and between its clicks (Esc cancels; a polyline's Enter, A and Backspace); a tool that
  needs a selection says to press V first while there is none. Each hint is a key cap read from the
  keymap and a few words from `en.json` (`hints.*`), with a rank; `fitHints` keeps the highest
  ranks that fit the room measured, drops the rest whole — never a narrower hint out of turn, never
  a word cut by the edge — and never drops `? all keys`, which is also how the Sheets view's row
  reads now (Ctrl+P, Ctrl+E and `?`). The tools' `howTo` lines stay in the rail's tooltips. Found
  on the way: a tool had no way to say a shape was between its clicks, so `Tool.underway` is new
  (rectangle, circle, arc, line, polyline, measure), and the Esc a hint offers is the Esc the tool
  claims. `Shift+2` in `value-chips.spec.ts` sent the key `2`, which a US keyboard never types
  with Shift, so with a real pointer parked over the board it began a typed rectangle; it presses
  `Shift+@` now. Not fixed, a decision: on a layout that types digits with Shift (French), Shift+`&`
  is both *Fit* and a first digit typed into a rectangle's width. Printed output did not move.
- ✅ **U.12 Change a key in Settings › Keyboard shortcuts** (§2).
  ✅ Built as described: every row of the list has *Change*, which takes the next keys pressed, and
  *Reset* once changed, with *Reset all* above; a key another command in the same place has is
  named, with *Swap* or *Cancel*. A change is heard and shown at once — window, board, tools, Parts,
  tooltips, menus, the rail, the work bar, sentences, macOS's menu, and the main process's Full
  screen and Quit — and kept in `preferences.json` as only what differs (`keyBindings`, file-format
  §6); a damaged entry is dropped, never fatal. Found on the way: a capture by `event.code` would
  have bound AZERTY's `a` key as Q, so a letter is stored as the letter it types and a press its
  binding would not match is refused; the board's tools heard their keys by name, outside the
  keymap, and hear them by meaning now; a key a tool or a Parts row claimed still ran a window
  command other than a tool's — every command skips it now; the polyline's A and L were one command,
  now two; and Space on a focused button is the button's. Esc, Enter, a field's own keys and the
  menu key are fixed; Full screen and Quit need a function key or a modifier, since the main
  process hears them in fields too. On review: take back and Delete now claim the key they act on,
  one rule decides whether a key is heard with Shift for dispatch and for clashes alike, a digit, a
  point or a comma alone is refused (it types a size on the board), Quit is fixed on macOS, and the
  renderer reads the maker's keys through the same validator as the main process. Printed output
  did not move.
- ✅ **U.20 What Chromium still draws itself.** Light scrollbars, radios, checkboxes, a spin button
  and select lists in a dark window; focus rings in the desktop's colour; Ctrl+A selecting the
  whole window; a bare notices window; and Electron's spellchecker, which downloads a dictionary
  that `SECURITY.md` says the app never would. Found 2026-10-15; lands before U.19.
  ✅ Built as described, said once for the whole shell: `color-scheme: dark`, thin scrollbars with
  the shell's thumb (`SHELL.scrollbar`, 3:1 on every surface that scrolls), radios and checkboxes
  in the accent, and the 2 px tan ring on every stop that had none — a `:where()` rule, so any
  component's own ring wins, and one on the board says `--tan-ink`. A select's open list is the
  app's own (`appearance: base-select`): `color-scheme` alone made it dark but kept the system's
  blue on the option at hand. Copies is a `NumberField`. Text is selected only in a field, a
  problem's words and About's version, and Ctrl+A outside a field selects nothing. A field's
  right-click menu — Cut, Copy, Paste, Select all, keys from the keymap — is the app's own; the
  notices are a dialog over About, and *a recent project is gone* the app's own dialog. The
  spellchecker is off. Found on the way: Tab walked out of every dialog into the window behind it
  — it goes round inside the dialog on top now; Print's orientation dots had no focus to see at
  all; with the list the page's own, Escape closing it closed the dialog under it, and a letter
  typed to find an option chose a tool — an open list keeps its keys; `spellcheck: false` and the
  session's spellchecker off still fetched `en-US-10-1.bdic` once a field was typed in, until the
  session was given no language (Chromium still makes an empty `Dictionaries/`); and Settings ›
  Language failed to render on a system whose language is C — Linux's C.UTF-8, and CI's — because
  `Intl` refuses `C` as a language: `languageName` now names such a tag by itself. Scrollbars keep
  Chromium's small arrows, in the thumb's colour: no standard property removes them. Printed
  output did not move.

### Phase 3 — the craft workflow

- ✅ **U.13 Settings › My tools** (R-15). The maker's irons, a default, and starting values for new
  pieces.
  ✅ Built as described, kept in `preferences.json`. A first launch lists the seven irons the Iron
  menu offered before, so nothing disappears; the maker adds, renames, deletes and picks the
  default. The Iron menu lists the maker's irons, then — for a hole set made with an iron they do
  not have, a file from another bench — that iron by its own name, then Custom. A new hole set takes
  the default iron's pitch and name; a new stitch line and a new seam allowance the margin; a new
  fold the thickness, which starts **not set** rather than at the mockup's 1.2: it is a
  measurement of the maker's leather, and thickness compensation (9.1) will read it. Each new
  thing keeps its own copy, so a project evaluates the same on any machine. Found on the way: the
  plan said there was no default margin, but every project carries `defaultStitchInsetMm` and
  `defaultIronPitchMm`, which X8 had the commands read; the app now passes the maker's values, and
  the project's are the fallback with none (X8 amended in `domain-model.md`).
- ✅ **U.14 Value chips beside the selected shape** (R-12). Width, height, corner and margin, edited
  on the drawing.
  ✅ Built as described. A selected rectangle outline shows its width below on a dimension line,
  its height at the right, *r 5.0* off its top-right corner and, with one stitch line following
  it, *margin 3.0* on the leather just inside the stitch line — outside the left edge it had no
  room at *Fit selection*, where the left ruler takes 34 of the 60 px. A click, or Enter on the
  board, opens one with the unit and its number selected; it reads `95-2*3.5` and `3.75in`; Enter
  applies it as one undo step, Tab applies and goes on, Esc puts it back. The chips are not Tab
  stops at rest: the board is one now, and Enter there opens them. They follow every pan and zoom
  in the frame the board moves, keep off the outline, the rulers, a panel opened over the board,
  the legend and the zoom control, and never print — the PDF exported with them showing is the
  same, pixel for pixel.
  Found on the way: **nothing refused a corner** — Properties stored 40 on an 80 × 60 rectangle
  while the board and the PDF drew 30. `roundedRect`'s clamp is `fittedRadii` now, and
  `cornerRoom` says how much room corners have; a chip and Properties' corner fields refuse a
  radius that would never be drawn, saying why, and a second Enter takes the largest that fits;
  a width or height its corners do not fit in is refused the same way (`cornerNeeds`), with the
  least they do. Files that already hold one open and draw as before. The polyline let the Enter that finished a
  run go on to the window, where it would also have opened the selected outline's sizes — it
  claims it now; an arrow key on a field at its limit wrote an undo step that changed nothing; and
  on review, a chip that Tab opened read the outline a render behind, so `95` Tab `60` put the
  width back. Printed output did not move.
- ✅ **U.15 Values in any unit, and sums** (R-12). `95-2*3.5` and `3.75in`, wherever a size is typed.
  ✅ Built as described, ahead of U.5–U.14: it needs no other slice, and U.14 and U.16 read it.
  `parseLength` in `core` reads `+ − * /`, parentheses, either minus, a decimal comma, and mm,
  cm, in and `"` in any case; a unit takes everything multiplied before it, so `1/2in` is half an
  inch. A sum gives every number a unit or none — `3-1/2"`, American for 3½ inches, is 3 mm less
  half an inch as a sum, and a guess either way would store a wrong size without a word, so it is
  refused and the reason says to type `3.5in`. Every millimetre field takes it, the work bar's
  corner radius included; Enter on text a field cannot read keeps the text, marks the field and
  says why beneath (in the work bar, hanging below it); Escape or leaving puts the size back, as
  before. Found on the way: the dimension's *Decimals* field said "mm" after a count.
- ✅ **U.16 Typing while drawing** (R-13). `105` `Tab` `75` `Tab` `8` `Enter`.
  Between the first click and the second, the rectangle's live readout is the value chips (U.14's
  own field, `parseLength`, the same refusals): width, height and corner, with a hint under the
  shape — Tab next, Enter makes it, Esc cancels, the keys read from the keymap — and Properties
  mirrors the three. The first digit typed on the board opens the width chip, with the first
  corner placed or not: before any click the rectangle starts at the pointer (in the board's middle
  when no pointer has been on it, since U.19), and the sizes run
  from the corner towards the pointer either way. Enter makes it (one undo step, the new outline
  selected, its chips at rest), Esc gives it up, a click on the board makes what is typed. A drag
  still draws as before and is sized afterwards by the U.14 chips; Shift still squares a drag.
  Found on the way: the tool's Enter went to the window, which would have opened the sizes of
  whatever outline was selected — the tool claims it now while it has a corner; and a typed
  corner the pointer then left no room for was made smaller without a word — Enter, a click or a
  chip's Enter is refused now, saying why in the corner chip, whose second Enter takes what
  fits. Printed output did not move: a rectangle that is dragged is stored as before, with square
  corners.
- ✅ **U.17 The selection bar: stitch summary and next step** (R-14).
  ✅ Built as described. Under the selected piece — an outline, its stitch line, its hole set, or
  the piece picked by its heading — a bar says *146 holes · 3.85 mm, pitch 3.85 ✓ · runs 24 · 51 ·
  24 · 51 · Cut ×1*, from the functions Properties reads, and *Next: Stitch line › Stitch holes ›
  Seam allowance*: done steps checked, the first left a button that makes it with My tools' margin
  and default iron, one undo step, and later ones plain. Which is done is read from the derivation
  graph, so a *Stitch + allowance* piece, whose outline follows its stitch line, has its holes
  next; the card pocket's hand-drawn stitch line counts. It sits under the piece's dimension lines
  and chips, its left edge on the piece's, over the piece and its caption where there is no room
  under, and is left out where there is room for neither — `placeSelectionBar` in `render`,
  property-tested never to cover the piece, a chip or a control at any zoom. It hides while a
  drag or a shape is under way, and takes no press but on its button, so the board under it draws
  as before. F6 goes into it from anywhere and out again (Esc too), a key like any other in
  Settings › Keyboard shortcuts; Settings › Appearance turns it off (`selectionBar` in
  `preferences.json`), and then there is no bar and no key. Never printed: it is not on the board.
  Found on the way: **a set's runs counted its corners unevenly** — the first corner in two runs,
  the others in one — so the sample's equal short sides read 24 and 23, beside 146 holes the runs
  added to 147. Each run now counts every hole on it, its corner holes included (24 · 51 · 24 ·
  51, as a maker counts an edge and as mockup 14's 15 · 24 · 15 already read); the holes did not
  move. Mockups 02, 05 and 14 offer *Seam allowance* as the outer's and the card pocket's next step,
  but a piece drawn outline first is refused one (it would be a second outline): the bar shows it
  done, its margin being the allowance, and offers it only where a seam has no edge yet. On
  review: a piece made by Mirror read as unstitched, its stitching being derived from the
  original's — counterparts now count as their originals do; a bar flipped over a piece with a
  dimension on top ran into its caption — the number's reach is one measure in `render` now; and
  a stitch line that failed, or a hidden hole set, counted as made — a failed step is said in
  Problems' words and nothing after it offered, and hidden holes are not counted, as the board's
  caption does not count them. Printed output did not move.
- ✅ **U.18 Drawing defaults in Properties** (R-16).
  ✅ Built as described. While a Draw tool would make a new piece — Rectangle, Circle, Arc, Line
  or Polyline, drawn as Outline or Stitch + allowance — and nothing is selected, Properties shows
  *After the outline*: the stitch margin and the default iron, under the rectangle's sizes while
  one is drawn. They are My tools' own values, not a copy: a change there is a change in Settings,
  and the reverse, kept in `preferences.json`; *Stitch + allowance* grows its edge by that margin
  and the selection bar's steps make the stitch line and the holes with them. It shows before the
  first click, not only between the rectangle's two, because *Stitch + allowance* applies the
  margin when the shape is made and a polyline has no sizes to show. Found on the way: nothing
  needed joining — U.13 had already put one source behind both paths. Printed output did not move.
- ✅ **U.19 The pass, checked as one thing.** Every size, keyboard only, high contrast, 2×; the
  pixel baselines and the README's pictures retaken.
  ✅ *Open → draw → stitch → arrange → check sheets → print* walked in the running app at 1920,
  1440, 1280, 1024 and 860 × 600, a fresh window each: at 1×, at 2× (`devicePixelRatio` read 2),
  in `forced-colors` and with reduced motion, and by the keys alone. Reduced motion holds: the only
  motion is colour on `--motion`, which the reduce rule turns off, and nothing animates. Every
  token pair with a promised ratio has its test now — `text-dim` on the shell surfaces it is used
  on, body text, a severity's words and text on the accent had none. The axe scans cover a size
  being typed with *After the outline*, the selection bar with focus in it, a key's clash in
  Settings, and a lit right-click menu, which no scan saw. UI Foundations' identity test, on a
  1920 × 1080 window of the sample and a piece drawn as *Stitch + allowance*: **9 of 10**, item 9
  still partly — a dimension's number breaks its line now, but has no arrowheads (4.10b, 1.6). The
  flip reason (U.6) is one short line: *Follows Outline: move that instead.* The pixel reference
  that moved is the stitched panel's, by the legend alone. Printed output did not move: nothing in
  `export`, `persist` or the pure layers changed, and no golden or `.lcp` fixture.
  Fixed on the way, each with its test: **the keys alone could not draw** — typing on the board
  started a rectangle only at a pointer that had been over it; **a size typed by the board's edge
  went to the wrong chip, or nowhere** — a chip with no place in view was left out of Tab's way
  while drawing, so `105 Tab 75` could make a 75 mm corner, or a rectangle as tall as the pointer
  said; **the legend sat on the left ruler**, cutting its numbers to "−1" since U.10; **closing a
  dialog dropped the focus**, so after Esc out of Print a maker on the keys started again from the
  top of the window, and so did `Ctrl+2` from a control only Design has; **the right-click menu's Delete read at 4.2 : 1** under the pointer, and the
  menu sat outside any landmark (U.20 had placed the field menu, not this one); **a piece's row
  with a Cut count had a blank second line** wherever its whole name did not fit on one, its marks
  wrapping rather than its name (U.8). Q27 is fixed, and the README's four pictures are retaken.

### Known issues and findings

| # | What | Where it was found | Plan |
|---|---|---|---|
| ✅ **Q27** | `pnpm docs:media` failed where `/tmp` is its own filesystem (`renameSync` across devices, `EXDEV`), and never loaded the window while it recorded video — on `develop` as well. So the README's pictures still showed the bar before 8.7, and `print.png` the verification block before 7.8 | 8.7, retaking the README pictures | ✅ U.19: the PDF's page is copied, not renamed. The recording: on the Linux desktop it was found on (a Wayland session), Playwright 1.64 never let Electron 44 load a window it recorded — a bare `BrowserWindow` too, with Electron on X11 or Wayland, with or without the GPU — while under Xvfb in the pinned Playwright container it loads at once. Other desktops are untested. So `pnpm docs:media` runs there now (`tools/media.mjs`), installing poppler, ffmpeg, gifsicle and pngquant for the run. The spec had also gone stale with U.10: the legend, open at the board's foot, took the lining's drag and the pocket's corner; it is folded while drafting. All four pictures retaken and looked at |

### Release engineering

| # | What | Plan |
|---|---|---|
| ☐ **R8** | R1's other platforms: no platform but Linux has a full A–H row in [`print-verification-log.md`](print-verification-log.md) | Record a row through *Print* on macOS, and on Windows from the default viewer at *Actual size*. Moved here from 1.3.5's R1 on 2026-10-09 |
| ☐ **R9** | `Ctrl+0` changed meaning in U.4: it fitted the pattern until 1.5 and is *True size* now, with fitting on `Shift+1`. The changelog's line is the pull request's title, which names the new keys but not the change | When 1.5's release pull request opens, put one sentence at the top of its notes, and of the GitHub release's: *`Ctrl+0` now shows true size; fit the pattern with `Shift+1`.* `getting-started.md` already says so. And from U.8: *In Parts, Space on a focused row now hides or shows it (it used to select it, as Enter still does).* |
| ☐ **R10** | U.7's window edited flag is unverified on macOS, the one platform that shows it: it was checked on Linux, where Electron ignores it, and through the test host and a mock of `setDocumentEdited` | Check 12 of [`release-checklist.md`](release-checklist.md) on a real Mac, with the packaged dmg: an edit sets the window's edited dot, *Save* clears it. Tick this only then, saying the macOS version and the date — never from Linux, the test host or a mock |

### Decisions this release needs

Each has a recommended default in the plan, which its slice takes unless the maintainer decides
otherwise. A row marked **Decided** is settled by the maintainer; any other is the default its
slice took, or will take, and is still open.

| Slice | Question | Recommended |
|---|---|---|
| U.3 | On a French or German keyboard, does a tool key follow its letter or its position? | Its letter: R stays R. Punctuation and digits keep their position, shown as the local character — but zoom's + and −, named by their symbols, follow what the key types (decided on review) |
| U.4 | The menu says *True size*, but nothing calibrates the screen | **Decided 2026-10-13:** kept. `getting-started.md` says to check the screen with a ruler first; a calibration step stays in *Later* |
| U.4 | Does `Ctrl+0` centre on the selection? | **Decided 2026-10-13:** no, it zooms about the board's centre. `Shift+2`, then `Ctrl+0`, frames a piece at true size |
| U.6 | When is the spacing "matched", and when does its line warn? | **Decided 2026-10-13:** matched when Spacing shows as the Pitch, to the two decimals both are shown at (`formatSpacing`); the warning glyph only when Problems warns about that set (a quarter of the pitch, `SPACING_DEVIATION_FRACTION`), so the line and Problems never disagree. A smaller warning would be the domain's to raise, so Problems says it too |
| U.6 | An outline showed two fields called *Name* | **Decided 2026-10-13:** the piece's is *Piece*, beside *Cut* |
| U.6 | Flip on a stitch line or hole set is always refused, and its reason takes Arrange's first rows | **Decided 2026-10-13:** stays refused, with its reason; U.19 words the reason shorter |
| U.6 | A hole set's runs add to 147 beside 146 holes: a corner hole is counted in both its runs | **Decided 2026-10-13:** settled in U.17, before the selection bar shows runs. U.17: only the first corner was counted twice. Each run now counts every hole on it, its corners included, so equal sides read equal (24 · 51 · 24 · 51) and the runs add to the set plus one per shared corner |
| U.5 | Below 1280 px Properties is a strip: may the maker dock it there anyway, as the rail can be opened while narrow? | **Decided 2026-10-14:** no. `]` opens it over the board, as §5 says, and a press on the board closes it |
| U.5 | Does a press on the board close a panel open over it even while the maker selects there? | **Decided 2026-10-14:** yes, as R-04 says; the press also selects. At 1024 px, `]` reopens Properties after picking a piece |
| U.5 | Is focus mode remembered across a restart? | Built as recommended — no, it is the session's, like the view; the folds are remembered. Not yet decided |
| U.5 | Does Esc clear a selection before it leaves focus mode? | **Decided 2026-10-14:** yes. One press, one thing: Esc clears the selection, and the next one leaves focus mode |
| U.7 | If the project's name joins the Project menu's button, how is a project renamed? | **Decided 2026-10-14:** *Rename…* in the Project menu turns the name back into its field, and a whole rename is one undo step. F2 stays the Parts tree's (U.8) |
| U.7 | Print's problems half when the drawer holds only infos (an empty part, uneven runs) | **Decided 2026-10-14:** a fourth state, *to note* — the dot and the infos' count. A check means the drawer is empty |
| U.7 | What count does Print's problems half show? | **Decided 2026-10-14:** the worst severity's alone, as R-06 draws it. Its tooltip and accessible name give every severity's count, from the one count (`countBySeverity`) the drawer and the export notice read |
| U.7 | One paper list, as 7.4a had, or paper and orientation apart, as mockup 08 draws them? | **Decided 2026-10-14:** apart. Each paper says its sheet count and each orientation's tooltip what it takes, before it is chosen; the summary keeps the scale and the taping |
| U.7 | Does *Export PDF*'s main half remember the folder it last saved to? | **Decided 2026-10-14:** no; it does what *Export PDF* did. Remembering the folder would be a feature of its own, scoped separately |
| U.8 | Do pieces start open or closed, and is a fold remembered? | **Decided 2026-10-14:** pieces start open, and a fold lasts the session. A selection on the board opens its piece and reveals its row |
| U.8 | Does selection follow focus in the tree? | **Decided 2026-10-14:** yes. ↑ and ↓ select the row they reach, and Delete and Properties act on that selection. Tabbing into the tree changes no selection: focus lands on the selected row, or the first |
| U.8 | Rename on the right-click menu? | **Decided 2026-10-14:** no. F2 in the tree, heard only there, and the Name field in Properties |
| U.8 | A hidden piece shows the crossed eye and the crossed printer | **Decided 2026-10-14:** both stay: one says it is hidden, the other what that means for printing. A name that then wraps to two lines is acceptable under the wrap rules (F.6, §7.1) |
| U.8 | Lock and eye covered the hole count on hover | **Decided 2026-10-14:** the count stays in sight at rest, on hover and on focus. The actions' room is kept at every row's end, so nothing moves; names wrap between words, never truncate |
| U.9 | Measure on the Sheets view, where no tool acts today? | Left out, and added to *Later* |
| U.10 | Every saved preferences file says the legend is closed, chosen or not | Built as recommended: preferences version 2 opens it once, since version 1 never recorded a choice. Not yet decided |
| U.13 | A default leather thickness "used by folds whose own is not set" | Written into each new fold; evaluation never reads a preference (built so in U.13; the default starts not set) |
| U.14 | When the four corners differ, what does the corner chip show and set? | **Decided 2026-10-15:** it reads *mixed*, and a value typed there sets all four, one undo step; a corner each is Properties' to type |
| U.14 | Are the chips Tab stops at rest? | **Decided 2026-10-17:** no, as R-12 says. The board is one Tab stop; Enter there opens the first chip in view; while one is open, Tab and Shift+Tab go through the chips, and past either end out of them |
| U.14 | A width or height that leaves the corners larger than the rectangle draws them | **Decided 2026-10-17:** refused, saying why, and Enter takes the least size the corners fit in — on the board and in Properties alike. A stored radius is always the one drawn |
| U.14 | Chips near the legend or the zoom control | **Decided 2026-10-17:** kept clear of them, as of the rulers and panels — a chip slides along its line, or is left out; never laid over one |
| U.16 | Where a typed rectangle goes before any corner is clicked | At the pointer; with no pointer on the board yet, in its middle (U.19) |
| U.17 | Seam allowance on a piece drawn outline first, which the command refuses (a second outline) | Shown done: the margin between edge and seam is the allowance. The button appears only where a seam has no edge yet; mockups 02, 05 and 14 drew it on the outer |
| U.17 | Which selection shows the bar | An outline, a stitch line, a hole set, or a piece by its heading — its piece's stitching. Not a fold, cut-out, marking, dimension or two things |
| U.17 | No room under the piece or over it — the piece framed by `Shift+2`, or zoomed past the board | Left out, as a chip with no place is, and F6 then does nothing. Fitting the selection could keep the bar's room; not done |
| U.17 | A step that failed (a margin too wide for the piece) or a hidden hole set | Not made: a failure is said in Problems' words, a hidden set as hidden, and no button follows either; Cut ×N stays on line 1 |
| U.17 | What F6 does away from the board | Goes into the bar from anywhere but a field, and back to the board from inside it |
| U.11 | The old sentence also said "scroll zooms · middle-drag pans"; the hints have no room for it | Left to `?` all keys, which lists both. Nothing else taught is a gesture the shortcut list does not have: Ctrl, which suspends snapping, is not offered until it is listed there |
| U.11 | Three to five hints, with or without `? all keys` | With it: a tool's own hints are two to four, so the row is never more than five caps |
| U.11 | Which hint drops first, when the mockup drops "from the right" | The lowest ranked, as R-11's text says — the keys a maker is least likely to guess stay longest (a polyline's A before its Backspace) |
| U.11 | On French layouts Shift+`&` is *Fit* and types a `1` into a rectangle's width | Not decided: one press does both today. Letting the window's key win would leave no digit row to type a size with |
| U.19 | Typing a size with no pointer on the board: U.16 started nothing, so a maker on the keys alone could not draw | In the middle of the board as shown. Every action works from the keyboard (§2); a corner by the pointer stays the rule whenever there is one |
| U.19 | A typed size's chip with no place in view while drawing — U.14 leaves it out, so `105 Tab 75` put the 75 in the corner, or nowhere | Pinned to the nearest place in view, over a control if it must. Never laid over one (U.14) stays the rule for a selected outline's chips, which are not typed blind |
| U.19 | Design does not frame a project when it opens: the sample opens at 79 % about the origin, partly off the board below 1440 px | Not changed — the camera has always stayed put, and nothing decides otherwise. Framing on open is a small feature of its own, if wanted |
| U.19 | The README's `design.png` shows the legend folded to its chip | Open, it covers the pocket's edge over the fitted pattern. Shown folded, as a maker who wants the room has it |
| U.20 | Electron's spellchecker: keep it, or turn it off? On Linux it downloads an English dictionary whatever the interface language, and the leather words are not in it | **Decided 2026-10-15:** off. A name is a few words, and `SECURITY.md` says the app makes no network connections |
| U.20 | A right-click menu in a text field | **Decided 2026-10-15:** Cut, Copy, Paste and Select all, in the app's own menu with its words from `en.json`; nothing outside fields |
| U.20 | Which text can be selected? | **Decided 2026-10-15:** the fields, a problem's words, and About's version — what a maker might paste into a bug report. Nothing else. About shows no log folder to select: its button opens the folder |

---

## 1.6 — after the refinement

What 1.3 did not finish and 1.4 does not take moved here on 2026-10-07, when 1.4 was split
([1.3.5's record](history/roadmap-1.3.5.md) says why): word for word, but for 8.9, which now reads the one tag
form R4 decided. It was 1.5 until 2026-10-08, when the UI refinement took that number, and it
becomes *the next release* once 1.5 has shipped. The order within each group is the suggested
order of work, and *The window* comes before the other groups.

### The window

Left from 1.3's *The window*: nothing says a new release exists.

- ☐ **8.9 Update discovery.** The main process asks GitHub for the latest release and compares it
  with the running version: *Check for updates* in Settings › Updates, the result in About, and a
  quiet mark on Settings when one exists. It links to the release page and installs nothing (see
  *Not planned*). The app's first network request, so `SECURITY.md`'s "no network connections"
  changes with it, in an ADR; the Flatpak skips it, as Flathub updates it. Reads tags in the
  `leathercad-v` form (R4).

### Drawing and editing

- ☐ **3.10 Guides, alignment and distribution.**
- ☐ **3.12 Convert to drawn path.** The explicit escape hatch for a circle someone wants to squash
  or an arc they want to reshape freely, saying plainly that it stops being a circle or an arc.
  Until then, 3.7 refuses those transforms.
- ☐ **4.10b Dimensions drawn like drafting.** Arrowheads, with the number breaking the line — the
  one item of the visual identity test that only partly passes. It prints, so it is a measurement
  change, not a canvas treatment.
- ☐ **4.14 A row of holes along a line** that is not a stitch line (carried forward from Phase 4).

### Output

- ☐ **7.6c Printing from Windows.** A transport that can be told not to scale. SumatraPDF is the
  candidate (GPL-3.0, beside the app). It needs its own ADR and a gauge measured on paper. Until
  then the preview saves the PDF.
- ☐ **6.4 The rest of the export dialog.** Presets, layers and bounds. Printing only some sheets is
  the Print Preview's since 7.6.
  `paperOptionsFitting` already answers "what would fit", so the dialog reports rather than
  computes.
- ☐ **7.2 Taped parts, finished.** Edge arrows and a printed assembly sheet. A taped part is never
  turned: since 7.8 a part is taped only when it fits whole neither way.
- ☐ **7.5 Calibration.** Per-printer correction factors, with a ±2 % guard. The verification
  gauge already shows when a printer is off.

### Known issues and findings

Everything found along the way that is not fixed yet, with where it was found. The ones marked
**bug** come first.

| # | What | Where it was found | Plan |
|---|---|---|---|
| ☐ **Q33** | **bug** · A hardware hole is checked by its centre alone. `OUTSIDE_PART` and `HOLE_TOO_CLOSE_TO_EDGE` read a hardware hole's centre (`holePoints` in `validate.ts`) and never its radius, so a 6 mm hole centred 2 mm inside the edge cuts 1 mm through it and nothing is said, and a 4 mm rivet hole whose rim crosses the edge is only *too close* | The product roadmap refresh (2026-10-17), reading the rules for hardware clearance | Measure a hardware hole by its rim: off the leather when its circle leaves it, too close when the rim is nearer an edge than the clearance — and decide whether a stitch hole's 1.5 mm is the right clearance for a rim. A stitch hole stays a point. Property tests over centre and radius. 9.23 builds on it |
| ☐ **Q4** | Problems have no stable identity across edits. The panel keys by content today, so nothing breaks yet | UI audit, deferred opportunities | Give a problem a stable key before anything relies on one — 9.16, accepting a warning, will |
| ☐ **Q31** | What resizing a piece should do. Scale acts on what is selected, so an outline scaled alone leaves its slots where they were, and a whole piece scaled evenly grows its rivet holes and labels with it — a 4 mm rivet hole becomes 6 mm. The stitch margin and the iron's pitch already stay | Q30 | Decide which sizes a piece keeps (hardware, labels, card slots) before Scale takes the whole piece |

#### Left from the independent QA pass (2026-09-24)

The finding still open from the outside QA pass over `main` at `d54b2d7` (v1.0.x). Its fixes are
in the [record](history/roadmap-1.1-and-1.2.md) and, for Q17, in 1.4's 7.8. The id in brackets is
the report's.

| # | What | Severity | Plan |
|---|---|---|---|
| ☐ **Q15** | (S1) A dimension to a rounded or seam-allowance corner reads less than the piece: a corner anchor on an arc is the arc's middle, and an outward allowance rounds corners the maker never rounded (97 × 67 reads 94.9) | P2 · investigate | Decide what a corner of a rounded outline *means* to a maker before changing it; 4.10b |

**What the QA pass could not test,** kept here until someone does: physical 1:1 prints on real
printers and viewers, including *Actual size* and `/PrintScaling /None` (R1); taping a multi-sheet piece physically; real OS
dialogs (special characters, overwrite prompts, `.PDF` in capitals); crash recovery after a real
process kill; `pnpm test:visual` and `pnpm test:packaged`; HiDPI, Windows and macOS.

**Performance, recorded as information, not targets:** building the display list for the
636-hole benchmark strap takes 87 µs (13 µs before F.7); offsetting a 500-point traced outline
takes ~74 ms, over the 50 ms budget on its own; and a huge drawing at the smallest pitch makes
millions of holes, so a hole-count budget may be wanted one day. None is to be optimised until it
is felt.

### Release engineering

| # | What | Plan |
|---|---|---|
| ☐ **R6** | The renderer loads from `file://`, which keeps the `GrantFileProtocolExtraPrivileges` fuse on | Serve it from a custom `app://` protocol, then turn the fuse off (ADR 0014) |
| — | Code signing | **Not done, by decision** (2026-09-24). LeatherCAD is free and open source and signing costs money every year, so installers ship unsigned; [`getting-started.md`](getting-started.md) says how to open them and how to check a download against its build provenance. If it is ever wanted, electron-builder signs when `CSC_LINK` is set |

---

## Later

Candidate milestones, each a theme, in the order suggested for the work after 1.6. A milestone
becomes a release only when it is next — named, and its items marked, in a change of its own — so
nothing here is a promise, and the order may change as makers say what they need. Why these themes,
why this order, and what depends on what are drawn in [`product-roadmap.md`](product-roadmap.md).

The numbers are Phase 9's from the 1.0 record, continued from 9.12 on 2026-10-17. The gaps are items
that moved: DXF (9.4) into 1.1 as 6.5, Windows and macOS (9.8) into 1.0, and nesting (9.9) to *Not
planned*.

### Pieces that fit

Two edges sewn together must have the same holes, and a pocket must hold what it is for. Today each
piece is checked on its own, and only a mirror makes two hole counts equal
([domain-model](domain-model.md) §7).

- **9.6 Seam pairing and hole-count parity** — catches a genuinely expensive mistake. Two runs of
  holes — on two pieces, or on one piece folded over — are paired as a seam, and a seam whose counts
  differ, or whose lengths differ by more than the slice decides is sewable, is a problem naming
  both (`SEAM_HOLE_COUNT_MISMATCH`). The selection bar's third line, which U.17 leaves room for and
  builds nothing of (R-14), reads the pair: "Matches Outer, right run 15 = 15".
- **9.12 Thread, and the cutting and stitching list** — the thread a seam takes, beside its pair in
  the selection bar (R-14's "Thread ≈ 0.9 m"), and one list for the project: the pieces to cut and
  how many, the holes and thread per seam, the hardware, and the leather all the pieces take. One
  home for the thread figure [domain-model](domain-model.md) §6.3 asks for and for
  [printing](printing.md) §12's hole and thread report. Its formula is this item's to decide: those
  two say 4–5× and 4× the seam's length, and a seam's thickness changes it.
- **9.13 Alignment marks on mating edges** — marks at chosen holes along a seam, printed at the
  matching hole on both pieces, so they line up when glued and stitched. Derived from the seam, so
  they follow it. Printed, never cut: a notch in an edge that will be burnished is a flaw in the
  goods. Not the registration crosses that line up paper sheets (7.2a). Today a marking line whose
  purpose is *Alignment* is drawn by hand.
- **9.14 A pocket that holds what it must** — the first requirement a maker states. The clear width
  and depth inside an open stitch line, up to its opening, is geometry the board already has, so it
  comes first as a reading. Then the maker says what the pocket holds — a card (ID-1, 85.60 × 53.98
  mm) or a size they type, such as a banknote's — and a pocket too small for it, with the maker's
  ease, is a problem. Stored as metadata, since it changes nothing drawn, cut or printed
  ([file-format](file-format.md) §4.5, rule 3). One requirement on one kind of thing, not a
  requirements engine.

**Needs:** nothing unbuilt — runs, anchors and hole reports exist, and U.17's bar has room. To
decide: whether a seam alone keeps the format version while printed marks bump it; where a
requirement attaches; and the ease, which is not set until the maker sets it, as the leather's
thickness is not (U.13).

**Done when:**
- two runs paired with different counts make one problem naming both, and equal ones read *Matches*;
- the list gives thread per seam, and the leather each piece takes;
- marks print at matching holes on both pieces and measure the same distance along each on paper;
- a card pocket shows its clear size and, once an ease is set, warns when the card will not go in;
- property tests: pairing is symmetric, marks land on matching holes, a larger pocket never fits
  less.

**Not in it:** changing a count to match (9.17 offers that); pieces placed as they are stacked
(*Exploring*); ease that follows the leather's thickness (9.1); a table of every currency's notes.

### Problems that explain themselves

Every problem is listed, named and shown today (4.12, U.7), but a beginner cannot always act on one,
and a warning the maker has weighed comes back on every print.

- **9.15 Every problem explained** — beside each problem, why it matters to the leather and what to
  do about it, in the app's words ([ADR 0018](adr/0018-interface-language.md)). Words only, no rule
  changes; a code without its explanation fails a test, as the catalogue's audit does today.
- **Q34 Printed text too small to read** — DR5's rule, `TEXT_TOO_SMALL_TO_PRINT`, was to arrive with
  document text in 4.11 and never did: a label has had its own height since 4.11b, and nothing
  checks it (`INVARIANTS_WITHOUT_A_CODE` still says *Planned*). [domain-model](domain-model.md) §8.6
  gives its threshold, 1.5 mm.
- **9.16 Accepting a warning** — the maker says a warning is meant, and it stops nagging: still
  listed, marked accepted, and back as soon as what it is about changes. An error cannot be
  accepted. Kept in the project as codes and the features they name, never words. Needs Q4 (1.6), so
  that an acceptance finds its problem again after an edit.
- **9.17 Fixes offered with a problem** — where one correction is plainly safe, the problem offers
  it: a stitch margin that clears the edge, the iron that matches the spacing, the spacing that gives
  a seam equal counts. Pointing at it previews it through the store's preview, which never touches
  history; choosing it is one undo step; nothing is fixed without the maker choosing. A fix is an
  ordinary command proposed from the problem, and one that no longer applies is refused, saying why
  (X1).

**Needs:** Q4 for 9.16; the store's transactions, built, for previews; 9.6 for the fix most worth
having.

**Done when:**
- every code the drawer can list has its explanation, and an audit test holds it;
- an accepted warning survives unrelated edits and a save and reopen, and returns when its cause
  changes;
- every fix previews without an undo step, applies as one, and is refused with a reason once it no
  longer fits.

**Not in it:** fixing anything automatically; fixes for refusals, which are never listed; blocking
export; suggestions that no rule explains.

### Start from something

A new project is blank, and the sample wallet (8.3) is the only worked example. A maker's own good
parts cannot be carried to the next project.

- **9.18 New project from a template** — *New project* offers a few worked projects beside the blank
  one — a card holder, a bifold, a key fob — each opened untitled from the app as the sample is
  (`readSampleProject`), the sample wallet first among them.
- **8.8b Copy, Paste and Duplicate of features,** after 8.8. Neither exists, and they carry a
  domain question: what a pasted stitch line follows when its outline was not copied with it. A
  command with property tests, not a menu item. A part pastes into another project too, carried as
  a `.lcpart`-shaped copy ([file-format](file-format.md) §8).
- **9.7 Templates** — a part saved to a library and inserted again (was 8.1): a copy with its
  derivations re-pointed, never a live link ([domain-model](domain-model.md) §9). Parameterised
  templates moved to *Exploring* on 2026-10-17.

**Needs:** the sample's untitled opening (8.3) and duplicate-part re-pointing (4.3b), both built;
8.8b's domain question answered before 9.7, which inserts a part the same way.

**Done when:**
- each template opens untitled, with no problems, and prints;
- a pasted piece keeps its stitching, re-pointed to the copies, and nothing in it follows a feature
  it left behind;
- an inserted part evaluates the same on a machine that has never seen the library.

**Not in it:** parameterised templates; a shared or online library; a template that changes the
projects already made from it.

### Bring patterns in

Most makers arrive with patterns already drawn — in Inkscape or Illustrator, or on card. None of it
comes in today except by drawing it again.

- **9.19 Curves that can be stitched** — analytic offsetting refuses cubic segments
  ([geometry](geometry.md) §6.2), so no stitch line can follow a curve that an import or a curve
  editor brings — or a circle squashed after 3.12, if that makes cubics, which 3.12's slice should
  weigh. Before 9.11, an offset through arcs fitted to the cubic within the flattening
  tolerance would build that stitch line instead of refusing it; whether to do that or wait for 9.11
  is the slice's to decide. Pure geometry under [geometry](geometry.md) §12's definition of done, so
  it can start whenever there is room.
- **9.20 SVG import** — an existing vector pattern, opened as pieces. Its size is read from the
  file's units, then shown and confirmed before anything is made: px is 96 to the inch by the CSS
  rule Inkscape follows, but Illustrator writes px at 72, and a file that gives no size is asked
  about, never guessed. Closed shapes become outlines, and cut-outs by what they lie inside; open
  ones become markings, unless a layer's name says otherwise; small circles along a path are
  reported as likely stitch holes rather than made into hardware. Text, images, clipping and effects
  are listed as left out. The importer is a package beside `export`, with its own Y flip
  ([architecture](architecture.md) §2), and its XML parser a new dependency, so an ADR comes first.
- **9.2 Tracing from images** — import a photo or scan, set its scale from a known dimension, trace
  over it. The image is kept in the project's `assets/`, which [file-format](file-format.md) §1
  reserves and nothing writes yet: a format change.

**Needs:** 9.19 before an imported curve can be stitched; the parser's ADR; images in the `.lcp` for
9.2.

**Done when:**
- a 100 mm square saved in mm, in pt and in Inkscape's px imports at 100.0 mm, one in Illustrator's
  px is read at 72 to the inch or asked about, and a file with no size asks;
- everything left out is listed by kind and count;
- a stitch line follows an imported curve within the flattening tolerance;
- a scan scaled from a known length reads that length.

**Not in it:** turning an image into lines by itself; straightening a photo taken at an angle;
importing PDF or DXF.

### Leather has thickness

A fold already stores the leather's thickness, and nothing reads it. A pattern drawn flat comes out
short wherever leather wraps or folds over leather.

- **9.1 Thickness and wrap compensation** — the gusset problem. The most requested thing in every
  leathercraft forum, and the fold-line model already carries the fields for it. In steps, each
  checked on real leather and recorded: the length a fold needs, as a reading from its thickness and
  what lies inside it; then that length applied to the outline, as a derivation; then a gusset's
  length along its seam (9.6). To decide first: whether thickness belongs to a piece or, as today, to
  a fold.
- **9.21 Skive bands** — where to thin the leather: a band derived inward from an edge at a width,
  and printed. Today a marking line whose purpose is *Skive* is drawn by hand; a band follows the
  edge as a stitch line does, a new row in the derivation table ([domain-model](domain-model.md)
  §4.2). The thinner edge is what 9.1 then reads there.
- **9.22 Grain direction** in the model: an arrow on the part, which turns with it on paper (7.8
  turns parts to save sheets).

**Needs:** 9.6 for gussets; where thickness lives, decided.

**Done when:**
- a fold reports the allowance it needs; applied, the outline grows by that, and undo removes it;
- a bifold cut from such a pattern closes flat — a physical check, recorded as a print check is;
- the grain arrow prints, and turns with its piece.

**Not in it:** folding or draping simulation; stretch; anything 3D.

### Hardware that fits

A hardware hole knows its type and diameter, nothing else, and stays where it was put when its piece
changes ([the 4.7 design](superpowers/specs/2026-09-05-fold-mark-hardware-design.md)).

- **9.23 Hardware clearance** — first from the geometry already there: a hardware hole's rim against
  the edge (Q33), against a stitch line and its holes, on a fold, and over another hole. Then, with
  9.3's real sizes, a cap's or a ring's footprint against the same.
- **9.3 Hardware library** — snaps, rivets, D-rings, zips and magnets, with real dimensions. The
  maker's own, as their irons are (*My tools*, U.13), starting from a few common sizes; a placed
  piece of hardware keeps its own dimensions, so a file opens the same on any machine
  ([domain-model](domain-model.md) §6.2).
- **9.24 Hardware placed from an edge** — "12 mm in from that edge", kept as the piece changes: a
  derivation on the same feature, as the 4.7 design records, and so a format version, since it
  changes what is cut ([file-format](file-format.md) §4.5).

**Needs:** Q33 for the rim; 9.3 for footprints. The first half of 9.23 needs only Q33, and can move
earlier.

**Done when:**
- a hole whose rim crosses an edge is an error;
- a rivet over the stitching names the holes it hits;
- a snap placed from an edge stays that far in when the piece is widened.

**Not in it:** a supplier's catalogue shipped with the app; whether a post is long enough for its
layers, which needs layers (*Exploring*).

### Robust shapes

Alongside the others: pure geometry that nothing here waits on, and that *Bring patterns in* gains
most from.

- **9.11 Robust offsetting, written here** — the concave outlines analytic offsetting refuses, and
  stitching *across* a concave join such as a thumb scoop. Two bindings were tried and rejected
  (ADR 0008); it will be written, not bought.
- **9.5 Boolean operations** — built together with 9.11, since both have to find and remove the loops
  an operation creates.

**Done when:** [geometry](geometry.md) §6.3's rules hold — integers at the quantum, `offsetPath`
still the entry point, areas tested rather than bounds; a stitch line follows a thumb scoop; and
`area(A ∪ B) + area(A ∩ B) = area(A) + area(B)` holds as a property. **Not in it:** nesting.

### Also later, each already decided in principle

- **A general curve editor** (Béziers) on top of 3.9. An edge drawn with it can be stitched only
  after 9.19.
- **Pieces gliding** between Design and Sheets.
- **Radial, angular, chained and baseline dimensions,** and dimensions between parts.
- **A screen-calibration step,** which would make 1:1 literal on screen too.
- **Draw tools in their role's colour** — still an open question in the UI decisions record.
- **Measuring on the sheets.** U.9 left it out: no tool acts on the Sheets view, so it would be new
  behaviour, not a change of window.
- **A radius-aware corner policy,** and **slot or diamond holes, and leaving single holes out**
  ([domain-model](domain-model.md) §3.3, §6.1).
- **`.lcp.json`,** a project as plain JSON for version control ([file-format](file-format.md) §8).

### Exploring — neither planned nor rejected

Worth thinking about, and none of it a commitment. Each says what it would wait for.

- **9.10 A constraint solver** — only if real use proves the derivation graph insufficient.
- **Pieces placed as they are stacked.** A wallet is layers glued and then stitched through; placed
  that way, the app could check holes through several layers, hardware across them and the stack's
  thickness. Flat, never folded or 3D. After seams (9.6) show the need.
- **Parameterised templates** ("card slot, width 95 mm"), from 9.7: named parameters read by shapes
  and derivations. After the library, and watched for creeping toward a solver.
- **Laying out pieces on a photographed hide,** by hand — grain, flaws, the best leather where it
  shows. After 9.2 and 9.22. No optimising.
- **A shared pattern library, as files.** A `.lcp` already opens the same anywhere; sharing happens
  outside the app, with no accounts or servers in it.
- **Comparing two versions of a design.** *Save as* serves today.

Recorded from the QA pass (2026-09-24), with no work planned:

| # | What | Severity | Plan |
|---|---|---|---|
| **Q20** | (S6) Hidden parts, label-only parts and parts with a hidden outline are left out of the PDF without a notice | intentional | The Sheets spec's *Not printed* labels |
| **Q21** | (S7) *Cut 2* on a mirrored pair does not say to flip the template for the second piece | deferred | The Sheets spec §11 |
| **Q22** | (S8) Saving rounds the mirror-line angle to six decimals, so a reopened document differs in memory by ≤ 0.0003 mm per metre | negligible | Recorded in 4.8a; nothing to do |
| **Q23** | (S9) Ink reaches up to half a stroke (0.125 mm) past the printable area, because packing uses geometry bounds | negligible | Nothing unless a printer clips it |
| **Q24** | (S10) Horizontal and vertical dimensions read 0.0 after a 90° rotation; the UI creates only aligned ones | API only | When those kinds reach the UI |

## Not planned

Each with its reason. Reviving one starts with new evidence.

- **Auto-update,** meaning a release installed from inside the app. 8.9 only says one exists.
- **Material, cost or bill-of-materials metadata,** and **a notes field separate from labels.** Not a
  pattern editor's job, and a label prints what a note would say
  ([the 1.0 audit](superpowers/specs/2026-09-23-pre-1.0-product-audit.md) §2.9).
- **3D — a 3D view, folding or draping.** A boundary of the product, not a deferral
  ([product-spec](product-spec.md) §2).
- **An onboarding wizard.** The empty states, the sample and the hints teach where the maker is
  already working.
- **Drag handles for values that are already typed.** A gesture less exact than the field beside it.
- **Stitch appearance simulation.** Cosmetic: a template needs the slit an iron cuts, which F.7
  draws.
- **9.9 Nesting on a hide,** moved here on 2026-10-17. It would need a hide's outline and flaws, its
  grain and boolean operations before it could place one piece well, and a maker laying card
  templates on leather does that better by eye; laser users nest in their own software, from the SVG
  or DXF. What makers ask of it — how much leather a project takes — is 9.12's.
- **Accounts, cloud storage, collaboration or a marketplace inside the app.** It works offline and
  shares by file.
- **An AI assistant for its own sake.** Help comes from rules a maker can read (9.15 to 9.17); if
  more ever comes, it offers the same fixes.
- **General illustration** — carving and tooling artwork. A logo is a marking, drawn or imported
  (9.20).
- **G-code.** Laser and CNC users have their own CAM and want DXF or SVG ([printing](printing.md)
  §12).
