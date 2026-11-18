# Smart Features — audit, applicability and scenario tests

**What this is.** An audit of the checks LeatherCAD makes about a design — the rules, the
relationships a maker declares, the readings it shows and the fixes it offers — done against the
code at `develop` 82be6f1 (2026-11-17), with every journey below reproduced in the built app or the
evaluator. Then the scenario test suite built from it, in `tests/smart-features`, and how to add to
it. Nothing in the product was changed by this audit: what it found that is wrong is recorded as
failing scenarios (§7), and what it recommends is a plan for the maintainer to decide (§8).

"Smart Features" is not a term in the code. Here it means everything the app concludes about a
pattern rather than draws: domain-model [§8](domain-model.md#8-invariants-and-diagnostics)'s design
rules and outcomes, seams (§7), pocket requirements (§10), the readings shown beside them, and
9.17's fixes.

---

## 1. What exists

Verified against the code, not the documents. Where they differ, it says so.

| Layer | What | Where | Needs from the maker |
|---|---|---|---|
| **Universal rules** | DR1–DR6: an outline per piece, everything on the leather, holes clear of the edge (1.5 mm), cut paths that do not cross, spacing close to the iron, legible text, empty pieces | `packages/domain/src/validate.ts` | Nothing. They run on every evaluation, on every piece |
| **Declared seams** | DR7: paired holes, by count (error) and by drift along the stitching (warning above 0.5 mm, D4); outcomes for a missing side or a stretch past its line | `packages/domain/src/seams.ts` | *Sew together…* between two hole sets. Never inferred from geometry |
| **Declared pocket requirement** | DR8: the width between stitch lines against the content plus the maker's ease; with *Holds it fully*, the depth below the opening; *not checked* when there is no reading | `validate.ts` (`pocketFit`), `pocket.ts` | *Holds* on an open stitch line in Properties |
| **Readings, not judged** | Width between stitch lines and stitch depth of any open U (9.14a); how far the content stands above the opening; a seam's pairing; spacing stretched or squeezed; the production summary (9.12) | `pocket.ts`, `seams.ts`, `productionSummary.ts`, the renderer | Nothing |
| **Fixes** | A drifting seam's drawn stitching shortened or lengthened; a derived stitch line's inset raised to clear the edge. Previewed, one undo step, refused when stale | `packages/document/src/fixes.ts` | Pointing at, then choosing, the fix in Properties |
| **Surfaces** | One list (`diagnose`, X7) read by the Problems drawer, Properties' problem section, the parts tree's badges, the board's markers, the Print button's count and F8 navigation | `diagnose.ts`, the renderer | — |
| **Accepting a warning** | **Not built.** Roadmap 9.16 is ☐; no code stores or reads an acceptance | — | — |
| **Templates** | Four ship. The card holder declares three seams, all pairing. **None states what a pocket holds** (SF-I2), so DR8 is off on all of them | `fixtures/projects/*.lcp` | — |

**Where the documents and the code disagree:**

- D23 says "a requirement is never silently unchecked". A pocket stitched onto a larger piece is
  passed when held fully, with nothing said (**SF-D2**, §7).
- Q33 says a hardware hole is judged by its rim. A hardware hole that is a mirror — across a fold,
  as the key fob's second rivet is — is not judged at all (**SF-D3**).
- Nothing says a hole on the cut edge is judged by which way the piece faces, and it is
  (**SF-D1**).

## 2. Is the architecture right?

**Yes — the hypothesis holds.** Geometric roles, explicit construction relationships, functional
requirements stated where they apply, and deterministic validation are the right foundations. The
defects found are local bugs, not signs of a missing layer.

### Strengths, with the evidence

- **Facts, not sentences.** A diagnostic is a code, a subject and its measurements. Scenarios
  assert `widthMm: 84, neededMm: 87.6` and survive every rewording; the app words them in every
  language (ADR 0018).
- **One list.** Every surface reads `diagnose`, so Properties, Problems and the Print count cannot
  disagree. The suite checks that one list, and so checks all of them at once.
- **Nothing is inferred.** A seam is checked only when declared (SF-D2: two pieces stacked with
  different counts say nothing); a requirement only when stated (SF-C1, SF-D1, SF-D3). This is
  what keeps a keeper loop from being told it cannot hold a card.
- **"Not checked" is a result.** A requirement the geometry cannot be read for says so
  (`POCKET_NOT_MEASURABLE`, SF-E1–E3) instead of passing.
- **Pure and memoised.** Rules are functions of evaluated geometry, reused while their inputs are
  the same objects, so the suite's 92 tests — scenarios, properties and the harness's own — run
  in about two seconds.
- **Readings are separate from judgments.** A U of stitching always shows its width and depth; only
  a stated purpose turns that into a verdict.

### Weaknesses

| # | Weakness | Evidence |
|---|---|---|
| W1 | Where a pocket opens is read from the outline of the piece the stitching is on. A pocket sewn onto a larger panel has its opening elsewhere | SF-E4 (SF-D2) |
| W2 | Points exactly on an edge have no defined answer in `containsPoint`, and stitch holes are asked it | SF-K3 (SF-D1) |
| W3 | Mirrored hardware holes are never asked where they sit | SF-J3 (SF-D3) |
| W4 | A pocket problem's identity (`problemKey`) holds nothing of the requirement, so 9.16 cannot tell an accepted warning from a new one by key alone | SF-H6 |
| W5 | A pass is silence. The domain returns no record of which checks ran, passed, or could not run, so the app cannot say "checked: 94 mm across, 87.6 mm needed" without computing again | Properties shows readings and notes, never a verdict line |
| W6 | A requirement is copied, not shared, when its stitching is mirrored, then diverges | SF-H4 |
| W7 | Domain tests for DR7 and DR8 filter the list to their own codes, so they cannot see another diagnostic appear beside theirs — which is how SF-D1 went unnoticed | `validate.test.ts` (`pocketCodes`) |

### Semantic types for pieces: not needed

The question was whether every piece should carry a type — *Wallet*, *Pocket*, *Strap*. It should
not, and an optional one would buy nothing today:

- **No rule needs it.** The two rules that need a purpose need it on a *relationship*: this
  stitching holds a card; these two runs of holes are sewn. A piece-level *Pocket* type would be
  wrong for the bifold (its card pockets hold cards; its lining does not) and ambiguous for a piece
  that is both a gusset and a pocket wall.
- **Inference is worse.** A keeper loop stitched in a U reads exactly as a pocket does (SF-D1).
  Guessing purpose from shape turns that into a false warning; the code's refusal to infer seams is
  the right precedent.
- **Mandatory types are a configuration exercise.** Four rectangles drawn today say nothing and
  ask nothing (SF-A1, §3 journey 1). That is correct.
- **What would help instead** is a statement where a rule lacks one: the opening edge of a pocket
  (D21 already proposes a maker naming it, as a fold mirror names its fold), which fixes W1 without
  a type.

Tags for finding templates (9.25) are a separate matter, about search, and need not feed any rule.

## 3. UX: ten journeys

Observed in the built app on Linux (Playwright on a hidden screen, at 1440 × 900) for 1 and 2;
from the code and the scenarios for the rest.

| # | Journey | What happens | Clicks | Risk | Recommendation |
|---|---|---|---|---|---|
| 1 | Four arbitrary rectangles | *Problems: Nothing to fix.* Selecting one shows its size, name and Arrange; the selection bar offers the construction's next steps (*Stitch line › Stitch holes › Seam allowance*). No purpose asked | 0 extra | None | **Keep.** Do not add a "purpose not specified" hint to outlines: it would appear four times, and stating a purpose for an outline unlocks no check |
| 2 | A card pocket from scratch | Rectangle; *Stitch line* step; *Stitched sides* › *Between corners* defaults to Corner 1 → Corner 4, which leaves the **bottom** open; the board showed no corner numbers, so the maker guesses Corner 3 → Corner 2; *Stitch holes*. With square corners the end holes land on the cut edge: **1 error**, on the Print button, worded "holes that leave the material", whose fix says to change the inset — which cannot help. No control in the app moves the end holes in (`startOffsetMm` exists, unexposed). Then *Holds* appears under *Stitching dimensions* | ≈ 8, and a guess | High: a first pocket ends in an error the maker cannot clear except by rounding the corners | Fix SF-D1. Name the sides in *Stitched sides* ("Open at the top") or number the corners on the board while the field has focus. Expose the hole set's start and end offsets. A one-line note under *Holds: Nothing stated* — "Say what goes in to check that it fits" — only where a pocket reading exists |
| 3 | Opening the bifold | Clean. Its pocket stitching reads 89 × 53 mm; *Holds: Nothing stated*; no card check runs | 1 to say *Payment card* | Medium: a maker may believe the template's pockets were checked for a card | Ship the card templates with *Holds: Payment card* (not fully). Needs the ease decision in §8 first: today a requirement copies an ease, and a template cannot know the maker's |
| 4 | Changing a pocket checked before | Recomputed on every evaluation; warnings come and go exactly (SF-B3, H7, I5). Selecting the **holes** — what the board shows most — gives the reading but neither the requirement nor its warning, which are on the stitch line | 1 extra to find the stitch line | Medium | When a hole set is selected, show its stitch line's pocket problems, and a button that selects the stitch line (D24 foresaw it) |
| 5 | An SVG with no layer names | Open paths arrive as markings. No command turns a marking into stitching, so seams and pocket checks are out of reach without redrawing | Redraw | Medium | *Use as stitching* on a marking line (and back), one undo step. The preview could say that a layer named `stitch` brings lines in as stitching |
| 6 | A strap, a key fob | Universal rules only; nothing about pockets or seams (SF-J1, J2). The fob's mirrored rivet is not checked (SF-D3) | 0 | High until SF-D3 is fixed: the template teaching fold mirrors teaches an unchecked hole | Fix SF-D3 |
| 7 | A pocket-shaped piece that is not one | Properties shows *Stitching dimensions* and *Holds: Nothing stated*; no warning (SF-D1) | 0 | Low: *Holds* could read as a field to fill | The note in journey 2 must read as optional: "Say what goes in…", never "Purpose missing" |
| 8 | Accepting a valid warning | Impossible: 9.16 is not built. The only ways to quiet a warning are to change the requirement or the ease, which falsifies the design | — | High for real projects with deliberate choices | Build 9.16 with the criteria in §8 |
| 9 | Changing a requirement after accepting its warning | Would keep the acceptance: the key does not change (SF-H6) | — | High once 9.16 ships | 9.16 stores what the warning was found from — the requirement, and the ease — and drops the acceptance when it changes |
| 10 | What 2D cannot know | Notes say leather thickness and stitch pull are not counted; "stands 9.63 mm above the opening" is a geometric reading. Ease defaults to 0, so 85.6 mm passes a card with nothing to spare, silently | — | Medium: a pass with 0 ease is the kind of false confidence to avoid | Say what was checked and what was not, in Properties, from one domain function shared with DR8 (W5): "Width between stitch lines 94 mm, 87.6 mm needed (card 85.6 + ease 2). Not counted: leather thickness, stitch pull, how many cards." With no ease: "No ease: the card's own width is the limit" |

**Notifications.** On every shipped template and every realistic scenario the list is empty or
holds the one problem the scenario is about; seams within the limit are kept as information and not
listed. The volume is right. What is missing is the other side: a stated check that passed says
nothing (W5).

**Accessibility, found on the way.** A rectangle's corner radius fields are named by arrow glyphs
alone (`↖ mm`), which a screen reader reads as "north west arrow"; "Top-left corner radius" would
say what they are. The journeys were driven by pointer and typed fields; keyboard-only use was not
tested here, and U.21's register is where it is tracked.

**Placement and access.** Every recommendation uses a surface that exists — Properties' fields and
`panel-note`s, the problem section, the selection bar — so none adds a dialog, a toast or a focus
change; a note is static text read in order by a screen reader; every word goes through `en.json`.

## 4. Applicability matrix

The prose half: what each rule needs, and when it must stay silent. The coverage half — which
scenarios cover each rule in four classes, and the gaps — is
[`tests/smart-features/src/matrix.ts`](../tests/smart-features/src/matrix.ts). `matrix.test.ts`
fails if a design rule or a seam or pocket outcome is added to the registry without a row in both.

| Code | Rule | Needs | Speaks when | Must stay silent when | Cannot tell, and says |
|---|---|---|---|---|---|
| `POCKET_TOO_NARROW` | DR8 · warning | An open U of stitching with two straight sides, and *Holds* | Width between stitch lines < content's width + ease | Nothing stated; a U on a strap or keeper | Curved or ambiguous sides → `POCKET_NOT_MEASURABLE` |
| `POCKET_TOO_SHALLOW` | DR8 · warning | As above, *Holds it fully*, and an opening on the outline above both stitch ends | Depth below the opening < content's height (ease not counted, D22) | Not held fully (a card meant to stand proud) | No opening found → `POCKET_NOT_MEASURABLE`. Opening on another piece → **passes wrongly (SF-D2)** |
| `POCKET_NOT_MEASURABLE` | DR8 · warning | *Holds* | No pocket reading; held fully and no opening | Nothing stated | — |
| `SEAM_HOLE_COUNT_MISMATCH` | DR7 · error | A declared seam whose sides resolve | Paired stretches hold different numbers of holes | No seam declared, however alike two pieces are | — |
| `SEAM_HOLES_DRIFT` | DR7 · warning | As above, counts equal | Worst pair more than 0.5 mm apart along the stitching from the first holes | Within 0.5 mm (kept as information) | — |
| `SEAM_SIDE_MISSING` | E3 · error | A declared seam | A side's hole set is gone or failed (an older version's delete) | The app's own delete removes the seam too | — |
| `SEAM_RUNS_OFF_THE_LINE` | E4 · error | A seam side following the other's length | That length runs past the end of its line | — | — |
| `HOLE_TOO_CLOSE_TO_EDGE` | DR2 · warning | Holes in a piece with an outline | A stitch hole's point, or a hardware or row hole's rim, within 1.5 mm of an edge | Clear of every edge | A hole exactly on the edge: this or `OUTSIDE_PART`, by orientation (**SF-D1**). A mirrored hardware hole: never asked (**SF-D3**) |
| `OUTSIDE_PART` | DR2 · error for holes, warning for lines | A piece with an outline | Holes off the leather; a line leaving it (sampled, §8.4) | Lines that end on the edge, within a storage quantum | As above |
| `CUT_OUT_OUTSIDE_PART` | DR2 · error | A cut-out and an outline | Part of the cut-out lies outside the outline (sampled) | — | — |
| `PART_HAS_NO_OUTER_CONTOUR` | DR1 · error | A piece with features | None of them is its outline | An empty piece (that is `EMPTY_PART`) | — |
| `CONTOUR_SELF_INTERSECTS` | DR3 · error | An outline or cut-out | It crosses itself | — | — |
| `HOLES_OVERLAP` | DR3 · warning | A row of round holes | Neighbours no more than a diameter apart | — | Holes meeting across a tight bend, not neighbours |
| `HOLE_SPACING_DEVIATION` | DR4 · warning | A hole set | Achieved spacing more than 25 % from the iron | — | — |
| `HOLE_SPACING_UNEVEN` | DR4 · info | A hole set with runs | Runs' spacings differ by more than 5 % of the pitch | — | — |
| `HOLE_COUNT_TOO_LOW` | DR4 · warning | A hole set | Fewer than two holes | — | — |
| `TEXT_TOO_SMALL_TO_PRINT` | DR5 · warning | A label | Capital height under 1.5 mm | — | — |
| `EMPTY_PART` | DR6 · info | A piece | It holds nothing | — | — |

**Coverage today:** every row has at least one positive scenario but `CUT_OUT_OUTSIDE_PART`,
`HOLES_OVERLAP`, `HOLE_SPACING_UNEVEN` and `HOLE_COUNT_TOO_LOW`, which domain tests cover alone. DR7
and DR8 are covered in all four classes but `SEAM_RUNS_OFF_THE_LINE`'s negative and transition.
Every gap is printed as a todo by each run of `pnpm test:smart`.

## 5. What each rule establishes

LeatherCAD must not say more than it knows. Each threshold, and what kind of claim it is:

| Claim | Kind | Source | Overstates when |
|---|---|---|---|
| A payment card is 85.60 × 53.98 mm | **Fact** | ISO/IEC 7810 ID-1 | — |
| Width between stitch lines, stitch depth | **Geometric fact** | `pocketSize`, between stitch centres | Read as room for the card: the thread, the iron's tooth and the leather's thickness all take space inside the centres |
| What the pocket holds, and the ease | **The maker's requirement** | *Holds*, *Pocket ease* in My tools | Ease left at 0: a pass then means "not narrower than the card" and nothing more |
| `POCKET_TOO_NARROW` / its absence | **Verified constraint**, geometric | DR8 | Its absence is taken as "the card fits". It says only that the stitch centres are as far apart as the content and its ease |
| Depth below the opening | **Geometric fact**, from an opening model (D21) | `depthBelowOpening` | The opening is not on the stitching's own piece (SF-D2) or is a slit (D21) |
| 1.5 mm between a hole and an edge | **Expert recommendation**, not universal | `MIN_HOLE_EDGE_CLEARANCE_MM` | Thin firm leather carries less; soft thick leather needs more. The warning says so |
| Spacing within 25 % of the iron; runs within 5 % | **Heuristic** | DR4 constants | — |
| Seam drift within 0.5 mm | **The maintainer's decision** (D4): one graduation of the steel rule | `SEAM_DRIFT_LIMIT_MM` | Checked in leather on one card holder (the [log](print-verification-log.md)); the limit's general adequacy is not established |
| 1.5 mm capital height | **Recommendation** | DR5 | — |
| Leather thickness, stitch tension, how many cards, stretch with use, wrapping round a fold | **Unknown** | Not modelled until 9.1 | Any reading taken as physical fit |

**Evidence is not enough for physical claims.** No measurement in the repository relates width
between stitch lines to how a card goes in for a given leather. Before any tolerance is suggested,
cut a sampler: card pockets 86 to 92 mm between stitch lines in 1 mm steps, in two pairings of
leather (about 1.0 + 1.0 mm and 1.4 + 1.4 mm), with 1, 3 and 6 cards; record each as goes in
freely, goes in firmly, or does not, in [`print-verification-log.md`](print-verification-log.md)
as construction checks. Until then the app reports geometry and the maker's ease, and the notes
keep saying what is not counted.

## 6. The scenario suite

### Where it lives, and how to run it

| | |
|---|---|
| `tests/smart-features/` | A workspace of its own, no layer: it uses `document`, `domain` and `persist` together, as the app does |
| `pnpm test:smart` | The suite alone, about two seconds. Also part of `pnpm test` and `pnpm check`, so CI runs it with everything else |
| `e2e/smart-features.spec.ts` | The few journeys that must be seen in the app; `pnpm build && pnpm exec playwright test smart-features` |

Three layers, each where it is cheapest:

1. **Domain** — rules, boundaries, the edge-case corpus, properties of single functions. In
   `packages/domain`, as today.
2. **Project scenarios** — here. A project built with the app's own commands in the real document
   store, edited, undone, saved and opened, and its **whole** diagnostic list compared with what
   the scenario expects.
3. **The app** — `e2e/smart-features.spec.ts`. Only what needs the interface: that a purpose is
   never asked for, that *Holds* sits where it applies, and that a warning appears and goes in
   Properties and Problems as the maker edits.

### The harness

- **`Bench`** (`harness/bench.ts`) — a `DocumentStore` holding one project. `do()` dispatches each
  action as one undo step and **throws if it changed nothing**, so no scenario passes on an edit
  that silently did not happen (a refused delete, a wrong id). `undo`, `redo`, `saveAndReopen`
  (through the real file format, fixed clock), and `Bench.open('card-holder')` for a shipped file.
- **Actions** (`harness/actions.ts`) — a maker's steps by name, each the command the app dispatches:
  `drawRectangle`, `stitchLeavingOpen(piece, 'top', 3)`, `punchHoles`, `holdsCard(stitch, ease,
  fully)`, `resize`, `turnPiece`, `sew`… Ids follow one pattern: piece `pocket` has
  `pocket-outline`, `pocket-stitch`, `pocket-holes`.
- **`expect([...])`** (`harness/expectDiagnostics.ts`) — the whole list, exactly. Each entry names
  a code, a severity, the feature (`on`, or `part:<id>`), optionally the related features, and the
  facts to check (numbers within `EPS_LENGTH`, or `within(value, tolerance)`). `expect([])` claims
  nothing at all is said. A failure prints every difference by kind, then both lists:

  ```
  Smart Features: the diagnostics after widening are not what the scenario expects.
    facts       POCKET_TOO_NARROW on pocket-stitch — widthMm: expected 83, got 84
    unexpected  OUTSIDE_PART (error) on pocket-holes {"what":"holes", …}
  Expected (1): …
  Actual (2): …
  ```

  The kinds are `missing`, `unexpected`, `severity`, `target`, `related`, `facts` and
  `duplicate`. There is no filter by code: a scenario either builds clean geometry around the
  rule it is about, or lists the other diagnostics it expects. A diagnostic nobody listed fails.

### Writing a scenario

1. Give it the next id in its area (`SF-B7`) and a title that says what must hold:
   `'SF-B7 · a pocket … says …'`.
2. Build it with actions, as a maker would; work the expected numbers out in a comment, from the
   construction, before running it. A number pasted from a run is a characterisation, not a check.
3. Assert the whole list after each step that matters, with `when` saying which step.
4. Add its id to the rule's row in `matrix.ts`, in the class it covers.

### A new rule

A new design rule — or a seam or pocket outcome — fails `matrix.test.ts` until it has a row in
`matrix.ts` and in §4's table. The row needs four classes: **positive** (speaks, with the right
subject, severity and measurements), **negative** (its prerequisites present and satisfied:
silent), **not applicable** (its prerequisites absent, especially where the geometry looks the
part: silent), and **transition** (an edit or an undo turns it on and off, leaving nothing stale).
A class that cannot be written is `exempt`, with the reason; one not written yet is a `gap`, with
what it will be, and is listed as a todo in every run until it is.

### Known defects

A scenario that shows a defect states the **correct** behaviour and is marked `it.fails`, with the
defect in §7 and in `KNOWN_DEFECTS`. When the defect is fixed the scenario passes, `it.fails` then
fails, and the fix removes `.fails` and the entry in the same change. `matrix.test.ts` refuses an
`it.fails` that is not a registered defect, so it cannot be used to quiet a regression. Questionable
behaviour that is not yet a decided defect is asserted as it is, with a comment naming the
question, so a decision changes one test on purpose.

### CI and cost

The suite is a Vitest project, so `pnpm check` and CI run it with no new job: 9 files, 92 tests
(89 passing, 3 known defects) and 16 todos, 2.8 s with CI's 300 property runs; 6.2 s for the
properties at 1000 runs, which found no counterexample. The E2E spec adds two tests, about 5 s, to
the existing shards; it passed three repeated runs in a row.

## 7. Defects and questionable behaviour

### Defects, each kept as a failing scenario

**SF-D1** — *A hole on the cut edge is an error or a warning depending on which way the piece faces.*
Stitching run between two corners of a square-cornered piece ends on the edge it leaves open, so
its first and last holes sit on the cut line. `isOnMaterial` asks `containsPoint`, which has no
defined answer on a boundary: open at the top or right the holes are `OUTSIDE_PART` (error), at
the bottom or left `HOLE_TOO_CLOSE_TO_EDGE` at 0 mm (warning), and turned by a few degrees either,
by rounding. It is the first error a maker meets making a pocket (§3, journey 2). Scenario
**SF-K3**; evidence SF-K2. *Direction:* decide one answer for a hole within a storage quantum of
the edge, as Q2 and Q33 did for lines and hardware rims, and apply it before `containsPoint`.

**SF-D2** — *A pocket sewn onto a larger panel passes a full-insertion check it fails.* DR8 reads
the opening from the outline of the piece the stitching is on. A U stitched on a 120 mm panel with
the pocket's top 41 mm above its bottom stitching is measured to the panel's top edge and passes a
53.98 mm card held fully, saying nothing. D21 named this for slits; it holds for any pocket whose
opening is not that piece's outline, and contradicts D23. Scenario **SF-E4**. *Direction:* let the
maker name the opening edge, as D21 proposes. Until then, Properties can at least show where the
opening it measured to is, so the maker sees the depth was taken to the panel's edge; no threshold
for "too far above" is proposed, because none is known.

**SF-D3** — *A mirrored hardware hole is never checked.* `punchesOf` in `validate.ts` reads a
hardware hole only when its source is a drawn circle; a mirror's source is a derivation. The key
fob's second rivet, a fold mirror, can sit 1 mm from the far end, or off the leather, unreported.
Scenario **SF-J3**; evidence SF-J4. *Direction:* read the resolved circle — its path — for any
`hardware-hole`, as a row's holes are read resolved.

### Questionable, asserted as it is until decided

- **A mirrored pocket keeps its own copy of the requirement** (SF-H4). Clearing the original's
  leaves the counterpart warning. Share it with the original, as its geometry is, or keep copies
  and say so in Properties.
- **A pocket problem's key ignores the requirement** (SF-H6). Harmless now; decisive for 9.16.
- **No template states a purpose** (SF-I2), so a maker can assume a card check that never ran.
- **Hidden features are checked.** A hidden stitch line with a requirement still warns; consistent
  with every other rule, but hidden pieces are not cut.
- **Ease 0 passes silently** when My tools sets none.
- **A command that changes nothing can still be an undo step**: `setFeatureField`'s commands
  return a new document whatever they did, and the store records any new document. The bench
  checks the project instead.

## 8. Plan

### In order

| | Change | Size | Gate |
|---|---|---|---|
| 1 | Fix SF-D3: check mirrored hardware holes by their resolved circle | XS | SF-J3 passes; take off `.fails` |
| 2 | Fix SF-D1: one answer for a hole on the edge, whatever the orientation | S | SF-K3 passes; the 1000-run rotation property extended to square corners |
| 3 | Expose the hole set's start and end offsets in Properties (they exist in the model), and reword `OUTSIDE_PART`'s fix for end holes. Stopping a derived open run short of the edge instead would change what prints: a format version (rule 2) and a paper check | S | A from-scratch pocket with square corners can be made clean in the app (new scenario, E2E) |
| 4 | Fix SF-D2: a requirement is never passed when the opening is not on the stitching's piece; then let a maker name the opening edge | M | SF-E4 passes; D23 true again |
| 5 | 9.16 with a cause: an accepted warning stores its key **and** what it was found from (the requirement, the ease, the hole sets' iron), and returns when either changes | S | Scenarios: accept, edit the cause, warning back; edit something else, still accepted; save and reopen keeps it |
| 6 | "Checked / not checked" lines in Properties from one domain function shared with DR8 (W5) | S | The words and the verdict cannot disagree: the rule calls the function |
| 7 | Discovery: the optional note under *Holds*; a hole set shows its stitch line's pocket problems and a way to it; *Stitched sides* names sides | S | E2E: no note on a closed line or an outline; one on a U |
| 8 | Ease as "the maker's, from My tools" when not typed; then ship the card templates with *Holds: Payment card* | S | Templates still open clean; SF-I2 inverted |
| 9 | *Use as stitching* for a marking line | S | An imported U, converted, reads as a pocket |
| 10 | The sampler of §5, cut and recorded | Maker | Before any tolerance is suggested |

### What should not change

Facts, never sentences, below `apps/desktop`; one diagnostic list; never inferring a seam or a
purpose; no mandatory piece types; rules that report and never block; fixes only when single,
previewed and undoable; requirements as metadata that keeps the format version; and no tolerance
the app has not measured.

### Acceptance criteria for any Smart Features change

- `pnpm test:smart` green, with no new `it.fails` that is not a registered defect.
- A new or changed rule has its matrix row's four classes filled or justified.
- Every scenario that names a rule asserts the **whole** list after each edit.
- Properties over rigid motion, reversal, unrelated edits, save and undo stay green at 1000 runs.
- A pass is never reported as physical fit; every verdict line names what was not counted.
- `pnpm test:e2e` green for `smart-features.spec.ts`; the axe scan finds nothing.
