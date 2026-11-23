# The main screen, three rows with one job each (MS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The `main-screen` agent (`.claude/agents/main-screen.md`) carries one task to a pull request.

**Goal:** Rebuild the window's chrome around the board as three rows with one job each — the document, the view and its output, the tool — with a Print button that turns green only when the pattern is ready and *Draw as* grouped as the workshop works.

**Architecture:** Renderer-only. Everything moves between existing components: Undo and Redo from the work bar into `TabStrip`, Settings into `projectMenu`, Help into the status bar, the view switch restyled as tabs, the work bar gaining a head cell as wide as the rail. Pure decisions (menu contents, Draw as groups, what gives way) live in `.ts` files with unit tests; components map them to elements. One new theme colour pair, `ready` / `readySide`, in `packages/render/src/theme`.

**Tech Stack:** Electron, React 19, TypeScript, Vitest (node, no DOM), Playwright driving the real app (e2e, axe), the pinned Playwright container for pixels.

**Spec:** [`docs/superpowers/specs/2026-11-23-main-screen-design.md`](../specs/2026-11-23-main-screen-design.md) — read it first; every value below comes from it.

## Global Constraints

- **pnpm is not on PATH:** prefix commands with `export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH";`.
- **Never open the app on the maintainer's screen.** `pnpm test:e2e` hides its windows; any scratch screenshot script runs as `pnpm hidden-screen node <script>`.
- **Every word through `t()`** from `apps/desktop/src/locales/en.json`; keys in sentences come from the keymap. `untranslated.test.ts` must stay green. English only; other languages fall back.
- **`styles.css` writes no colour, radius or custom property of its own** (`theme.test.ts`): colours as `var(--…)` from `packages/render/src/theme/css.ts`.
- **No new dependency.**
- **Invariant 5:** components read; a moved control calls the same handler it called before (`store.undo()`, `onSave`, `setSettings('general')`, …).
- **One objective per pull request**, into `develop`, squash-merged, Conventional Commit title, ending `Assisted-by: Claude Code`. Branch per task: `feat/ms-<n>-<slug>` from `origin/develop`.
- **A finished task passes** `pnpm check` and `pnpm test:e2e`. Pixels: `pnpm build && pnpm test:visual --update-snapshots` in Docker, looking at every changed image before committing it.
- **No private data** in commits, docs, fixtures or screenshots.

## Review Focus

1. **A translation 30 % longer than English** (German, Polish) pushes row 3 past the window at 1024 px, or wraps a Draw as word. Expected: the give-way order of Task 7 runs, nothing is clipped. Test: Task 7, `fits Draw as in German at 1024 px`.
2. **Keys that used to reach a button that moved:** Ctrl+, opens Settings, F1 opens Help (now in the status bar), Ctrl+1/Ctrl+2 switch views, Ctrl+Z/Ctrl+Shift+Z still undo after Undo left the work bar, and focus returns to the trigger after Escape. Test: Task 3, `keys still reach Settings and Help after they leave the bar`; Task 2, `undo and redo keep their keys from the tab strip`.
3. **The start screen** (no project): no project bar, no work bar. Expected: ☰ lists Settings…, the status bar shows the version and **?**, the update mark shows on ☰. Test: Task 3, `the start screen keeps Settings in ☰ and Help in the corner`.
4. **Print moving between states** while a drag settles (ready → warning → ready). Expected: green only in *ready*; no flash of green while problems are being recomputed; forced-colours mode shows the halves' edges. Test: Task 1, `print is green only while nothing needs fixing`.
5. **Parts folded** (focus mode, or below 900 px): once the status bar stops repeating the counts, Parts' heading is their only home. Expected: the folded strip still says how many pieces there are, to sight and to a screen reader. Test: Task 6, `the piece count survives Parts folding`.

---

## The order

| Task | Slice | Branch | Depends on |
|---|---|---|---|
| 1 | MS.1 Print earns its green | `feat/ms-1-print-ready` | — |
| 2 | MS.2 Row 1 holds the document | `feat/ms-2-document-row` | — |
| 3 | MS.3 Settings into ☰, Help into the corner | `feat/ms-3-settings-help` | 2 (the tab strip's end) |
| 4 | MS.4 Design and Sheets as tabs; Paper as a field | `feat/ms-4-view-tabs` | 3 (row 2's right end) |
| 5 | MS.5 Row 3: the tool, and Draw as by workshop step | `feat/ms-5-tool-row` | 2 (history out of the work bar) |
| 6 | MS.6 The panels' titles and the status bar | `feat/ms-6-panels-status` | 3, 5 (the status bar's new contents) |
| 7 | MS.7 Narrow windows, pixels and the record | `feat/ms-7-narrow-and-docs` | 1–6 |

1 and 2 can run in parallel; then 3; then 4 and 5 in parallel; then 6; then 7.

---

### Task 1: Print earns its green (MS.1)

**Why:** a maker who has fixed the last problem should *see* the pattern is ready. Today Print is the paper colour whether or not there is anything to fix, so ready looks almost the same as not ready.

**Today:** `ACTION` in `packages/render/src/theme/palette.ts:73` makes `primary` the ground colour; `css.ts:53-57` writes `--primary`, `--primary-hover`, `--primary-side`, `--on-primary`; `ProjectBar.tsx:178` draws `.split.primary` with the problems indicator as its second half (`indicatorOf(counts).state`: `clear | warning | error`); `styles.css:1894-1937` paints it.

**Find out first:**
- In the running app, how long `counts` takes to settle after a drag ends, and whether the indicator passes through another state on the way (it must not flash green).
- Whether `theme.test.ts` already has a contrast helper; reuse it rather than writing one.

**Files:**
- Modify: `packages/render/src/theme/palette.ts` (`ACTION`), `packages/render/src/theme/css.ts`, `packages/render/src/theme/theme.test.ts`
- Modify: `apps/desktop/src/renderer/src/ProjectBar.tsx` (the `.split.primary` block), `apps/desktop/src/renderer/src/styles.css` (`.split.primary`, `.problems-indicator`), `apps/desktop/src/locales/en.json` (`projectBar.problemsNone`, `projectBar.problems`)
- Test: `e2e/top-bar.spec.ts`

**Interfaces:**
- Produces: `ACTION.ready = '#4ade80'`, `ACTION.readyHover = '#86efac'`, `ACTION.readySide = '#22c55e'`; CSS `--ready`, `--ready-hover`, `--ready-side`. `primary`, `primaryHover` and `primarySide` stay for anything else that uses them (find out which; delete them if nothing does).
- The `.split.primary` element carries `data-state="clear|warning|error"`, from `indicator.state`.

- [ ] **Step 1: Write the failing tests**
  - `theme.test.ts` › `ready keeps its words readable`: contrast of `ACTION.onPrimary` on `ACTION.ready` ≥ 4.5 and on `ACTION.readySide` ≥ 4.5; contrast of `SHELL.text` on `SHELL[600]` ≥ 4.5.
  - `e2e/top-bar.spec.ts` › `print is green only while nothing needs fixing`: on a fresh project with one valid outline, `getByTestId('print')`'s computed background is `rgb(74, 222, 128)` and `print-problems` has `data-state="clear"`; after drawing an open stitch line that raises a warning, the background is `rgb(42, 46, 52)` and `print-problems` has `data-state="warning"` and text `1`; after Undo, green again.
  - Same spec › `print's status half is named as a status`: `print-problems` has accessible name `Problems: nothing to fix. Show Problems` when clear.
- [ ] **Step 2: Run them to see them fail** — `pnpm vitest run packages/render/src/theme/theme.test.ts`; `pnpm test:e2e -- e2e/top-bar.spec.ts -g "green|named as a status"`. Expected: FAIL (no `ready`, background is the ground colour).
- [ ] **Step 3: Add the colours and the state.** `ACTION` gains the three values above; `css.ts` writes the three variables; `.split.primary[data-state="clear"]` paints `--ready` / `--ready-hover` / `--ready-side` with `--on-primary`; the other states paint the main half `--shell-600` with `--text`, the side `--warning` or `--error` with `--on-primary`. `en.json`: `projectBar.problemsNone` → "Problems: nothing to fix. Show Problems"; `projectBar.problems` → "Problems: {{counts}}. Show Problems". Rewrite `ACTION`'s comment: green returned to Print in MS.1, for *ready* only; the fold green is far darker and on the ground.
- [ ] **Step 4: Run the tests to see them pass**, then `pnpm check`.
- [ ] **Step 5: Commit** — `feat(desktop): Print turns green when there is nothing to fix`.

**Done when:** a pattern with no problems shows a green Print with a check; one warning turns it grey with an amber triangle and 1; fixing it turns it green again, with no green flash in between; Windows high-contrast mode (forced colours) still shows both halves' edges.

---

### Task 2: Row 1 holds the document (MS.2)

**Why:** the project's name, its history and its tabs belong together. Today Save sits alone at the far left of the project bar, Undo and Redo two rows down in the work bar.

**Today:** `TabStrip.tsx:142` renders `{menu}` then the tabs; `App.tsx:1833` renders the `history-group` (Undo, Redo) in the work bar; `ProjectBar.tsx:108` renders `SaveState` and the Save button (`data-testid="save"`); the announcer at the bar's end already says the save words (`announce-save`). 65 e2e assertions read `save-state`'s text.

**Find out first:**
- Every e2e assertion on `save-state`: they read `Saved`, `Unsaved changes` or empty — the same words `announce-save` carries. Confirm by diffing the two components' outputs for the three states (dirty, saved, new).
- Which specs click `getByTestId('save')`; they move to Ctrl+S.

**Files:**
- Modify: `apps/desktop/src/renderer/src/TabStrip.tsx` (a `history` prop after `menu`; a hairline after each inactive tab), `App.tsx` (pass the history buttons to the strip; drop them from the work bar), `ProjectBar.tsx` (remove `SaveState` and the Save button; keep the announcer), `styles.css` (`.tab-strip` left padding 6 px so ☰'s glyph starts at 12 px; `.tab:not(.active)::after` hairline; remove `.save-state`, `.save-button`)
- Modify: every `e2e/*.spec.ts` reading `save-state` (→ `announce-save`) or clicking `save` (→ `window.keyboard.press('Control+S')`)
- Test: `e2e/top-bar.spec.ts`

**Interfaces:**
- Produces: `TabStrip` prop `history: ReactNode`, rendered between `menu` and the tab list. `data-testid="undo"` and `"redo"` stay on the same buttons.

- [ ] **Step 1: Write the failing tests** — `e2e/top-bar.spec.ts`:
  - `undo and redo sit in the tab strip`: `getByTestId('tab-strip').getByTestId('undo')` is visible; `getByTestId('work-bar').getByTestId('undo')` has count 0.
  - `undo and redo keep their keys from the tab strip`: draw a rectangle, press Ctrl+Z, `part-count` is 0; Ctrl+Shift+Z, 1.
  - `there is no Save button, and Ctrl+S still saves`: `getByTestId('save')` has count 0; after Ctrl+S on a saved file, `announce-save` reads `Saved`.
  - `every row's first glyph starts 12 px in`: the bounding box x of ☰'s svg, of the first view tab's svg and of the rail's first icon are each 12 ± 1.
- [ ] **Step 2: Run them to see them fail** — `pnpm test:e2e -- e2e/top-bar.spec.ts -g "tab strip|Save button|12 px"`.
- [ ] **Step 3: Move the controls**, then migrate the e2e specs: `save-state` → `announce-save` (drop the one `.locator('.icon')` assertion), Save clicks → Ctrl+S.
- [ ] **Step 4: Run** `pnpm check` and `pnpm test:e2e`.
- [ ] **Step 5: Commit** — `feat(desktop): Undo and Redo join the project tabs, and Save leaves the bar`.

**Done when:** row 1 reads ☰ · Undo · Redo · tabs · +; nothing in the window says "Save" but the ☰ menu's *Save as…*; the tab's dot appears on an edit and clears on Ctrl+S; a screen reader still hears "Saved".

---

### Task 3: Settings into ☰, Help into the corner (MS.3)

**Why:** Settings is opened a few times a month and Help holds one item; neither should take a place in the bar a maker reads every minute. Row 2 can then end on Print, its strongest place.

**Today:** `ProjectBar.tsx:225` renders `AppControls` (Settings, Help) after a rule; `App.tsx:1751` renders them at the tab strip's end on the start screen; `helpMenu` (`menus.ts:389`) holds only *About LeatherCAD*; `projectMenu` (`menus.ts:93`) ends with *Rename…* and the recent projects; the status bar's left starts with `VersionButton`. 39 e2e calls press `getByTestId('settings')`; 7 specs use `help-menu`.

**Find out first:**
- Where F1's `helpRef` is read (`App.tsx`), so the trigger it opens moves with the button.
- What the update mark (`updateAvailable`) is read by besides Settings, and that Settings › Updates' *Check now* covers what `VersionButton`'s press did — it is leaving the status bar.

**Files:**
- Modify: `apps/desktop/src/renderer/src/menus.ts` (+ `menus.test.ts`), `ProjectMenu.tsx`, `ProjectBar.tsx` (`AppControls` leaves the bar and the module), `App.tsx` (status bar: **?** at the right; start screen: the status bar with the version and **?**; no `trailing` controls on the strip), `styles.css`, `en.json`
- Create: `e2e/openSettings.ts` — `openSettings(window: Page): Promise<void>` presses ☰ then `menu-settings`
- Modify: every e2e spec pressing `getByTestId('settings')` (→ `openSettings(window)`)
- Test: `e2e/top-bar.spec.ts`, `e2e/start-screen.spec.ts`

**Interfaces:**
- `projectMenu(actions, recent, t, noProject?, updateAvailable?: boolean)`: `actions` gains `settings: () => void`. The list ends with a separator and `{ kind: 'item', id: 'menu-settings', label: t('menu.settings'), keys: 'settings', onChoose: actions.settings, note?: t('menu.newVersion') }` — the note only when `updateAvailable`.
- `helpMenu(actions, t)`: `actions` gains `shortcuts: () => void`; returns `help-shortcuts` (`t('menu.keyboardShortcuts')`, `keys: 'keyboardShortcuts'`), a separator, then `help-about`.
- New `en.json` keys: `menu.settings` "Settings…", `menu.newVersion` "A new version is available", `menu.keyboardShortcuts` "Keyboard shortcuts".

- [ ] **Step 1: Write the failing tests**
  - `menus.test.ts` › `ends the project menu with Settings, keyed Ctrl+,`: the last entry is the item `menu-settings` with `keys: 'settings'` and no note; with `updateAvailable` true its note is `menu.newVersion`'s words.
  - `menus.test.ts` › `lists keyboard shortcuts before About`: ids are `['help-shortcuts', separator, 'help-about']`.
  - `e2e/top-bar.spec.ts` › `keys still reach Settings and Help after they leave the bar`: `getByTestId('project-bar').getByTestId('settings')` has count 0; Ctrl+, opens Settings; Escape returns focus to the board; F1 opens the menu whose trigger is inside `status-bar`; Escape returns focus to that trigger.
  - `e2e/start-screen.spec.ts` › `the start screen keeps Settings in ☰ and Help in the corner`: `status-bar` is visible and holds the version text and `help-menu`; ☰ lists `menu-settings`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Move them.** The ☰ button shows the update mark (`.update-mark`, as Settings had it) when `updates.state === 'available'`. On the project screen the status bar loses `VersionButton`; on the start screen it holds the version as plain text.
- [ ] **Step 4: Migrate** the 39 `settings` presses to `openSettings(window)`; run `pnpm check` and `pnpm test:e2e`.
- [ ] **Step 5: Commit** — `feat(desktop): Settings moves into the project menu and Help to the status bar's corner`.

**Done when:** row 2 ends on Print; ☰ › *Settings…* and Ctrl+, both open Settings; F1 and the **?** both open Help, which lists *Keyboard shortcuts* and *About*; with a newer version out, ☰ carries the mark and the menu says so; the start screen has the same corner.

---

### Task 4: Design and Sheets as tabs; Paper as a field (MS.4)

**Why:** the switch between the two views is navigation, and tabs are what people read as navigation; a segmented control in a toolbar reads as a setting. A new maker should recognise a drawing and a sheet at a glance. The paper control should look like the choice it is.

**Today:** `ViewSwitch.tsx` is a pill (`.view-switch`, `styles.css:1665`) centred in the project bar, already a `tablist` with arrow keys and Ctrl+1/2; `PaperButton.tsx:105-112` builds "2 × A4 portrait" (shorter when narrow), drawn as a quiet button with the paper icon.

**Find out first:** whether any e2e spec relies on the switch being centred (positions, screenshots) — `grep -rn "view-design\|view-sheets\|view-switch" e2e`.

**Files:**
- Modify: `ViewSwitch.tsx` (left of row 2, full row height, icon + word, count after "Sheets"; `compact` keeps icon and count), `PaperButton.tsx` (the visible word "Paper" before the value; no icon; field style), `ProjectBar.tsx` (order: tabs, then `margin-left: auto` output), `styles.css` (`.view-switch` → underline tabs: 14 px, selected semibold with `box-shadow: inset 0 -2px 0 var(--tan)`; `.paper-button` → field: hairline border, `--shell-900` fill), `en.json` only if a word is missing.
- Test: `e2e/top-bar.spec.ts`

- [ ] **Step 1: Write the failing tests** — `view tabs read as tabs`: `getByRole('tablist', { name: /view/i })` is the first control in `project-bar`; the selected tab's computed `font-weight` is 600 and its `box-shadow` contains the accent colour; each tab holds an `svg` and its word. `the paper reads as a field`: `paper-button`'s text starts with `Paper` and it holds no `svg` but the chevron.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Restyle** the two components.
- [ ] **Step 4: Run** `pnpm check`, `pnpm test:e2e`.
- [ ] **Step 5: Commit** — `feat(desktop): Design and Sheets become tabs, and the paper reads as a field`.

**Done when:** row 2 starts with two tabs, a pen and a sheet, the selected one underlined; arrows, Home, End and Ctrl+1/2 still switch; the paper control says "Paper 2 × A4 landscape ▾" and opens the page setup as before.

---

### Task 5: Row 3 — the tool, and Draw as by workshop step (MS.5)

**Why:** a maker drawing a fold or a stitch line thinks in workshop steps — what is cut, what is sewn, what is marked. Each choice should show the line it makes, and the row should say whose options these are.

**Today:** `ToolOptions.tsx:21` lists `DRAW_MODES` as one flat run of chips with mono marks (`FeatureMark` with the default `tone`); below 1200 px `styles.css:2011-2024` swaps them for a `<select>`. The ranked hints (`OptionHints`, `App.tsx:1887`) fill the rest of the work bar, `ALL_KEYS` last.

**Find out first:**
- The width row 3 needs at 1024 px with the group names, in English, German and Polish (`pnpm dev`, Settings › Language preview) — this sets where the `<select>` takes over (Task 7 owns the order; this task keeps the chips up to the measured width).
- `FeatureMark`'s `plane="ground"` output on a ground tile, for each of the six marks, against the board's own rendering of the same roles.

**Files:**
- Create: `apps/desktop/src/renderer/src/drawModes.ts` (+ `drawModes.test.ts`) — the groups, pure
- Modify: `ToolOptions.tsx` (render the groups; head cell; tooltips), `App.tsx` (the head cell first in the work bar; ranked hints to the status bar, `ALL_KEYS` stays in row 3), `styles.css` (`.work-head` width `var(--rail-w)`, right hairline; `.draw-group` box; `.line-sample` ground tile), `en.json`
- Test: `e2e/drawing-defaults.spec.ts` (it already drives *Draw as* while drawing)

**Interfaces:**
- `drawModes.ts` exports `type DrawGroup = 'cut' | 'stitch' | 'mark'` and `DRAW_GROUPS: readonly { readonly group: DrawGroup; readonly modes: readonly DrawMode[] }[]`.
- New `en.json` keys: `drawGroup.cut` "Cut", `drawGroup.stitch` "Stitch", `drawGroup.mark` "Mark"; `drawModeTip.<mode>` — outline "A new piece's cut edge", cut-out "A hole in the selected piece", stitch "Holes along a line on the selected piece", stitch-allowance "A new piece, from its stitch line", fold "Where the selected piece folds", marking "A reference line, never cut".
- `data-testid="draw-as-<mode>"` stay; the head cell is `data-testid="work-head"`; hints keep `data-testid="tool-how-to"` in the status bar.

- [ ] **Step 1: Write the failing tests**
  - `drawModes.test.ts` › `groups the six modes as the workshop does`: `DRAW_GROUPS` equals `[{ group: 'cut', modes: ['outline', 'cut-out'] }, { group: 'stitch', modes: ['stitch', 'stitch-allowance'] }, { group: 'mark', modes: ['fold', 'marking'] }]`, and the flattened modes are a permutation of every `DrawMode` (each exactly once).
  - e2e › `row 3 names the tool and groups Draw as`: with Line active, `work-head` reads `Line` and `L`; `work-bar` holds `Draw as`, `Cut`, `Stitch`, `Mark` in that order; `draw-as-cut-out` has accessible description `A hole in the selected piece`; each `draw-as-*` holds a `.line-sample`.
  - e2e › `the hint moved to the status bar`: `status-bar` holds `tool-how-to`; `work-bar` still holds `? all keys`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** `DRAW_GROUPS` and render it; the head cell shows the icon only while `layout.railNames` is false.
- [ ] **Step 4: Run** `pnpm check`, `pnpm test:e2e`.
- [ ] **Step 5: Commit** — `feat(desktop): the tool row names its tool and groups Draw as by workshop step`.

**Done when:** with Line active, row 3 reads "Line L · Draw as · Cut [Outline | Cut-out] · Stitch [Stitch line | Stitch line + allowance] · Mark [Fold | Marking] ··· ? all keys"; every choice shows its line in its board colour; hovering one says whether it makes a new piece; the hint for Line is in the status bar.

---

### Task 6: The panels' titles and the status bar (MS.6)

**Why:** beside the drawing, the loudest words should be the selected piece's name, not the panels' names. The status bar becomes the place for state about *now*: panels, the tool's hint, the cursor, Help.

**Today:** `PartsList.tsx:426` (`PartsTitle`) already shows "Parts" and the count (`parts-count`, `t('parts.count')`) as a 16 px semibold `h2`; `PropertyPanel.tsx:127` titles the empty panel "Properties", and a selection's name replaces it (`:212`, `:555`). The status bar (`App.tsx:2155`) repeats the counts: `part-count` (62 e2e specs), `feature-count` (17), `selected-count` (17), problems, then the file name.

**Find out first:**
- Which e2e specs read `part-count`, `feature-count` or `selected-count`, and what each checks. A piece count moves to `parts-count`; a selection count to the selection announcer (`announce-selection`) or to Properties' title; a feature count to the Parts rows. When Parts is folded (focus mode, below 900 px), check what its strip (`PartsStrip`) says about the count.
- Whether a notice (`tool-notice`, `file-error`) still has room in the status bar once the counts leave — it must stay visible.

**Files:**
- Modify: `PartsList.tsx` (`PartsTitle`: the title at label weight; the folded strip names the count), `PropertyPanel.tsx` (a "Properties" label above the selection's name), `App.tsx` (status bar: drop the counts and the file name; keep notices, chips, `MoveStatus`, hint, cursor, **?**), `styles.css`
- Modify: e2e specs per *Find out first*
- Test: `e2e/panels.spec.ts`

- [ ] **Step 1: Write the failing tests** — `e2e/panels.spec.ts`:
  - `panel titles step back for the selection`: Parts' and Properties' title computed `font-size` is `12px`; with Outer selected, Properties' `h2` reads `Outer` at 16 px.
  - `the piece count survives Parts folding`: three pieces; `parts-count` reads `3 pieces`; with focus mode on, the folded Parts strip's accessible name contains `3 pieces`.
  - `the status bar says what is happening now`: `status-bar` contains `tool-how-to` and `cursor-readout`, and `part-count` has count 0.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement**; migrate the e2e reads the *Find out first* list names.
- [ ] **Step 4: Run** `pnpm check`, `pnpm test:e2e`.
- [ ] **Step 5: Commit** — `feat(desktop): the selection leads beside the drawing, and the status bar says what is happening now`.

**Done when:** with Outer selected, "Outer" is the largest word beside the board; Parts says "3 pieces"; folding Parts still says how many; a refusal notice still shows in the status bar.

---

### Task 7: Narrow windows, pixels and the record (MS.7)

**Why:** makers run the app on laptops. The new rows must give way in a fixed, predictable order and never clip a word.

**Today:** `panelLayout.ts:25` sets the rooms (`wide` ≥ 1280, `narrow` ≥ 900, `cramped` below); Draw as becomes a `<select>` below 1200 px by media query; `OptionHints` already drops hints by rank as room runs out.

**Find out first:** the widths at which, in English and in German, each step of the spec's give-way order is needed — measured in the running app at 1440, 1280, 1024, 900 and 860 px.

**Files:**
- Create: `apps/desktop/src/renderer/src/workRow.ts` (+ `workRow.test.ts`) — `fitWorkRow(widths: WorkRowWidths, room: number): WorkRowFit`, pure, in the style of `fitHints` (`optionHints.ts`)
- Modify: `ToolOptions.tsx`, `PaperButton.tsx` (orientation word goes first), `styles.css` (the media query gives way to the measured fit)
- Test: `e2e/window.spec.ts` (resizing through `e2e/windowSize.ts`), `e2e/localization.spec.ts` (German)
- Modify docs: `docs/superpowers/specs/2026-09-24-sheets-workflow-design.md` (the bars), `CLAUDE.md` (its table gains this plan's row), `docs/roadmap.md` (tick MS.1–MS.7), `packages/render/src/theme/palette.ts`'s comments if Task 1 left any stale; README media by `pnpm docs:media` (Docker)

**Interfaces:**
- `type WorkRowWidths = { readonly head: number; readonly drawAs: number; readonly groupNames: number; readonly choices: number; readonly allKeys: number }`
- `type WorkRowFit = { readonly allKeys: boolean; readonly groupNames: boolean; readonly choices: 'chips' | 'select' }`
- The order is fixed: `allKeys` goes first, then `groupNames`, then the chips become the select.

- [ ] **Step 1: Write the failing tests**
  - `workRow.test.ts` › `gives way in the spec's order`: with room for everything, all shown; then, room shrinking a pixel at a time, `allKeys` is false before `groupNames` is, and `choices` turns `'select'` only after both are false — a property over random widths: the three switch in that order and never come back as room shrinks.
  - e2e › `fits Draw as in German at 1024 px`: language `de`, window 1024 × 768: no element in `work-bar` overflows it (each child's right edge ≤ the bar's); no Draw as word is wrapped (each `draw-as-*` is one line high).
  - e2e › `860 px gives way in order`: window 860 × 600: rail at 56 px, Properties and Parts strips, paper reads `2 × A4`, `? all keys` hidden, group names hidden, chips still shown if they fit else the select.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** `fitWorkRow`, measured in a hidden copy as `OptionHints` measures its hints.
- [ ] **Step 4: Pixels.** `pnpm build && pnpm test:visual --update-snapshots`; look at every changed image; `pnpm docs:media`. Then `pnpm check`, `pnpm test:e2e`, `pnpm test:packaged`.
- [ ] **Step 5: Commit** — `feat(desktop): the rows give way in a fixed order on narrow windows`, then `docs: the main screen's rows`.

**Done when:** at 1440, 1024 and 860 px, in English and German, nothing is clipped or wrapped; each step gives way in the spec's order; the visual baselines and README media show the new rows; the roadmap ticks MS.1–MS.7.

---

## Outside this repository

The design system (an artifact the maintainer keeps) still says Print is the paper colour and that
green is not used for actions. Update its `primary` tokens and README to MS.1's values when MS.1
merges, so code, design and tokens agree.
