# Roadmap 1.3 — the record

> **Archive.** Everything that shipped in 1.3.0 (2026-10-01), moved here from
> [`docs/roadmap.md`](../roadmap.md) word for word, with what each item found. It is not updated
> any more. It carried 8.7, 8.8 and 8.10, the fixes Q26 and Q28 to Q30, and the release
> engineering R2 and R7. The record before it is
> [`roadmap-1.1-and-1.2.md`](roadmap-1.1-and-1.2.md).

The theme is still the one the roadmap gave 1.1 — from a tool that works to one you can live in.
Its first half shipped early, as 1.1.0 to 1.2.0. 1.3 is what of the rest is done: the window's own
top bar, Settings and right-click menu, the interface's language, and the fixes found on the way.
Everything not done yet moved to 1.4 on 2026-09-30, unchanged, so this could ship.

## The window

Set first on 2026-09-29, in this order, one pull request each: the window's own frame was still
Electron's default menu, and a right-click did nothing.

- ✅ **8.7 The top bar and Settings.** No application menu on Linux and Windows, and the minimal one
  macOS requires. The project bar gains a Project menu (New, Open, Save as, recent projects), Settings
  and Help (the sample project, About). Settings is a sidebar window — General, Appearance, Keyboard
  shortcuts — that grows a section only when it has a real control. The Paper menu, a copy of the
  sheet indicator, goes with its IPC. Design:
  [`2026-09-29-top-bar-and-settings-design.md`](../superpowers/specs/2026-09-29-top-bar-and-settings-design.md).
  ✅ Built as designed. On the way: a menu closed by Escape never gave its button focus back, and
  the shortcut map's "or" failed contrast; both fixed. The README's pictures still show the bar
  before 8.7 (Q27).
- ✅ **8.8 The right-click menu.** Selecting several features already works — Shift-click, and
  dragging a box. A right-click selects what is under the pointer unless it is already selected,
  then offers what the selection can take: Delete, Flip, Lock, Hide and Duplicate part, through the
  commands that exist, as one undo step. The same menu on a row of the parts list. It reuses 8.7's
  menu component. Copy and Paste are not in it: see *Later*.
  ✅ Built as described, with any tool active, and from the keyboard (Shift+F10, the Menu key).
  Lock and Hide became one command for any number of features, so a selection is one step of
  undo. The items never move: one the selection refuses is greyed and says why, once for a run of
  items it shares with. On the way: a piece locked on the board could not be unlocked there, since
  a click passes over it — a right-click now reaches it, and only a right-click; Shift+F10 did
  nothing wherever the canvas had no focus to give it; and Hide now says it leaves the piece off
  the PDF. Found, not fixed: Q28, Q29.
- ✅ **8.10 The interface's language.** Every word on screen through one catalogue per language,
  so a translation is one file and needs no code: `apps/desktop/src/locales/`, checked by
  `pnpm test locales`, tried in `pnpm dev`, and the README invites one. Which languages the app
  offers is the project's own list, `SUPPORTED_LANGUAGES`: a translation joins it after review, not
  by existing. Settings › Language follows the system or keeps a choice, applied at once. English
  is the only supported language so far ([ADR 0018](../adr/0018-interface-language.md)).
  ✅ Built as described. On the way: the domain's problem sentences, the export's words for Parts
  and the Sheets view, and the document's undo labels were English below the app — each is now
  facts the app words, so no package but the app speaks a language. The status bar said "1 parts"
  and "1 features"; it counts in the plural now. The recovery dialog wrote its date in the
  system's format rather than the interface's. Left for a language that needs it: paper stays
  English (its glyphs are Latin), default names such as *Untitled* stay as the file keeps them,
  and numbers keep the decimal point.

## Fixed along the way

| # | What | Where it was found | Plan |
|---|---|---|---|
| ✅ **Q28** | Flip acts on what is selected, so a right-click on a piece's outline flips the outline alone: its cut-outs, hardware holes and fold stay where they were, and an asymmetric piece becomes a wrong pattern without a word. A symmetric outline flipped alone changes nothing visible and still takes an undo step. The panel's *Flip this piece* does the same | 8.8, the leathercraft review | ✅ Fixed: a piece's outline stands for the piece. Flipping it — from the menu, the panel or the part's heading — flips everything in the part about the outline's centre, and each stitch hole lands on its own mirror; a label goes to its mirrored place still reading forwards. Anything locked in the piece refuses the whole flip. Any other feature still flips alone |
| ✅ **Q30** | Moving or turning a piece's outline — dragged, with Rotate, or its X, Y or Turn typed — left its cut-outs, rivets, fold and labels where they were, as Flip did before Q28. Rotate did nothing to a part picked by its heading, and the board never showed one as picked. A gesture part of the selection refused was applied to the rest: a stretched piece left its rivets behind, and a lock refused a drag without a word. And a turn stored a 100 mm panel as 99.99999999999999 mm for one angle in five | Q28, reviewing Move, Rotate and Scale | ✅ Fixed: Q28's rule, one helper for every gesture, typed moves and turns included; hidden features travel, a dragged piece never snaps to itself, and a part picked by its heading shows on the board; a refused gesture is refused whole, and says why, lock first; a turn, move or mirror scales nothing, exactly |
| ✅ **Q29** | A part picked by its heading reads "0 selected" in the status bar and "Nothing selected" in Properties, while the right-click menu acts on the whole part | 8.8, the UX review | ✅ Fixed: a picked part is a real selection everywhere. The status bar counts it, Properties shows the part — name, cut, its outline's size, its problems, Flip this piece, Delete part — and the Delete key deletes it whole. Shift-click and Shift-box add to it instead of dropping it, Edit Points edits its outline, and Scale says why it does not resize a whole part. On the way: the panel's Delete was enabled on a feature a locked dependent refused, and did nothing |
| ✅ **Q26** | **bug** · Two findings of the nightly property run ([issue #27](https://github.com/crnlsp/leathercad/issues/27)). A cubic that doubles back on itself measured short — 4 µm on a 94 mm curve, against a 1e-7 mm tolerance — because its speed kinks where it turns, and a kink can make adaptive quadrature's halves agree with the whole while both are wrong. And the nearest point of a line shorter than `EPS_POINT` was always its start, a hair from its other end | The nightly runs of 2026-09-27 to 2026-09-29 (seeds 267645448, 1303645 and 285059694) | ✅ Fixed: a cubic is measured in pieces cut at every turning point of x and of y, where its speed is smooth, and a line is projected on exactly at any length but zero. Both counterexamples are regression tests, and a new property measures cubics along a line against the distance they travel |

## Release engineering

| # | What | Plan |
|---|---|---|
| ✅ **R2** | `develop` was deleted once by merging the `develop` → `main` pull request, and was gone again from 2026-09-26 — so 3.9b–d and the fixes after 1.1.0 went straight into `main` | ✅ Done 2026-09-29. The cause: *Automatically delete head branches* deleted `develop` when a release merged, and the *General* ruleset that should have stopped it named no branch. `develop` is recreated, and each branch has a ruleset: no deletion, no force push, pull requests only with every CI check required — squash merges only into `develop`, bringing a release back included, and merge commits only into `main`, which also requires *Release gate* |
| ✅ **R7** | Releases went out before their section of the roadmap was done: the roadmap's 1.1 shipped as 1.1.0, 1.1.1 and 1.2.0 with ten of its slices still to do, because a release pull request was merged whenever release-please opened one | ✅ A release is its whole section: `develop` reaches `main` only when every item under *the next release* is ✅, and the *Release gate* check refuses a pull request into `main` from anything but `develop` or release-please, and a section with anything not done left in it ([`CONTRIBUTING.md`](../../CONTRIBUTING.md#changelog-and-releases)) |
