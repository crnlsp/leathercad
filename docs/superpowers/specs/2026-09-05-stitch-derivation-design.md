# The derivation chain: cut contour to stitch holes (Stage 1) — design

Date: 2026-09-05
Status: implemented (M3). Deletion semantics superseded by ADR 0009; see the
[Phase 4 reconciliation](2026-09-15-phase-4-reconciliation-design.md)
Delivers: **M3** — "change a rectangle's width; its stitch line and 120 holes update live"

## Why this slice exists

`docs/roadmap.md` §3 annotates M3 with the words **"The core value of the product exists."** It is
not built. There is no stitch-hole model in the codebase at all.

Both hard halves *are* built and sitting unconnected: `distributeAlongPath` (slice 1.8) does hole
distribution with `fit-whole` and `exact-pitch`, and `offsetPath` (1.9) does analytic inward
offsetting. What is missing between them is a way for one feature to say "I am derived from that
one".

The four slices shipped before this design — the tool palette, circle, arc, rotate and scale — are
all features a general vector editor already has. This slice is the one that makes the application
a leathercraft tool.

## The thesis this serves

> LeatherCAD turns a dimensioned outline into **derived manufacturing geometry** — stitch lines,
> holes, folds, allowances — and prints it at verified 1:1.

The load-bearing phrase is *derived manufacturing geometry*. It covers the whole Phase 4 family
without admitting nesting (layout, not derivation), constraints (authoring, not derivation) or 3D
(a different product). It names the mechanism, so the thesis and the architecture agree.

This is a widening of the narrower "outline into stitch holes" framing, and it is safe **only
because `product-spec.md` §2 lists what this is not**. Treat that section as part of the thesis
rather than an appendix to it.

## 1. Four cases, walked through

The design was checked against real numbers before it was written. Two of the four fail on the
current engine, and one of the failures was not the expected one.

### Case A — closed panel, 105 × 75, stitched all round

**Works only when every corner radius is larger than the stitch inset.**

The chain is fine in principle: `roundedRect` → `offsetPath(-3.5)` → `distributeAlongPath`. Arcs
stay arcs, so the stitch line of a rounded rectangle is still a rounded rectangle.

But `offsetPath` contains this in its arc branch:

```ts
const radius = s.radius - Math.sign(s.sweepAngle) * d;
if (radius < -EPS_POINT) return [];   // the whole offset, empty
```

On a counter-clockwise ring every convex corner has positive sweep, so a 3 mm corner inset by
3.5 mm gives `-0.5` and the **entire stitch line returns empty**.

That is geometrically wrong. Insetting a rounded rectangle further than its corner radius produces
a rectangle with *sharp* corners, not a collapse — the adjacent offset lines still meet. The
existing comment reasons correctly about a ring closing over itself and then applies that reasoning
to a convex corner, where it does not hold.

**Wallet corners are routinely 3–5 mm and stitch insets 3.5–4 mm, so roughly half of realistic
Case A inputs fail today.** This is the most urgent geometry defect in the project and it outranks
the concavity problem, which is better known.

### Case B — pocket stitched on three sides

**Impossible today.** `offsetPath` refuses open paths outright, and nothing in the model can name
"left, bottom and right". Both gaps are addressed in §4; the representation question turned out to
be the subtlest decision in this design.

Stitching usually does *not* go all the way round. A pocket is sewn on three sides and open at the
top. A tool that can only derive a closed loop around an entire outline cannot express the most
common seam in leatherwork.

### Case C — 95 × 60 pocket with a thumb scoop

**Rejected today, but the rejection is over-conservative rather than correct.**

`convexTurnSign` refuses any path containing a concave corner. A thumb scoop is a gentle concave
arc of perhaps 25 mm radius; inset by 3.5 mm it produces an ordinary curve with no
self-intersection anywhere. The engine refuses it for what concavity *could* do, not what this
concavity *does*.

`product-spec.md` §3 lists this exact shape in the representative workflow the MVP must support.

### Case D — two mating panels, 84 holes each

**Nothing needs to exist now beyond a countable, addressable hole set.**

Parity needs one thing this slice does not have: a statement that *these two runs are sewn to each
other*. That is a small project-level record — `SeamPair { aFeatureId, bFeatureId }` — and it reads
counts this slice already produces.

- **Now:** hole count as a first-class output, per run and in total.
- **Later:** the seam pairing and the parity check.
- **Blocked by nothing here**, provided runs are addressable — which §4 makes them.

## 2. The model

`GeometrySource` gains exactly one variant. That is the whole structural change.

```ts
type GeometrySource =
  | { kind: 'path';    path: Path }
  | { kind: 'shape';   shape: ParametricShape }
  | { kind: 'derived'; sourceId: FeatureId; op: Derivation }   // new

type Derivation =
  | { type: 'offset';       distanceMm: Mm; side: 'inward' | 'outward'; run: Run }
  | { type: 'stitch-holes'; pitchMm: Mm; mode: 'fit-whole' | 'exact-pitch';
                            corners: 'continuous' | 'hole-at-corner';
                            startOffsetMm?: Mm; endOffsetMm?: Mm; ironLabel?: string }

type Run =
  | { kind: 'whole' }
  | { kind: 'between'; fromAnchor: number; toAnchor: number }
```

`StitchLine` already exists as a feature kind. `StitchHoleSet` is new. The `stitch-holes` layer
role is **already** in `LayerRole` — slice 4.1 put it there.

### What is persisted, derived, metadata, or nothing

| Thing | Classification | Why |
|---|---|---|
| `StitchLine` feature | **Persisted** | A user decision: this edge is stitched, 3.5 mm in |
| `StitchLine` path | **Derived** | Invariant 4. An improved offset improves old files |
| `StitchHoleSet` feature | **Persisted** | Pitch, mode and corner policy are craft decisions |
| `pitchMm` | **Persisted** | The *value*, not the preset id — see below |
| Iron preset library | **App metadata** | Configuration, not document data |
| `ironLabel` | **Persisted, cosmetic** | So the panel can say "KS Blade 3.85". Never read as geometry |
| Hole positions | **Derived** | Hundreds per part, fully determined by the parameters |
| Hole stable ids | **Not built** | See §5 |
| `count`, `achievedPitchMm`, per-run report | **Derived** | Outputs of evaluation; parity reads them later |
| Corner policy | **Persisted** | Must survive reopening |
| Run anchors | **Persisted** | Indices into the source's anchor list (§4) |
| Seam pairing | **Not in this slice** | Needed for parity; blocked by nothing here |
| Selection, hover, active tool | **UI state** | Already outside the document, correctly |

**The pitch value is persisted, not the preset id.** A file must open identically on a machine that
has never heard of the author's iron library. Persisting only an id would make geometry depend on
application configuration, which is the same class of mistake as persisting derived geometry.

## 3. The derivation model — deliberately not a graph

In this product the chain is **two links deep** and each node has **exactly one source**:

```
cut contour  →  stitch line (inset 3.5 mm)  →  stitch holes (3.85 mm pitch)
```

That is a linked list, and the implementation should say so. No topological scheduler, no
adjacency structure, no source arrays reserved "for later".

- **Source reference** — a single `sourceId: FeatureId`. When mirror and seam allowance arrive they
  are also single-source. If a genuinely two-input derivation appears — a boolean — it is a new
  variant, and adding it then costs less than carrying an array now.

- **Resolution** — recursive resolve with memoisation. `evaluate` already memoises on object
  identity; the cache key extends to include the resolved source, so a dependent invalidates when
  its source changes and not otherwise.

- **Cycle detection, twice.** At **command time**, creating a derivation that would close a loop is
  rejected before it enters the document, naming both features — so the document is never in a
  cyclic state, and this is the one users actually meet. At **evaluation**, a visiting set producing
  a per-feature error: defensive, should be unreachable, and unreachable is where the next bug
  lives.

- **Error propagation** — errors stay local, using the existing per-feature model. A failed source
  yields one clear message on the dependent ("the cut line it follows could not be built") rather
  than repeating the root cause down the chain. One problem, one entry in the panel.

- **Deleting a source — cascade, as one undoable step.** *(Superseded by
  [ADR 0009](../../adr/0009-explicit-resolution-when-deleting-a-source.md): once seam allowance makes
  an outline derivable, a cascade deletes a part's own cut line. A delete with dependents now asks.)* An orphaned stitch line has no geometry and
  no meaning. Deleting a cut contour deletes its stitch line and that line's holes, the UI reports
  how many features went, and one undo restores all of them. Leaving dependents in a permanent error
  state produces documents full of undeletable rubble.

## 4. Partial and open runs: anchors, not segment indices

### Why the obvious representation is wrong

"Stitch segments 2 through 6" looks natural, because a parametric shape regenerates deterministically.
But `roundedRect` emits a **variable** number of segments:

```
corners 8 mm      → 8 segments   (4 lines + 4 arcs)
corners 0 mm      → 4 segments   arcs omitted
radius = height/2 → 6 segments   side lines have zero length, omitted
```

A user who defines "stitch three sides" and later sets the corner radius to zero would silently get
a stitch line on the wrong edges. **Silent wrongness on a pattern about to be cut from leather is
the worst failure this product can produce.**

### Anchors

Address the run by anchors the shape defines **from its own parameters**, not by the segments it
happened to emit. Each source kind answers one question: *where are your durable landmarks?*

| Source | Anchors | Stable under |
|---|---|---|
| `rect` | The 4 corners, anticlockwise from bottom-left | width, height, radius, rotation — always exactly 4 |
| drawn polyline | Its vertices, in order | moving a vertex; **not** adding or deleting one |
| `circle` | None — `whole` only | everything |
| `arc` | Already open; `whole` is the whole arc | everything |

A run is then `{ fromAnchor: 3, toAnchor: 2 }` — "from the top-left corner round to the top-right,
the long way" — which is also how a leatherworker describes it aloud.

Resolution is mechanical:

1. resolve the source path
2. locate anchor arc-lengths on it (`PathMeasure`)
3. `subPath(path, fromMm, toMm)` — new, §6
4. offset the open sub-path — new, §6
5. distribute holes along the result

**Known hole.** Adding or deleting a vertex on a drawn polyline shifts anchor indices and would
silently move a run. Vertex editing is slice 3.9 and deferred behind M3, so this cannot arise yet —
but it must be solved *before* 3.9 ships. The likely answer is vertex ids on drawn paths, which is
cheap while nobody has files.

## 5. Stitch holes have no stable ids

A hole is pure derived output. Giving it an identity creates an obligation to *preserve* that
identity across regeneration — and regeneration happens whenever the panel width changes, which is
exactly when the hole count changes. There is no correct answer to "which of the old 84 holes is
this one of the new 86", so inventing one buys a permanent problem in exchange for nothing.

Address a hole positionally: `(holeSetId, runIndex, ordinal)`. That is enough for the panel, for
export, and for parity counting.

**The forward-compatible part:** when suppression arrives — "do not punch this one" — express it as
a *parameter on the hole set*, `suppressed: number[]` of ordinals, not as state on a hole.
Parameters survive regeneration by definition, and the behaviour when the count changes becomes an
explicit product decision rather than an accident.

## 6. The geometry decision

Three additions to `packages/geometry`. All analytic, all Tier 1 in style. Nothing else changes.

### 6.1 Join by intersection

Where the offsets of two neighbouring segments **overlap** rather than gap, trim both to their
intersection. This single operation fixes two separate failure modes:

- a **concave** corner, which the engine currently refuses outright (Case C);
- a **convex** corner inset further than its radius, which currently collapses the whole path
  (Case A).

### 6.2 Replace the input convexity gate with an output self-intersection test

`convexTurnSign` asks "could this concavity cause a problem?" when the answerable question is "did
it?". `selfIntersections` already exists in `ops/intersect.ts` and answers the second exactly.

The deep-notch case still fails, and should: insetting 5 mm into a 3 mm notch genuinely has no
simple answer. Rejecting with "the inset is deeper than this notch can hold" is correct behaviour,
not a limitation.

**This is not slice 9.11 by the back door.** 9.11 is *pruning* self-intersection loops — computing
the correct remaining outline when an offset folds over itself. That is the genuinely hard part and
stays deferred. This design only *detects* the fold and refuses with a message.

### 6.3 `subPath` and open-path offsetting

`subPath(path, fromMm, toMm)` extracts the run between two arc-length positions. Needed twice over:
for partial runs, and for corner policy, which splits at corners and distributes per run.
`PathMeasure` locates the boundaries and `SegmentOps.split` already cuts a segment.

Open-path offsetting is strictly easier than closed: offset each segment, join the interior
vertices, and let the two ends simply end. A stitch line has ends, so there is no cap policy to
invent. The per-segment maths is unchanged.

### 6.4 The existing tests pin the old behaviour

Slice 1.9's tests currently assert that a non-convex path is rejected and that an over-inset corner
collapses the path. **Those assertions encode a defect and must be changed**, not preserved because
they exist. Each one is replaced by a test of the corrected behaviour, and the reason is recorded in
the test so it is not "fixed" back later.

## 7. Edge-case behaviour

"Warn" means a problems-panel entry that does not block the geometry. "Reject" means no geometry and
a named error on that feature only.

| Case | Behaviour |
|---|---|
| Edge shorter than one pitch | `fit-whole` clamps to one interval — a hole at each end. **Warn** when achieved spacing falls below the iron's minimum: holes 2 mm apart tear the leather |
| Spacing larger than the edge | As above. Two holes, warn. Never zero holes on a real edge |
| Very long edge | Fine. Positions are `start + k × pitch`, never accumulated. Budget 3 000 holes at 60 fps |
| Odd vs even counts | No special handling. Only matters for parity, which compares two numbers |
| Achieved ≠ nominal pitch | Always reported. **Warn** past a threshold — a 3.85 iron delivering 3.4 mm is a different-looking seam |
| Hole exactly at a corner | `hole-at-corner`: split at corners, distribute per run, **de-duplicate** the shared hole where runs meet. Getting this wrong doubles a hole and is invisible until punching |
| Many corners | n runs, each reported separately. The per-run report tells the user which edge got the odd spacing |
| Tiny corner radius | With intersection joins: a sharp corner in the stitch line. Today the whole offset fails — the Case A defect |
| Concave contour | Offset attempted; rejected only if the **result** self-intersects |
| Self-intersecting source | Rejected at validation, before offsetting, naming the feature |
| Inset exceeds the shape | The offset legitimately collapses. Reject: "a 20 mm inset is deeper than this outline can hold" |
| Open / partial run | Supported via anchors and open offsetting. `exact-pitch` is usually right here; `fit-whole` for closed loops |
| Change panel width | The chain recomputes. The count may change. **This is M3** |
| Change pitch or inset | Recompute from the changed parameter. One undo step |
| Source changes after holes exist | Holes regenerate wholesale. No identity to reconcile — which is why holes have no ids |
| Delete the source | Cascade-delete dependents as one undoable step; report what went |
| Create a cycle | Rejected at command time, naming both features |
| Corner radius → 0 with a partial run | The run survives: anchors are corners, and a rectangle has four whatever its radii |

## 8. M3 acceptance criteria

M3 is complete when every one of these is demonstrated — not argued.

**The live chain**

1. A rounded rectangle with a stitch line inset 3.5 mm and holes at 3.85 mm renders all three.
2. Typing a new width updates the outline, the stitch line and the holes **in one action**, with no
   manual regenerate.
3. The hole count changes with the length, and the panel shows the new count.
4. Achieved spacing is reported alongside nominal pitch, per run and in total.
5. A hole lands exactly on each corner under `hole-at-corner`, with no doubled hole where runs meet.
6. Changing pitch, inset, or corner policy each update the chain, and each undoes as one step.

**The cases from §1**

7. **A rounded rectangle with 3 mm corners takes a 3.5 mm inset** and produces a sharp-cornered
   stitch line. *(Currently fails.)*
8. A pocket stitched on three sides produces a stitch line on those three sides only, and the run
   survives a corner-radius change to zero.
9. A pocket with a thumb scoop produces a valid stitch line. *(Currently rejected.)*
10. An inset deeper than a notch is rejected with a message naming the feature — and the rest of the
    document still evaluates.

**Robustness and output**

11. Deleting the cut contour cascades to the stitch line and holes as one undoable step.
12. Attempting a cycle is refused at command time.
13. **Save, quit, reopen: the document bytes are unchanged and the regenerated holes are identical.**
    This is the invariant-4 proof and it is easy to omit.
14. The PDF puts holes on their own layer at true millimetre size, and a rasterised measurement
    confirms hole spacing on the page.
15. 3 000 holes stay at 60 fps while dragging, and a chain regenerates in under 50 ms.
16. **A physical print, measured with a steel rule, recorded in `docs/print-verification-log.md`.**

Criterion 16 is the one that must not slide. Everything above it is a claim about geometry; only
that one is a claim about paper, and it is the reason the project exists.

## 9. Out of scope, recorded so it is not relitigated

- **Seam pairing and hole-count parity.** Immediately after, not during.
- **Hole suppression or nudging.** The parameter shape is reserved in §5; the feature waits.
- **Mirror and seam allowance.** Both are `derived` variants and both are tempting. Next slice.
- **Multi-source derivations.** One `sourceId`. No arrays "for later".
- **A general DAG scheduler.** Two links deep, one source each.
- **Loop pruning in the offset engine.** Detect and reject; 9.11 keeps the hard half.
- **Vertex ids on drawn paths.** Needed before slice 3.9, not before M3.
- **A constraint solver.** `product-spec.md` §6 rejected it and this design does not reopen it.
- **Any further drawing tool.**
