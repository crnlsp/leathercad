# Seams, pockets and the production summary — design for 1.7 (9.6, 9.12–9.14, 9.17, Q21, 8.14b)

**Status:** design, for the 1.7 plan ([`2026-11-03-release-1.7.md`](../plans/2026-11-03-release-1.7.md)).
Nothing here is built. It replaces the sketch in [domain-model](../../domain-model.md) §7 once 9.6a
lands, and that slice moves what is built into the domain model.

**Evidence.** Every number below was computed with the real evaluator (`evaluate`, `diagnose`) on
the built-in templates at develop 7a69dc9, in a throwaway test that is not part of the repository.
Where a number depends on how a maker assembles the piece, the assumption is written beside it.

---

## 1. The problem, on the templates that ship

**Card holder** (`fixtures/projects/card-holder.lcp`). An *Outer* 105 × 70 mm, corners 4 mm,
stitched 3 mm in all round, 86 holes at a 3.85 mm iron; two *Pockets* 105 × 45 mm sewn onto it
along both sides and the bottom.

| Run | Outer | Pocket |
|---|---|---|
| Each side | 63.57 mm · 18 holes · 3.739 mm apart | 38.00 mm · 11 holes · 3.800 mm apart |
| Bottom | 98.57 mm · 27 holes · 3.791 mm apart | 99.00 mm · 27 holes · 3.808 mm apart |

The pocket's side covers only the lower 38 mm of the outer's 63.57 mm side, so **no pairing of
whole runs describes this seam**, and a count check on runs could not even be asked. Walked from the
bottom corner hole, as a maker does with an awl through both layers, the pocket's 11th side hole is
**0.61 mm** from the outer's (10 × (3.800 − 3.739)). Along the bottom the counts match, 27 = 27, and
the last hole is **0.43 mm** off (26 × (3.808 − 3.791)). Matching counts do not prove the holes line up.

The pocket's stitch line is also a hand-drawn path, not derived from its outline: widen the pocket
and its stitching stays where it was.

**Bifold wallet** (`fixtures/projects/bifold-wallet.lcp`). The *Lining* has no holes at all: it is
built to be punched through together with what lies on it. Its *Card pockets* have 52 holes along
three sides (sides 52.00 mm · 15 holes · 3.714 mm; bottom 87.00 mm · 24 holes · 3.783 mm) and are
sewn through the lining behind its slots. That is a stack punched as one, not two edges with holes
of their own: **a seam check must judge only seams the maker declares**, and must never infer one.

Two questions about the bifold for a maker, which no rule can settle, are in §8.

**Key fob.** Two 4 mm rivet holes at x = 14 and x = 126 across a fold at x = 70 — exact mirrors,
so they meet when folded. They are independent holes: move one and the other stays. And they take
**one** rivet, not two.

## 2. Decisions

| # | Question | Decision | Why |
|---|---|---|---|
| S1 | Where does a partial run live? | **On the seam.** A seam side owns its *stretch*; `Run` (`packages/domain/src/feature.ts`) is not changed | `Run` is read by every derivation (offsets, hole sets). A new arm there would make each of them handle an end that only a seam needs. A stretch is a seam's question: which holes take part |
| S2 | How is a stretch given? | `between` two anchors of the hole set's line (corner to corner; the same anchor twice is the whole closed loop), or `from` one anchor **for the length of the other side**, toward the next or previous anchor | Corners are what a maker points at (ADR 0010 addresses geometry by anchors). The pocket's side ends mid-way along the outer's side, at no corner: its length comes from the pocket. At most one side may be `from` |
| S3 | How are holes compared? | **Walked from the first hole of each stretch, by distance along the line.** Hole *i* on one side pairs with hole *i* on the other; drift is the difference of their distances from their first holes | It is what happens at the bench: line up the first holes, sew along. It needs no placement of one piece on another — the board does not stack pieces, and Sheets packs them apart — and is unchanged by moving, turning or mirroring either piece. It works the same for a gusset along a curved panel, where no common frame exists |
| S4 | The drift limit | **0.5 mm**, one constant in the domain beside the 1.5 mm edge clearance | Half a millimetre is one graduation on the steel rule of the print check, and an eighth of the 3.85 mm pitch most makers use. **Approved** 2026-11-03: at 0.5 mm the card holder's sides are flagged and its bottom passes; at 0.25 mm both are |
| S5 | Severity | Different counts: **error** (a hole with no partner). Drift over the limit: **warning**. The measured drift is shown as information even within the limit | ADR 0013: rules report, never block. A count mismatch is certain to show in the leather; a drift may be absorbed |
| S6 | Does a seam change the format version? | **No** — file-format §4.5 rule 3: a seam changes nothing drawn, cut or printed. **Approved** 2026-11-03 | 1.6 keeps an unknown project key through open, edit and save (`looseObject`, §4.3). What 1.7 must then do: a seam whose hole set has gone — deleted in 1.6 — loads, stays in the file, and is reported (`SEAM_SIDE_MISSING`), never refused or dropped |
| S7 | Where do hole distances come from? | The stitch distributor records each hole's distance along its line (`alongMm` on `StitchHole`), derived and never stored | The distributor already walks arc length (geometry §9); recomputing it by projecting points would be a second, less exact answer |
| S8 | What does a seam check use for direction? | Each side walks from its start toward its end as given by S2. No separate *same / reversed* flag | The stretch's start and direction already say it. Domain-model §7's `alignment` field goes |

## 3. The model

```ts
interface Seam {
  readonly id: SeamId;                  // a ULID, unique among feature and guide ids
  readonly a: SeamSide;
  readonly b: SeamSide;
}

interface SeamSide {
  readonly holeSetId: FeatureId;        // a stitch hole set, or its mirror
  readonly stretch:
    | { readonly kind: 'between'; readonly fromAnchor: number; readonly toAnchor: number }
    | { readonly kind: 'from'; readonly anchor: number; readonly toward: 'next' | 'previous' };
}
```

Project level, `seams?: readonly Seam[]`, as `guides` is. A seam has no name: it is shown by the
two pieces and stretches it joins ("Pocket ×2, left side · Outer, left side from its bottom
corner"). `a` and `b` may be the same part, or the same hole set with two stretches — a pouch
folded and sewn up its sides.

**Structural rules (refused, never listed):** a side names a feature that is not a stitch hole set
(`SEAM_NOT_A_HOLE_SET`); both sides `from` (`SEAM_HAS_NO_LENGTH`); an anchor out of range
(`ANCHOR_MISSING`, existing). **Outcome (listed):** a side's hole set is gone or failed
(`SEAM_SIDE_MISSING`); a `from` stretch runs past the end of its line (`SEAM_RUNS_OFF_THE_LINE`).
**Rule DR7 — pieces sewn together have holes that pair:** `SEAM_HOLE_COUNT_MISMATCH` (error),
`SEAM_HOLES_DRIFT` (warning). Facts, never words: both sides' piece, stretch, count and length; the
hole where drift is largest, its drift in mm. The diagnostic's `partId` is side *a*'s part, its
`featureId` side *a*'s hole set, and `related` holds side *b*'s hole set, so the Problems row names
both and *go to* frames both (diagnostic shape, domain-model §8.6). `problemKey` adds the seam id.

**Deletion (ADR 0009).** Deleting a hole set, or the piece that holds it, lists the seam among what
goes with it; undo brings both back. Duplicating a piece (`duplicatePart`) does not copy its seams:
a copy has no partner until the maker sews it. Mirroring a piece does not either.

**Evaluation cost.** A seam is checked when either hole set changes. PERF-005's reuse of
diagnostics for unaffected inputs extends to seams by their two hole sets' identity.

## 4. Making one (9.6b)

1. Select two hole sets — Shift-click on the board, or in Parts. The context menu and Properties
   offer **Sew together…** (one hole set selected offers it too, for a fold sewn to itself).
2. An inline panel in Properties, no dialog: for each side, a *Where* list of its runs read from
   `RunReport` ("Left side · 38.0 mm · 11 holes", "Bottom · 99.0 mm · 27 holes", "All round"), and
   **Part of a run, from a corner…** with the corner and the direction.
3. While the panel is open the verdict is previewed — counts, drift, both stretches highlighted on
   the board with every fifth pair numbered — through the store's preview, which never enters
   history. **Sew** is one undo step ("Sew Pocket to Outer").
4. Afterwards the **selection bar's third line**, which U.17 left room for (R-14), reads the seam
   for a selected hole set: *Sewn to Outer, left side · 11 = 11 · drifts 0.6 mm*, with the warning
   glyph when over the limit. Properties lists the hole set's seams, each with *Edit* and *Unsew*.

## 5. Worked examples

**Card holder, as shipped.** Sew *Pocket, left side* (`between`, its two corners, walked from the
bottom corner) to *Outer, left side* (`from` its bottom-left corner toward the top-left). The
outer's stretch takes the pocket's 38.00 mm and holds 11 holes (at 0, 3.739 … 37.39 mm). 11 = 11;
the 11th pair is 0.61 mm apart → `SEAM_HOLES_DRIFT`, warning. The bottom seam: 27 = 27, drift
0.43 mm → within the limit, shown as information.

**Card holder, fixed (8.14b, and what 9.17 would propose).** For the side holes to coincide, the
pocket's side stitching must be a whole number of the outer's 3.739 mm gaps: 10 gaps = 37.39 mm.
A pocket 0.61 mm lower (44.39 mm) distributes its 3.85 mm iron over 37.39 mm as 10 gaps of
3.739 mm — drift under 0.01 mm. Its stitch line derived from its own outline, as an open run, gives
its bottom the outer's corners and so the outer's 98.57 mm run: drift 0 there too. That length is
the fix 9.17 offers: previewed, one undo step.

**Bifold.** No seam is declared, nothing is checked, nothing is flagged: the lining is punched
through with the outer and the pockets. A seam needs holes on both sides.

**Gusset (the case counts were designed for).** A gusset's long run `between` its corners sewn to
a panel's three sides `between` the panel's two top corners: the walk goes round the panel's corners
by arc length, and a gusset 2 mm short shows as drift growing to 2 mm at its end.

## 6. Alignment marks (9.13)

Marks at chosen paired holes along a seam — the first and last, or every *n*th — printed on both
pieces at the paired holes, so the pieces line up when glued and stitched.

- A short tick across the stitch line, on the inside of the piece, in the marking role's ink, never
  a notch in the cut edge (a notch is a flaw in an edge that will be burnished). Not the
  registration crosses that join paper sheets (7.2).
- Derived from the seam, so a mark follows its holes when either piece changes; deleting the seam
  takes its marks (ADR 0009).
- **Prints, so it bumps the format** (rule 2): format 13, an identity migration, `fixtures/format/v13.lcp`.
- **Physical check** (print-verification log): print the fixed card holder with marks at the 6th
  side hole; on paper, the distance from the corner hole to the mark along the stitch line is the
  same on both pieces within 0.5 mm.

## 7. Pockets that hold what they must (9.14)

**The reading (9.14a), no requirement needed.** For an **open stitch line** — one with two ends —
Properties and the selection bar show the pocket it makes: the *clear width*, the shortest distance
between its two side runs measured parallel to the line joining its ends, and the *depth*, from
that line to the farthest point of the stitching. Both between hole centres, said so in the label.

**The requirement (9.14b).** The maker says what the pocket holds — a payment card (ID-1,
85.60 × 53.98 mm) or a size they type — and an **ease**, their own, from Settings › My tools if set
there, never invented (product-roadmap decision 6). Kept on the stitch line as metadata
(`holds`), so the format version stays (rule 3).

- `POCKET_TOO_NARROW` (warning, rule **DR8 — a pocket holds what it is for**) when the clear width
  is less than the content's width plus the ease.
- **Depth is reported, not judged, unless asked.** A card holder's pockets are meant to let the
  card stand proud — the shipped one is 38 mm deep for a 53.98 mm card, 16 mm showing. A
  requirement marked *Holds it fully* adds `POCKET_TOO_SHALLOW`.
- **Thickness is not counted** until 9.1: the words say "leather thickness and the stitching's
  pull are not counted — leave ease for them". A geometric fit, never a promise.

**On the templates:** the card holder's pockets are 99.0 mm across between stitch lines for an
85.60 mm card. The bifold's are **87.0 mm** across — 1.4 mm of room for a card between two
stitch lines. §8 asks a maker whether that is too tight.

## 8. Questions for a maker (8.14b)

Settled by someone who makes the item, recorded in the template audit, never guessed by a rule:

1. **Bifold card pockets, 87.0 mm between stitch lines for an 85.60 mm card.** Most card-slot
   patterns leave more. Too tight once the leather is stitched?
2. **Bifold lining inset 2 mm on each side, outer stitched 3 mm in.** Stacked, the stitching runs
   1 mm from the lining's edge, under the 1.5 mm the edge rule asks of a hole in its own piece. Is
   the lining meant to be trimmed flush after stitching, or cut larger?
3. **Key fob rivets.** Make the second hole a fold mirror of the first (4.8b) so they stay paired
   when either moves — the template then teaches the feature, and the summary counts one rivet.

## 9. Decided, and still open

- **S4, the drift limit** — 0.5 mm, approved by the maintainer on 2026-11-03.
- **S6, the format version for seams** — kept at 12, with the dangling-seam rule, approved on
  2026-11-03.
- **Open:** the questions of §8, for a maker, answered in 8.14b.

## 10. The production summary (9.12)

Where Properties shows the project with nothing selected — it already reads *Pieces 3 · 4 to cut,
Holes 250, Sheets 2* — a **Production** section, computed from the pattern, never stored:

| Line | From |
|---|---|
| Pieces to cut, each with its count (×2, and mirrored counterparts as their own pieces) | Parts, quantities |
| Holes per piece, and in all | Hole sets × quantity |
| Hardware by type and diameter, as **holes**; pairs that meet across a fold (fold mirrors) counted once, as one piece of hardware | Hardware holes, fold mirrors |
| **Thread, about** — per seam (both hole sets once), otherwise per hole set | 4 × the stitch length, rounded up to 10 cm: the rule makers quote (product-roadmap decision 8). Labelled an estimate, its rule shown. Thickness-based, once 9.1 knows thickness |
| **Leather, net** — area of each piece's material × quantity, in cm² and dm² | Outline area less cut-outs (`area` in `packages/geometry/src/path/area.ts`) |

Net, never "how much leather to buy": waste, grain and flaws are the maker's (nesting is *Not
planned*). No cost, supplier or stock (*Not planned*: material and cost metadata). A *Copy* button
puts the summary on the clipboard as plain text, in the interface's language.

**Card holder:** 3 pieces to cut (Outer ×1, Pocket ×2); 180 holes; no hardware; thread about 1.3 m
if both pockets are sewn to the outer as seams (the outer's 324.3 mm of stitching once), about
2.7 m if they are not; leather about 168 cm² net.

## 11. Cutting a pair (Q21)

A piece cut twice is either two identical pieces or a left and a right. Today the sheet says
*cut 2* either way, and a maker can cut two lefts. A part's quantity gains **Cut as a mirrored
pair** (even counts only): the sheet's caption reads *Cut 2 — turn the template over for the
second*, Parts and the summary say *1 + 1 mirrored*. It changes what is printed: a format version of
its own (rule 2). Mirrored counterparts built with 4.8 are already separate pieces with their own
captions and are not affected.

## 12. Tests

- **Properties:** a seam's verdict is the same with sides swapped; unchanged by moving, turning or
  mirroring either piece and by save and reopen; equal stretches distributed at the same spacing
  always match; changing one side's count always reports it; drift is monotone in a side's
  length; `alongMm` increases along a run and equals the arc length to the hole.
- **Examples:** the card holder's three seams with the numbers above; the fixed card holder with
  drift 0; a gusset 2 mm short; a pouch sewn to itself; a 1.6-edited file with a dangling seam.
- **Format corpus:** every fixture opens; a file with seams round-trips byte-identical; 1.6's
  loader keeps the `seams` key (a test against the released schema).
- **E2E:** sew the card holder's pocket to its outer from the context menu; the selection bar reads
  the drift; the Problems row names both pieces and *go to* frames both; delete the outer's hole
  set and the dialog lists the seam; undo.
- **Physical:** §6's marks; a sewn test piece of the fixed card holder (should, recorded in the log
  as a construction check).
