# Smart Features — audit, applicability and scenario tests

**What this is.** An audit of the checks LeatherCAD makes about a design — the rules, the
relationships a maker declares, the readings it shows and the fixes it offers — done against the
code at `develop` 82be6f1 (2026-11-17), with every journey below reproduced in the built app or the
evaluator. Then the scenario test suite built from it, in `tests/smart-features`, and how to add to
it. Nothing in the product was changed by this audit: what it found that is wrong is pinned by
scenarios (§7), and what it recommends is a plan for the maintainer to decide (§8).

**Revised after a second pass** (2026-11-18): the first pass's SF-D2 did not reproduce the
construction it named and is now limit **L1**, with the two-piece constructions that do; a tooth
cutting through the edge is a new defect, **KD-3**; defects are numbered `KD-n` so they no longer
share names with scenario area D; and the harness was tightened (§6).

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

- D23 says "a requirement is never silently unchecked". Held fully, the depth is read to the edge
  of the piece the stitching is on; where the pocket's front is another piece, a pass says more
  than was measured (**L1**, §7). And while its stitching fails to build, a requirement is not
  checked, and Properties hides it (**L3**, SF-X1).
- `validate.ts` says edge clearance is "measured from where the leather is cut"; domain-model §8.6
  says from a stitch hole's point. Since 9.26 a stitch hole's cut is its tooth, and a tooth through
  the edge is not reported (**KD-3**).
- Q33 says a hardware hole is judged by its rim. A hardware hole that is a mirror — across a fold,
  as the key fob's second rivet is — is not judged at all (**KD-2**).
- Nothing says a hole on the cut edge is judged by which way the piece faces, and it is
  (**KD-1**).

## 2. Is the architecture right?

**Yes — the hypothesis holds.** Geometric roles, explicit construction relationships, functional
requirements stated where they apply, and deterministic validation are the right foundations. The
three defects are local bugs. The one place a relationship is missing — which piece's edge is a
pocket's opening (L1) — is a statement to add, not a layer.

### Strengths, with the evidence

- **Facts, not sentences.** A diagnostic is a code, a subject and its measurements. Scenarios
  assert `widthMm: 84, neededMm: 87.6` and survive every rewording; the app words them in every
  language (ADR 0018).
- **One list.** Every surface reads `diagnose`, so Properties, Problems and the Print count cannot
  disagree. The suite checks that one list, and so checks all of them at once.
- **Nothing is inferred.** A seam is checked only when declared (scenario SF-D2: two pieces stacked
  with different counts say nothing); a requirement only when stated (SF-C1, SF-D1, SF-D3). This is
  what keeps a keeper loop from being told it cannot hold a card.
- **"Not checked" is a result.** A requirement the geometry cannot be read for says so
  (`POCKET_NOT_MEASURABLE`, SF-E1–E3) instead of passing.
- **Pure and memoised.** Rules are functions of evaluated geometry, reused while their inputs are
  the same objects, so the suite's 108 tests — scenarios, properties and the harness's own — run
  in about two seconds.
- **The failing checks are sound.** *Too narrow* compares the stitching's own width; *too shallow*
  compares a depth that can only be smaller in the real pocket (the depth property, L1). Neither
  can be wrong in the maker's disfavour; only a pass can say too much.
- **Readings are separate from judgments.** A U of stitching always shows its width and depth; only
  a stated purpose turns that into a verdict.

### Weaknesses

| # | Weakness | Evidence |
|---|---|---|
| W1 | Which piece's edge is a pocket's opening is not modelled; DR8 takes the stitching's own piece. Exact for a pocket stitched on its own piece, an upper bound otherwise — even when a declared seam joins the two | SF-E4, SF-E6, SF-E7, the depth property (L1) |
| W2 | Points exactly on an edge have no defined answer in `containsPoint`, and stitch holes are asked it | SF-K3 (KD-1) |
| W3 | Mirrored hardware holes are never asked where they sit | SF-J3 (KD-2) |
| W8 | A stitch hole is judged at its centre, though 9.26 knows the tooth that cuts it and SVG and DXF cut that tooth | SF-K4–K6 (KD-3) |
| W4 | A pocket problem's identity (`problemKey`) holds nothing of the requirement, so 9.16 cannot tell an accepted warning from a new one by key alone | SF-H6 |
| W5 | A pass is silence. The domain returns no record of which checks ran, passed, or could not run, so the app cannot say "checked: 94 mm across, 87.6 mm needed" without computing again | Properties shows readings and notes, never a verdict line |
| W6 | A requirement is copied, not shared, when its stitching is mirrored, then diverges | SF-H4 |
| W7 | Domain tests for DR7 and DR8 filter the list to their own codes, so they cannot see another diagnostic appear beside theirs — which is how KD-1 went unnoticed | `validate.test.ts` (`pocketCodes`) |

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
  a type — and, where the maker has already sewn the front to the panel, reading that seam (SF-E7).

Tags for finding templates (9.25) are a separate matter, about search, and need not feed any rule.

## 3. UX: ten journeys

Observed in the built app on Linux (Playwright on a hidden screen, at 1440 × 900) for 1 and 2;
from the code and the scenarios for the rest.

| # | Journey | What happens | Clicks | Risk | Recommendation |
|---|---|---|---|---|---|
| 1 | Four arbitrary rectangles | *Problems: Nothing to fix.* Selecting one shows its size, name and Arrange; the selection bar offers the construction's next steps (*Stitch line › Stitch holes › Seam allowance*). No purpose asked | 0 extra | None | **Keep.** Do not add a "purpose not specified" hint to outlines: it would appear four times, and stating a purpose for an outline unlocks no check |
| 2 | A card pocket from scratch | Rectangle; *Stitch line* step; *Stitched sides* › *Between corners* defaults to Corner 1 → Corner 4, which leaves the **bottom** open; the board showed no corner numbers, so the maker guesses Corner 3 → Corner 2; *Stitch holes*. With square corners the end holes land on the cut edge: **1 error**, on the Print button, worded "holes that leave the material", whose fix says to change the inset — which cannot help. No control in the app moves the end holes in (`startOffsetMm` exists, unexposed). Then *Holds* appears under *Stitching dimensions* | ≈ 8, and a guess | High: a first pocket ends in an error the maker cannot clear except by rounding the corners | Fix KD-1. Name the sides in *Stitched sides* ("Open at the top") or number the corners on the board while the field has focus. Expose the hole set's start and end offsets. A one-line note under *Holds: Nothing stated* — "Say what goes in to check that it fits" — only where a pocket reading exists |
| 3 | Opening the bifold | Clean. Its pocket stitching reads 89 × 53 mm; *Holds: Nothing stated*; no card check runs | 1 to say *Payment card* | Medium: a maker may believe the template's pockets were checked for a card | Ship the card templates with *Holds: Payment card* (not fully). Needs the ease decision in §8 first: today a requirement copies an ease, and a template cannot know the maker's |
| 4 | Changing a pocket checked before | Recomputed on every evaluation; warnings come and go exactly (SF-B3, H7, I5). Selecting the **holes** — what the board shows most — gives the reading but neither the requirement nor its warning, which are on the stitch line | 1 extra to find the stitch line | Medium | When a hole set is selected, show its stitch line's pocket problems, and a button that selects the stitch line (D24 foresaw it) |
| 5 | An SVG with no layer names | Open paths arrive as markings. No command turns a marking into stitching, so seams and pocket checks are out of reach without redrawing | Redraw | Medium | *Use as stitching* on a marking line (and back), one undo step. The preview could say that a layer named `stitch` brings lines in as stitching |
| 6 | A strap, a key fob | Universal rules only; nothing about pockets or seams (SF-J1, J2). The fob's mirrored rivet is not checked (KD-2) | 0 | High until KD-2 is fixed: the template teaching fold mirrors teaches an unchecked hole | Fix KD-2 |
| 7 | A pocket-shaped piece that is not one | Properties shows *Stitching dimensions* and *Holds: Nothing stated*; no warning (scenario SF-D1) | 0 | Low: *Holds* could read as a field to fill | The note in journey 2 must read as optional: "Say what goes in…", never "Purpose missing" |
| 8 | Accepting a valid warning | Impossible: 9.16 is not built. The only ways to quiet a warning are to change the requirement or the ease, which falsifies the design | — | High for real projects with deliberate choices | Build 9.16 with the criteria in §8 |
| 9 | Changing a requirement after accepting its warning | Would keep the acceptance: the key does not change (SF-H6) | — | High once 9.16 ships | 9.16 stores what the warning was found from — the requirement, and the ease — and drops the acceptance when it changes |
| 10 | What 2D cannot know | Notes say leather thickness and stitch pull are not counted; "stands 9.63 mm above the opening" is a geometric reading. Ease defaults to 0, so 85.6 mm passes a card with nothing to spare, silently | — | Medium: a pass with 0 ease is the kind of false confidence to avoid | The five states of §5, said in Properties from one domain function shared with DR8 (W5) |

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
| `POCKET_TOO_SHALLOW` | DR8 · warning | As above, *Holds it fully*, and an opening on the outline above both stitch ends | Depth below the opening < content's height (ease not counted, D22) | Not held fully (a card meant to stand proud) | No opening found → `POCKET_NOT_MEASURABLE`. The front is another piece → read to the stitching's own edge, an upper bound, and passed (**L1**) |
| `POCKET_NOT_MEASURABLE` | DR8 · warning | *Holds* | No pocket reading; held fully and no opening | Nothing stated | — |
| `SEAM_HOLE_COUNT_MISMATCH` | DR7 · error | A declared seam whose sides resolve | Paired stretches hold different numbers of holes | No seam declared, however alike two pieces are | — |
| `SEAM_HOLES_DRIFT` | DR7 · warning | As above, counts equal | Worst pair more than 0.5 mm apart along the stitching from the first holes | Within 0.5 mm (kept as information) | — |
| `SEAM_SIDE_MISSING` | E3 · error | A declared seam | A side's hole set is gone or failed (an older version's delete) | The app's own delete removes the seam too | — |
| `SEAM_RUNS_OFF_THE_LINE` | E4 · error | A seam side following the other's length | That length runs past the end of its line | — | — |
| `HOLE_TOO_CLOSE_TO_EDGE` | DR2 · warning | Holes in a piece with an outline | A stitch hole's point, or a hardware or row hole's rim, within 1.5 mm of an edge | Clear of every edge | A hole exactly on the edge: this or `OUTSIDE_PART`, by orientation (**KD-1**). A mirrored hardware hole: never asked (**KD-2**). A stitch hole is read at its centre, not its tooth (contract, §7) |
| `OUTSIDE_PART` | DR2 · error for holes, warning for lines | A piece with an outline | Holes off the leather; a line leaving it (sampled, §8.4) | Lines that end on the edge, within a storage quantum | As above; a stitch tooth through the edge is not read (**KD-3**) |
| `CUT_OUT_OUTSIDE_PART` | DR2 · error | A cut-out and an outline | Part of the cut-out lies outside the outline (sampled) | — | — |
| `PART_HAS_NO_OUTER_CONTOUR` | DR1 · error | A piece with features | None of them is its outline | An empty piece (that is `EMPTY_PART`) | — |
| `CONTOUR_SELF_INTERSECTS` | DR3 · error | An outline or cut-out | It crosses itself | — | — |
| `HOLES_OVERLAP` | DR3 · warning | A row of round holes | Neighbours no more than a diameter apart | — | Holes meeting across a tight bend, not neighbours |
| `HOLE_SPACING_DEVIATION` | DR4 · warning | A hole set | Achieved spacing more than 25 % from the iron | — | — |
| `HOLE_SPACING_UNEVEN` | DR4 · info | A hole set with runs | Runs' spacings differ by more than 5 % of the pitch | — | — |
| `HOLE_COUNT_TOO_LOW` | DR4 · warning | A hole set | Fewer than two holes | — | — |
| `TEXT_TOO_SMALL_TO_PRINT` | DR5 · warning | A label | Capital height under 1.5 mm | — | — |
| `EMPTY_PART` | DR6 · info | A piece | It holds nothing | — | — |

**Coverage today:** every row has a positive scenario but `HOLE_COUNT_TOO_LOW`'s. DR7 and DR8 are
covered in all four classes but `SEAM_RUNS_OFF_THE_LINE`'s negative and transition — the two gaps,
printed as todos by every run. Seven classes are `exempt`, with the reason: a rule about one
feature's own geometry (self-crossing, spacing, hole count, text size) gains nothing from a project
around it, so its boundaries stay in the domain's tests, and undo is held for every edit by SF-H7
and the undo property. Each claim is checked when the scenario runs (§6), not only named.

## 5. What each rule establishes

LeatherCAD must not say more than it knows. Each threshold, and what kind of claim it is:

| Claim | Kind | Source | Overstates when |
|---|---|---|---|
| A payment card is 85.60 × 53.98 mm | **Fact** | ISO/IEC 7810 ID-1 | — |
| Width between stitch lines, stitch depth | **Geometric fact** | `pocketSize`, between stitch centres | Read as room for the card: the thread, the iron's tooth and the leather's thickness all take space inside the centres |
| What the pocket holds, and the ease | **The maker's requirement** | *Holds*, *Pocket ease* in My tools | Ease left at 0: a pass then means "not narrower than the card" and nothing more |
| `POCKET_TOO_NARROW` / its absence | **Verified constraint**, geometric | DR8 | Its absence is taken as "the card fits". It says only that the stitch centres are as far apart as the content and its ease |
| Depth below the opening | **Geometric fact about the stitching's own piece**, and an **upper bound** on the pocket's (D21) | `depthBelowOpening` | Read as the pocket's depth when its front is another piece (L1: SF-E4, SF-E7) or it opens through a slit (D21). *Too shallow* is never wrong; a pass is "not disproved" |
| A stitch hole's clearance from an edge | **Contract**: measured from the hole's centre (domain-model §8.6) | DR2 | The tooth is wider than the hole's point: at the 1.5 mm minimum the shipped styles' teeth come within 0.66–0.9 mm of the edge, and a typed tooth can cut through it (KD-3) |
| 1.5 mm between a hole and an edge | **Expert recommendation**, not universal | `MIN_HOLE_EDGE_CLEARANCE_MM` | Thin firm leather carries less; soft thick leather needs more. The warning says so |
| Spacing within 25 % of the iron; runs within 5 % | **Heuristic** | DR4 constants | — |
| Seam drift within 0.5 mm | **The maintainer's decision** (D4): one graduation of the steel rule | `SEAM_DRIFT_LIMIT_MM` | Checked in leather on one card holder (the [log](print-verification-log.md)); the limit's general adequacy is not established |
| 1.5 mm capital height | **Recommendation** | DR5 | — |
| Leather thickness, stitch tension, how many cards, stretch with use, wrapping round a fold | **Unknown** | Not modelled until 9.1 | Any reading taken as physical fit |

### Five states, and how Properties says them

What a maker sees for a pocket requirement must say which of these it is, and nothing more. All of
it lives in the *Holds* section of the stitch line's Properties, which only open U stitching has: no
new panel, toast, badge or dialog, and nothing on the board for a pass.

| State | Domain today | Properties should say | Problems |
|---|---|---|---|
| **Nothing stated** | No `holds` | The reading only; under *Holds: Nothing stated*, one optional line: "Say what goes in to check that it fits" | Nothing |
| **Checked, met geometrically** | No diagnostic | One line per check, with both numbers and what they were measured to: "94 mm between stitch lines, 87.6 mm stated (card 85.6 + ease 2)"; held fully: "57 mm below Pocket's edge, 3 mm above the stitch ends; 53.98 mm stated". Never "fits" | Nothing |
| **Checked, not met** | `POCKET_TOO_NARROW` / `_SHALLOW` | The same line, marked as short by how much, beside the problem row it already shows | One warning |
| **Cannot be checked** | `POCKET_NOT_MEASURABLE` | "Not checked: …" with the reason the problem gives; and while the stitching fails to build, the requirement still shown, with "Not checked until the stitch line builds" (L3) | One warning, or the root failure |
| **Not verified physically** | Nothing — no model | One note under the lines, always, never per line: "Geometric only — leather thickness, stitch pull and how many cards are not counted" | Nothing |

Two things make the met state honest without inventing geometry: the depth line names the piece
whose edge it measured to, so a maker who stitched on the panel reads "below Panel's edge, 78 mm
above the stitch ends" and sees why (L1); and with no ease the width line says "no ease" rather
than nothing. The lines come from one domain function that DR8 itself calls (W5), so the words and
the verdict cannot disagree.

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
  action as one undo step and **throws if it changed nothing** — the same project, or a new one
  that saves the same — so no scenario passes on an edit that silently did not happen (a refused
  delete, a wrong id, a value set to what it was; it found two property generators moving pieces
  by zero). `undo`, `redo`, `saveAndReopen` (through the real file format, fixed clock),
  `Bench.open('card-holder')` for a shipped file, and `expectDefect` (below).
- **Actions** (`harness/actions.ts`) — a maker's steps by name, each the command the app dispatches:
  `drawRectangle`, `stitchLeavingOpen(piece, 'top', 3)`, `punchHoles`, `holdsCard(stitch, ease,
  fully)`, `resize`, `turnPiece`, `sew`… Ids follow one pattern: piece `pocket` has
  `pocket-outline`, `pocket-stitch`, `pocket-holes`.
- **`expect([...])`** (`harness/expectDiagnostics.ts`) — the whole list, exactly. Each entry names
  a code, a severity, the feature (`on`, or `part:<id>`), optionally the related features, the
  facts to check (numbers within `EPS_LENGTH`, or `within(value, tolerance)`), and where it is
  marked (`location`: `'path'`, `'none'`, or which or how many points — say it wherever "which
  hole" is what the maker must act on). Every diagnostic is also checked to be filed under the
  piece that holds its feature. `expect([])` claims nothing at all is said. A failure prints every difference by kind, then both lists:

  ```
  Smart Features: the diagnostics after widening are not what the scenario expects.
    facts       POCKET_TOO_NARROW on pocket-stitch — widthMm: expected 83, got 84
    unexpected  OUTSIDE_PART (error) on pocket-holes {"what":"holes", …}
  Expected (1): …
  Actual (2): …
  ```

  The kinds are `missing`, `unexpected`, `severity`, `target`, `related`, `facts`, `location`,
  `part` and `duplicate`. There is no filter by code: a scenario either builds clean geometry around the
  rule it is about, or lists the other diagnostics it expects. A diagnostic nobody listed fails.

### Writing a scenario

1. Give it the next id in its area (`SF-B7`) and a title that says what must hold:
   `'SF-B7 · a pocket … says …'`.
2. Build it with actions, as a maker would; work the expected numbers out in a comment, from the
   construction, before running it. A number pasted from a run is a characterisation, not a check.
3. Assert the whole list after each step that matters, with `when` saying which step.
4. Add its id to the rule's row in `matrix.ts`, in the class it covers, and call
   `checkMatrixClaims()` once at the top of a new scenario file. When the file's scenarios have
   run, each is held to its claims against the states its bench was checked in: *positive* — a
   state lists the code; *negative* — a state meets the rule's prerequisites (a requirement, held
   fully, a seam) and does not list it; *not applicable* — a state does not meet them and does not
   list it; *transition* — one bench lists it in one state and not the next. A claim the scenario
   no longer shows fails the run by name.

### A new rule

A new design rule — or a seam or pocket outcome — fails `matrix.test.ts` until it has a row in
`matrix.ts` and in §4's table. The row needs four classes: **positive** (speaks, with the right
subject, severity and measurements), **negative** (its prerequisites present and satisfied:
silent), **not applicable** (its prerequisites absent, especially where the geometry looks the
part: silent), and **transition** (an edit or an undo turns it on and off, leaving nothing stale).
A class that cannot be written is `exempt`, with the reason; one not written yet is a `gap`, with
what it will be, and is listed as a todo in every run until it is.

### Known defects

A defect is pinned, not expected to fail: `bench.expectDefect('KD-n', { now, correct })` asserts
the list is exactly what the defect makes it today, and that this differs from the correct list
written beside it. `it.fails` was used first and was too forgiving — a scenario whose setup broke
(a renamed id) stayed green as an "expected failure". Pinned, a broken setup, a different wrong
answer and the fix all fail it; the fix then asserts `correct` and removes the entry from
`KNOWN_DEFECTS`, in the same change. `matrix.test.ts` refuses `it.fails` anywhere in the scenarios,
and holds each defect to its title (`'SF-K3 · KNOWN DEFECT KD-1 · …'`), its pin and §7.

A **limit** — the model lacks something, and reads what it has correctly — is asserted as it
behaves, with a comment naming the limit (SF-E4, SF-E7); so is behaviour still awaiting a decision
(SF-H4, SF-H6). A decision then changes one test on purpose.

### The app, once the journeys are improved

Each UX change of §8 brings one E2E test to `e2e/smart-features.spec.ts`; together they are the
minimum that proves the workflows, about 10 s more:

| Change | The test |
|---|---|
| Sides named in *Stitched sides* | From a square-cornered rectangle, choose *Open at the top*; the board marks the run, Properties reads 94 mm across, and the opening is above the stitch ends |
| Hole offsets in Properties | The same pocket with its end holes on the edge: *Problems* says 1 error; type 3 mm start and end offsets, *Nothing to fix*; undo brings the error back. Reachable by keyboard |
| Requirement shown from the holes | Click a hole on the board (not the parts tree): Properties shows the stitch line's *Pocket too narrow* and a button to its stitch line; pressing it selects the line with *Holds* focused; axe clean |
| *Use as stitching* | Import an SVG with an unlayered open U (`e2e/svgPatterns.ts`): it is a marking; *Use as stitching* makes it a stitch line with a reading and *Holds*; undo makes it a marking again |
| The five states | One test walks a U through nothing stated, met, not met and not measurable, reading each line, and finds no line on a closed stitch line or an outline |

### CI and cost

The suite is a Vitest project, so `pnpm check` and CI run it with no new job: 10 files, 108 tests
(three of them pin known defects) and 2 todos, about 3 s with CI's 300 property runs; the
properties take about 8 s at 1000 runs and found no counterexample. The E2E spec adds two tests,
about 5 s, to the existing shards; it passed three repeated runs in a row.

## 7. Defects, limits and questionable behaviour

### Defects, each pinned by its scenario

**KD-1** — *A hole on the cut edge is an error or a warning depending on which way the piece faces.*
Stitching run between two corners of a square-cornered piece ends on the edge it leaves open, so
its first and last holes sit on the cut line. `isOnMaterial` asks `containsPoint`, which has no
defined answer on a boundary: open at the top or right the two end holes are `OUTSIDE_PART`
(error), at the bottom or left `HOLE_TOO_CLOSE_TO_EDGE` at 0 mm (warning), and turned by a few
degrees either, by rounding. It is the first error a maker meets making a pocket (§3, journey 2).
Scenario **SF-K3**; evidence SF-K2. *Direction:* one answer for a hole within a storage quantum of
the edge, as Q2 and Q33 did for lines and hardware rims, applied before `containsPoint`.

**KD-2** — *A mirrored hardware hole is never checked.* `punchesOf` in `validate.ts` reads a
hardware hole only when its source is a drawn circle; a mirror's source is a derivation. The key
fob's second rivet, a fold mirror, can sit 1 mm from the far end, or off the leather, unreported.
Scenario **SF-J3**; evidence SF-J4. *Direction:* read the resolved circle — its path — for any
`hardware-hole`, as a row's holes are read resolved.

**KD-3** — *A stitch tooth that cuts through the edge is not reported.* Since 9.26 a hole set
knows its tooth, and SVG and DXF cut its true outline (D27); the rules still read a stitch hole as
its centre. A typed 4 mm round prong 1.6 mm in passes the 1.5 mm rule and cuts a notch out of the
edge at all 80 holes; the same punch placed as a rivet is `OUTSIDE_PART`, an error (SF-K5). A cut
through the edge is a fact, not a clearance to choose. Scenario **SF-K4**. *Direction:* where a
hole set has a tooth, ask whether its outline leaves the material, as for hardware. Reachable only
with a typed tooth: every style the app fills, at every starter iron, stays clear at the 1.5 mm
minimum (SF-K6).

### Limits: the model reads correctly what it has

**L1 — which piece's edge is a pocket's opening.** (The first pass's SF-D2. Its scenario was one
tall piece with a U stitched on it — a construction the app reads correctly as a deep pocket — so
it showed nothing wrong.) Pieces are drawn apart, never stacked; DR8 reads the opening from the
piece the stitching is on. That is exact when the pocket piece carries its own stitching (the card
holder; SF-E6 reports *too shallow* correctly) and an **upper bound** otherwise, because the real
opening can only be lower: the depth property shows depth never grows as the edge comes down, so
*too shallow* is always sound and only a pass can overclaim. It does, in two real constructions:
the holes punched through panel and front together, so only the panel has stitching (SF-E4, read
117 mm deep for a 41 mm pocket); and a front with its own stitching sewn to the panel by a declared
seam, the requirement on the panel's (SF-E7) — there the model holds the relationship and DR8 does
not read it. *Safest change, no invented geometry:* never present a full-insertion pass as fitting;
say what was measured, naming the piece and the rise above the stitch ends (§5). Then, by evidence:
read declared seams for the lower opening (SF-E7), and let a maker name the opening edge (D21) for
SF-E4. No threshold for "too far above the stitch ends" is proposed: none is known.

**L2 — teeth that overlap each other.** 9.26 decided `STITCH_HOLES_TOUCH` was not needed because
no template's teeth can meet. With a typed tooth they can — a 4 mm prong at a 3.9 mm spacing cuts
one slot — and nothing says so, as `HOLES_OVERLAP` does for a row. A decision for the maintainer.

**L3 — a requirement on stitching that fails to build.** An inset its piece cannot take collapses
the line: `OFFSET_COLLAPSED` at the root, `SOURCE_FAILED` on its holes, and DR8 does not run
(SF-X1). That follows E3 — one failure, said at its root — and the requirement is kept and checked
again once the line builds. But Properties hides *Holds* while the line fails, so the requirement
cannot be seen or taken away then (§5's fourth state).

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

What became of each step — Q44–Q49 in 1.7, the rest suggested for 1.8 or kept in a backlog — is
in [the Smart Features backlog](superpowers/plans/2026-11-18-smart-features-backlog.md) (2026-11-18).

### In order

| | Change | Size | Gate |
|---|---|---|---|
| 1 | Fix KD-2: check mirrored hardware holes by their resolved circle | XS | SF-J3 asserts its correct list |
| 2 | Fix KD-3: a stitch tooth that leaves the material is `OUTSIDE_PART`, as hardware is. Whether clearance should then be measured from the tooth is the maintainer's: it moves verdicts on toothed sets at small insets, and the 1.5 mm figure was chosen for points | S | SF-K4 asserts its correct list; SF-K6 still silent |
| 3 | Fix KD-1: one answer for a hole on the edge, whatever the orientation | S | SF-K3 asserts one list for all four; the rotation property extended to square corners |
| 4 | L1, first step: Properties says what a full-insertion pass measured to (piece, rise), never "fits" | S | E2E: SF-E4's construction reads "below Panel's edge" |
| 5 | Expose the hole set's start and end offsets, and reword `OUTSIDE_PART`'s fix for end holes. (Stopping a derived open run short of the edge instead changes what prints: a format version and a paper check) | S | §6's E2E for offsets |
| 6 | 9.16 with a cause: an accepted warning stores its key **and** what it was found from (the requirement, the ease, the hole sets' iron), and returns when either changes | S | Scenarios: accept, edit the cause, warning back; edit something else, still accepted; save and reopen keeps it |
| 7 | The five states of §5 from one domain function DR8 calls; *Holds* kept visible while its line fails (L3) | S | §6's E2E for the states; a property that the lines and DR8 never disagree |
| 8 | Discovery: the optional note; holes show their stitch line's requirement; *Stitched sides* names sides | S | §6's E2E |
| 9 | L1, second step: DR8 reads declared seams for the lower opening | M | SF-E7 reports *too shallow*; SF-E6 unchanged |
| 10 | Ease as "the maker's, from My tools" when not typed; then ship the card templates with *Holds: Payment card* | S | Templates still open clean; SF-I2 inverted |
| 11 | *Use as stitching* for a marking line | S | §6's E2E |
| 12 | Decide L2 (`STITCH_HOLES_TOUCH` for typed teeth) and L1's named opening edge | Decision | — |
| 13 | The sampler of §5, cut and recorded | Maker | Before any tolerance is suggested |

### What should not change

Facts, never sentences, below `apps/desktop`; one diagnostic list; never inferring a seam or a
purpose; no mandatory piece types; rules that report and never block; fixes only when single,
previewed and undoable; requirements as metadata that keeps the format version; and no tolerance
the app has not measured.

### Acceptance criteria for any Smart Features change

- `pnpm test:smart` green: no `it.fails`; every known defect pinned by `expectDefect` and in §7;
  every matrix claim shown by the states its scenario checks.
- A new or changed rule has its matrix row's four classes filled, or exempt with a reason.
- Every scenario that names a rule asserts the **whole** list after each edit, and where "which
  hole" matters, the location.
- A fix flips its defect's pin to the correct list in the same change.
- Properties over rigid motion, reversal, unrelated edits, save, undo and the opening's upper bound
  stay green at 1000 runs.
- A pass is never reported as physical fit; every verdict line names what it measured to and what
  was not counted.
- `pnpm test:e2e` green for `smart-features.spec.ts`, with §6's test for each UX change it ships;
  the axe scan finds nothing.
