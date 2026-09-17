# Mirror across a fold (slice 4.8b) — design

**Date:** 2026-09-18
**Status:** Accepted — all three open questions answered yes (2026-09-18)
**Builds on:** [4.8a](2026-09-17-mirror-design.md), which delivered the mirror operation
**Invariants touched:** S2 and S3 gain their first *references* edge; S5 draws the line this slice
respects rather than fights

---

## 1. The finding that shapes this slice

The obvious pitch for 4.8b is "draw half a symmetric panel, mirror it across the fold line, get the
whole panel". **That does not work, and it is worth saying why before designing around it.**

A part has **at most one outer contour** (S5). Mirroring a half-outline across a fold in the same
part would give the part a second one, and the command refuses it — correctly. Making it *one*
contour instead needs a boolean union of the half and its reflection, and there is no boolean
engine: [ADR 0008](../../adr/0008-no-clipper-binding.md) declined Clipper and Tier 2 offsetting is
slice 9.11. So a symmetric outline from half of itself is **not available in Phase 4**, by a
constraint we chose on purpose.

Walking a real wallet through it shows this matters less than it sounds:

> A bifold shell is a rounded rectangle 190 × 95 with a fold down the middle. Nobody draws half of
> that and mirrors it — they draw the rectangle. What they draw twice, and get wrong twice, is
> **everything inside it**: the card slots, the stitch runs, the hardware. A wallet interior with
> three card slots on the left and three on the right is six cut-outs that must agree, and today
> they agree only as carefully as the maker nudged them.

So **fold symmetry is about the features inside a piece, not its edge.** That is where the value is,
it is what the fold line is actually for, and it needs no boolean anything. This slice does that,
and refuses the outline case with a message that names the two real alternatives.

## 2. The scenario, end to end

**A bifold card wallet interior.** What the maker does, and what the app does:

| # | The maker | The app |
|---|---|---|
| 1 | Draws the shell: a rounded rectangle 190 × 95 | One part, *Shell*, with an outer contour |
| 2 | Draws a fold line down the middle, valley | A `fold-line` feature at x = 95 |
| 3 | Draws three card-slot cut-outs on the **left** half | Three inner contours |
| 4 | Selects the three slots **and the fold line**, presses **Mirror across fold** | Three counterparts on the right half, each mirror-derived from its own slot, each tracking the fold |
| 5 | Decides the slots sit 2 mm too high; drags one original slot down | Its counterpart follows, still level with it |
| 6 | Decides the wallet should be 200 wide; edits the outline, then drags the fold to the new centre | **Every counterpart re-mirrors about the fold's new position.** The right half stays the mirror of the left |
| 7 | Adds a stitch line round the outline and holes on it | Unmirrored — the seam runs round the whole shell, not per half |
| 8 | Tries to mirror the **outline** across the fold | Refused, naming why and what to do instead |

Step 6 is the slice. In 4.8a the axis is captured and frozen, so widening the piece leaves the
counterpart behind. Here the axis **is** the fold line, so moving the fold moves both halves' worth
of geometry into agreement. That is the difference between a one-shot copy and symmetry a maker can
keep working with.

## 3. Acceptance criteria

1. **Mirror across fold** is offered when the selection holds exactly one `fold-line` and at least
   one other mirrorable feature. The fold is the axis; it is not itself mirrored.
2. The counterparts join the **same part**, because a fold is inside one piece of leather.
3. **Moving, turning or reshaping the fold line re-mirrors every counterpart that tracks it.**
4. A **bent or curved** fold line cannot be a mirror axis, and says so rather than picking one of its
   segments.
5. Mirroring an **outer contour** across a fold is refused, naming the two real alternatives.
6. **Stitch lines and hole sets** mirror the way 4.8a already established — each from its own
   counterpart — so a mirrored hole set has exactly as many holes as its source.
7. **Dragging a fold-tracked counterpart is refused**: it is placed by the fold. The refusal says so.
8. **Deleting the fold line** offers, through the existing dialog, to **freeze the axis** — the
   counterpart keeps its shape and its link to its source, and stops tracking the fold.
9. **Mirror part** makes a second, separate piece for a left/right pair, with a name and a quantity
   that do not lie about what it is.
10. A **label** is never mirrored, by either gesture.

## 4. The axis becomes two things

4.8a stores a captured line. Tracking a fold needs a second form:

```ts
type MirrorAxis =
  | { kind: 'line'; origin: Vec2; angleRad: Radians }  // captured once — 4.8a
  | { kind: 'fold'; foldId: FeatureId };               // tracks the fold — 4.8b
```

### This makes mirror the first two-input derivation

`Derivation`'s own comment anticipated it:

> One source, one operation. … there is deliberately no array of sources reserved "for later". A
> genuinely two-input derivation is a new variant, and adding it then costs less than carrying the
> generality now.

This is that case, and it costs less than the generality would have. A fold-tracking mirror has:

- a **derives** edge to its source — its geometry is built from it;
- a **references** edge to the fold — it points at the fold's geometry without being built from it.

Both edge kinds are already in the model ([reconciliation §3.3](2026-09-15-phase-4-reconciliation-design.md));
this is simply the first *references* edge to be built, arriving in 4.8b rather than with
measurements in 4.10. S2 (every edge resolves) and S3 (acyclic across **both** kinds) extend to it,
which is a change to the loader's checks and not merely to a command's.

**This is not a constraint system.** One derivation reads one referenced line at evaluation time,
exactly as an offset reads its source. There is no solver, nothing is bidirectional, and moving the
counterpart does not move the fold.

### What the fold contributes

The axis is the **infinite line through the fold's evaluated path**, which therefore requires that
path to be straight:

- a two-point line, or collinear segments, gives the axis;
- **anything bent or curved is refused** with `FOLD_NOT_STRAIGHT`. Picking one segment of a bent
  fold would be a silent guess about which part of the piece is being mirrored, which is exactly the
  class of wrongness this project treats as the worst kind.

**`glideMm` is fixed at 0 for a fold axis.** A glide would slide one half of a folded piece along
the spine relative to the other, which is not a thing anyone wants and is not what a fold means.

## 5. Manipulating a fold-mirrored counterpart

4.8a's counterpart is placed by dragging it. A fold-tracked one is **placed by the fold**, and that
difference is the feature rather than a limitation.

| The maker | What happens |
|---|---|
| Moves, turns or reshapes the **fold** | Every counterpart re-mirrors about it. The persistent symmetry. |
| Moves or reshapes the **original** | Its counterpart follows, as always. |
| Drags the **counterpart** | **Refused:** *"This is mirrored across Fold. Move the fold, or the piece it mirrors."* |
| Scales or reshapes the counterpart | Refused as in 4.8a. |
| Renames, hides, locks, deletes it | Its own, as in 4.8a. |

Refusing the drag is deliberate. The two alternatives both lie: absorbing it into a glide slides one
half along the spine, and silently converting the axis to a captured line breaks the link the maker
asked for — which X3 forbids. A refusal that names the fold is the only honest answer, and it points
at the control that *does* work.

**Detaching is available, but only by asking.** Deleting the fold (§8) offers to freeze the axis,
which is the deliberate way to turn a tracked mirror into a placed one.

## 6. Where the counterpart goes, and what it is called

**The axis kind decides the destination**, and it maps onto a physical fact:

| Gesture | Axis | Result | The leather |
|---|---|---|---|
| **Mirror ↔ / ↕** (4.8a) | captured edge | counterpart in the same part | one piece, placed once |
| **Mirror across fold** (4.8b) | a fold line | counterpart in the **same part** | **one piece that bends** |
| **Mirror part** (4.8b) | captured edge | a **new part** | **two pieces** — a left and a right |

A fold is *inside* a piece, so its mirror stays in the part. A left and a right gusset are two
pieces, so a part mirror makes a second part.

**Naming.** Counterpart features keep 4.8a's `<name> mirrored`. A mirrored part is `<name> mirrored`
and the maker renames it to *Right gusset* if they like.

**Quantity must not be used for a pair.** `Part.quantity` means "cut this many of this shape", and a
mirrored pair is two *different* shapes — cutting two of one would give a maker two left gussets and
a ruined evening. So a mirrored part is a separate part with `quantity: 1`, never `quantity: 2` on
the original. This is written into `domain-model.md` beside `quantity`, because it is the kind of
shortcut that looks like a tidy-up.

## 7. Mirroring the outline, and the refusal that says what to do

`MIRROR_OUTLINE_ACROSS_FOLD`, an interaction refusal:

> *Shell already has an outline, and a piece of leather has one edge. Draw the whole outline, or
> mirror the part to make a second piece.*

It is raised before the gesture, so the button is disabled with the reason on it, rather than the
command refusing after the fact — the pattern ADR 0013 and 4.3b's delete button already set.

This is the honest face of §1: the tool says what it cannot do and names both real alternatives,
instead of producing a part that S5 refuses to load.

## 8. Deletion, freezing, and the rest of the graph

Almost all of it falls out of what is built:

| Situation | Result | From |
|---|---|---|
| Delete the **source** | Counterpart is a dependent: the existing dialog offers *delete them too* or *freeze* | ADR 0009 |
| Delete the **fold** | Counterparts reference it, so they are dependents too. The dialog offers **freeze the axis**: the counterpart keeps its shape and its source, and stops tracking the fold | New, and the reason freezing already exists |
| Delete the fold, counterpart **locked** | Refused — the cascade would change a locked feature | 4.3b |
| **Lock** the counterpart | It still follows both its source and the fold; it cannot be renamed or deleted | 4.3b |
| **Duplicate** a part holding a fold pair | Internal re-pointing carries the fold reference to the copy's fold | 4.3b, extended to the new edge |
| A cycle through the fold reference | Refused by S3, now walking both edge kinds | Extended |

Freezing a fold axis is the one genuinely new resolution, and it fits the existing word exactly:
*keep what it looks like now, stop following*. It degrades a `{kind:'fold'}` axis to the
`{kind:'line'}` the fold currently describes — which is 4.8a's form, already proven.

## 9. Labels

Unchanged from 4.8a: a label is never mirrored (`TEXT_WOULD_READ_BACKWARDS`), because a mirror is a
similarity and the words would come out rotated rather than reflected. Mirroring a selection holding
one is refused, naming it; **mirroring a part carries no labels**, and the undo label says so — *"Mirror
Shell (2 labels not mirrored)"* — rather than dropping them in silence.

On a folded piece there is a second reason: the other side of a fold is upside down on the finished
article, so a mirrored label would be wrong even if it read correctly.

## 10. Persistence

`CURRENT_FORMAT_VERSION` 6 → **7**, and — unlike every migration since v1 — **`v6_to_v7` actually
rewrites data**: it adds `kind: 'line'` to every existing `mirror` op's axis. Version 6 shipped the
axis without a discriminant, and a shipped migration is immutable, so the discriminant arrives as a
real step in the chain rather than by editing v6's schema.

That makes it the first non-identity migration the corpus exercises end to end, which is worth
having: a chain of identities proves very little about the chain.

A v7 fixture holds both axis kinds — a captured mirror and a fold-tracked one — so the corpus covers
the union rather than one arm of it.

## 11. Deliberately not here

- **Boolean union**, and therefore a symmetric outline from half of one. §1. Slice 9.11 at the
  earliest.
- **A general symmetry or constraint system.** One derivation reading one referenced line is not a
  solver, and nothing here is bidirectional.
- **Construction lines.** The axis is an existing `fold-line`; no new kind of line is introduced for
  mirroring, per the review's instruction.
- **Viewport framing.** Still the reconciliation §10's question, still not this slice's.
- **A mirror-axis editor**, numbers for the axis, or a glide field. 4.8a settled that and nothing
  here reopens it.
- **Thickness compensation across a fold** — a bend allowance is `materialThicknessMm`'s job and is
  v1.1.

## 12. Tests

- **The axis tracks.** Property: for any straight fold and any source, moving or turning the fold
  leaves every counterpart equal to its source reflected in the fold's *new* line. This is the slice.
- **Hole parity** through a fold move: counts stay equal, positions stay reflected.
- **A bent fold is refused**, naming it; a straight one built from collinear segments is accepted.
- **The outline refusal**, with the button disabled and carrying the reason.
- **Dragging a fold-tracked counterpart is refused**, changing nothing, and says to move the fold.
- **Freezing the axis** on deleting the fold: the counterpart keeps its geometry exactly, still
  follows its source, and no longer moves when a new fold is drawn.
- **S2 and S3 over both edge kinds**: a missing fold is refused by the loader; a cycle through a
  fold reference is refused.
- **Mirror part**: a second part, `quantity: 1`, no labels, hole counts equal.
- **Persist**: v6 → v7 adds the discriminant to a real v6 file; the v7 fixture round-trips both axis
  kinds; a v7 file is refused by a build claiming 6.
- **E2E, the §2 scenario**: shell, fold, three slots, mirror across fold, drag the fold, see the
  counterparts follow and no problems reported.

## 13. Answered at review

1. **The symmetric outline stays out of scope**, with an explicit refusal rather than an indirect
   workaround: S5 is meaningful, and the door stays open for the boolean work instead of a
   special case built around its absence. The message has to make three things clear — this mirror is
   for features *inside* a part, the part's own contour cannot be completed this way, and mirroring
   into a second part is a different operation.
2. **The drag stays refused.** It is a consistency rule for the whole model rather than a quirk of
   mirror: dragging a derived, linked result must not silently break or partly alter the
   relationship. The UI says what to move instead. *Detach from fold* waits until a concrete workflow
   asks for it — freezing on fold deletion is already a coherent escape hatch, and a second
   interaction concept would be premature.
3. **The real migration happens.** A chain of identity migrations satisfies the framework without
   proving the machinery handles an actual schema change.

Two constraints added at review, and held throughout:

- **The fold is an explicitly selected dependency**, never inferred. The operation is
  `source feature + fold feature → linked mirrored feature`. No nearest-fold or "obvious fold"
  heuristics.
- **The first *references* edge must be tested where it breaks**, not only where it works: a missing
  fold, a deleted fold, a cycle through the reference. This is the edge kind's first real use and the
  tests are what make it trustworthy for measurements in 4.10.

## 14. Superseded open questions

1. **§1 is the big one.** I am proposing that 4.8b deliberately does *not* attempt a symmetric
   outline from half of one, because S5 and the absence of booleans make it unavailable, and that we
   say so in the UI. If you would rather the half-outline case be served by **mirroring into a second
   part** — two pieces the maker glues or sews rather than one folded piece — that is buildable, but
   it is a different physical object and I do not think it is what a bifold shell wants.
2. **Refusing the drag on a fold-tracked counterpart** (§5). It is the honest answer, but it is the
   first place the app says "you cannot move this, move that instead". The alternative is offering an
   explicit *Detach from fold* action; I would rather wait until someone wants it.
3. **Format 7 with a real migration** (§10). Correct by the rules, and slightly more than a version
   bump. Worth confirming you want it now rather than folding the discriminant in another way.
