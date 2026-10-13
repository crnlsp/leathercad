---
name: top-bar
description: Builds slice U.7 of LeatherCAD's UI refinement — the top bar in three zones (the project and its save state; Design | Sheets as a switch; the paper, then Export PDF and Print as split buttons, Print's second half showing the problems), green leaving the actions, the window's edited flag and polite announcements — end to end, tests first, measured in the running app, and opens a pull request into develop without merging it. Use when asked to build, continue or fix U.7.
model: opus
effort: high
---

# U.7 — the top bar in three zones

Slice **U.7** of the 1.5 UI refinement: requirement **R-06** and §2's *edited flag* and
*announcements*, mockup `08-top-bar.png`. The bar answers three questions at a glance — is my work
saved, am I designing or checking the sheets, is the pattern ready to print — with the problems on
Print itself, before paper and leather are wasted.

## Where your instructions are

- **Your process** is `.claude/agents/ui-refinement.md`. Follow it.
- **Your task** is the plan's §5 **U.7**, in `docs/superpowers/plans/2026-10-08-ui-refinement.md`,
  with §3's token names; read §0–§4 first, and the *As built* notes of U.4, U.5 and U.6.
- **Decided already** — `docs/roadmap.md`, *Decisions this release needs*: how a project is renamed
  once its name joins the menu button. Take the recorded answer.
- **This file** adds only what the plan cannot know: the code as it is now, and the traps. Where it
  and the code disagree, the code wins — check, and correct the plan in your pull request.

## Before you start

U.5, U.7 and U.8 run **one at a time, in that order**: they share `App.tsx`, `styles.css`,
`keymap.ts`, `en.json` and the pixel references. **Start only when U.5 is ✅ in `docs/roadmap.md` on
`origin/develop`**; if it is not, stop and say so. Then branch `feat/ui-top-bar` from
`origin/develop`, and read U.5's *As built* note: it moved the status bar's chips and the panels'
widths that the bar sits above.

## The code as it is (develop at 8ac7a52, read on 2026-10-13 — re-read it after U.5)

- **The bar** is `ProjectBar.tsx`: the Project menu (a `MenuButton`) with the mark, then the
  project's name as an **`<input>` renamed in place** (`project-name`, dispatching `setProjectName`
  as the maker types), the save state, Save, `SheetIndicator` (~120), *Export PDF* with its chevron
  menu, *Print*, a rule, Settings and Help (`help-menu`).
- **The view switch** is `ViewSwitch.tsx`, rendered by `App.tsx` (~708) at the work bar's right.
  `design` and `sheets` are keymap commands on `Ctrl+1` / `Ctrl+2`.
- **Keys:** `exportPdf` is `Ctrl+E`, `print` `Ctrl+P`, `settings` `Ctrl+,`. **No command opens Help;**
  `F1` is unbound. A new command goes in `keymap.ts` with its `does` words in `en.json`, and its cap
  comes from the keymap — never a key written into a sentence.
- **Green:** the theme's `GO` (`palette.ts`, emitted as `--go`, `--go-ink`, `--on-go`) is used by
  Print in `styles.css` (~510–518) and by the print status's check (`.print-status.ok .icon`,
  ~1323). Give that check its new colour before removing the palette entry; `pnpm knip` and the
  theme's audit test tell you what is left.
- **Problems:** the drawer is `ProblemsPanel.tsx`, reading `diagnose`'s one list (X7) and showing
  only a total (`diagnostics.length`). **Nothing counts by severity yet.** Write that count once, as
  a pure function over the same list, tested first, and have the indicator and the drawer both use
  it, so they cannot disagree.
- **Print:** `PrintPreview.tsx` says nothing about problems today; the plan wants them listed first.
- **The paper:** `SheetIndicator.tsx` reads `sheetPlanFor` (`renderer/src/sheets.ts`, cached per
  project), and so do U.6's job totals in Properties. The paper button and its popover read it too.
- **The edited flag** does not exist anywhere: it is a new `PlatformHost` method in
  `packages/platform` (with `FakeHost` in `fake.ts`), an IPC channel in `apps/desktop/src/shared/ipc.ts`,
  the preload, and the main process's handler. Test it through the fake.

## Traps

- **Menus** follow U.4's focus rule in `Menu.tsx`: a keyboard choice returns focus to the button, a
  pointer choice leaves it. The split buttons' second halves are `MenuButton`s or buttons opening the
  drawer; each half has its own accessible name.
- **The 860 px fit:** `top-bar.spec.ts` holds the bar to the smallest window with the longest paper
  name (8.7). It must keep passing; the plan says what drops at 1024 and at 860.
- **Renaming** stays reachable by keyboard and by mouse, whichever way the recorded decision says.
- **Announcements** are polite and once per change: an `aria-live` region that re-announces on every
  render is worse than none.
- **`forced-colors`:** the split buttons and the switch get real borders.
- **Pixel references** change: retake them and look at every image.

## Check, beyond the plan's *Done when*

- Print stays enabled with errors; its second half opens the drawer; the Print dialog lists the same
  problems, in the same order, as the drawer.
- The paper popover's sheet count, the Sheets tab's count and Properties' job totals agree.

## Report back

As `ui-refinement.md` says, and also: whether the edited flag was checked on a Mac or only through
the fake; and for U.8, any change to the right-click menu or the keymap it should know about.
