# Domain Model

**Package:** `packages/domain`
**Status:** Built through slice 4.7. The rest of Phase 4 is designed in the
[Phase 4 reconciliation](superpowers/specs/2026-09-15-phase-4-reconciliation-design.md). Each section
says which parts are **built**, **designed** (Phase 4, not yet built) or **later**.
**Last updated:** 2026-09-15

---

## 1. The central idea

A generic vector editor stores *"a black closed path"*. This application stores *"the cut contour of
the outer panel"*, and that difference is the product.

Once geometry carries meaning, four things follow that a vector editor cannot do:

- **Appearance.** A cut line draws solid, a stitch line dashed, a fold line dash-dot. The user never
  picks a stroke style.
- **Behaviour.** A stitch line can be *derived* from a cut contour, because "3.5 mm inside the edge"
  is a meaningful relationship. Two anonymous paths have no such relationship.
- **Export.** A laser-cutting export emits cut contours and hardware holes and drops everything else.
  A template print emits all of it. The user picks an intent, not a set of layers.
- **Validation.** "These stitch holes fall outside their part" is checkable only if the software knows
  which path is a part's edge and which is a hole set.

Everything below serves those four.

## 2. Entity overview

```
Project                                     built
├── settings          grid, default stitch margin, default iron pitch
└── parts[]
     └── Part         name, quantity         built
          └── features[]
               ├── CutContour                built   (outer, and cut-outs: designed 4.3)
               ├── StitchLine                built   (drawn roots: designed 4.9)
               ├── StitchHoleSet             built
               ├── FoldLine                  built
               ├── MarkingLine               built
               ├── HardwareHole              built
               ├── Measurement               designed, 4.10 — an annotation
               └── TextLabel                 designed, 4.11 — an annotation
```

**Later:** materials with thickness, grain direction and notes on a part, persisted guides, shipped
iron presets as document data. **Not planned for Phase 4:** a per-part placement transform. A part
is placed by its features' own geometry ([ADR 0012](adr/0012-mirror-is-a-derivation.md)).

## 3. Features

A discriminated union. Every feature has a stable ULID, a name, a visibility flag and a lock flag.

```ts
interface FeatureBase {
  readonly id: FeatureId;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;           // S7: no command changes it until it is unlocked
  readonly frozenFrom?: string;       // 4.2b: set when a delete froze it (ADR 0009)
}

/** Features with geometry of their own: everything except annotations. */
interface GeometricFeature extends FeatureBase {
  readonly source: GeometrySource;    // §4
}
```

**Annotations** (designed) are features without a geometry source: a measurement and a text label.
They belong to a part and resolve after the geometry they refer to (§3.7, §3.8).

### 3.1 `CutContour` — built

```ts
interface CutContour extends GeometricFeature {
  kind: 'cut-contour';
  role: 'outer' | 'inner';
}
```

The outline actually cut from leather. Inner contours are **cut-outs**: card-slot windows, hardware
cut-outs.

- A part has **at most one** outer contour (structural, S5), and **should** have exactly one
  (design rule DR1, `PART_HAS_NO_OUTER_CONTOUR`).
- Outer contours and cut-outs **enclose an area** (structural, S6). Drawing an open path as one is
  refused, not reinterpreted.
- **Winding is not normalised.** Reversing a path would renumber its anchors (§4.6). "Inward" and
  "outward" are resolved against the part's material instead (§4.3).

### 3.2 `StitchLine` — built

```ts
interface StitchLine extends GeometricFeature {
  kind: 'stitch-line';
}
```

Where the thread runs. Open or closed.

- **Built:** derived inward from a cut contour, whole or as a partial run between anchors.
- **Designed (4.9):** drawn directly on a part, and as the source of a seam-allowance outline.

### 3.3 `StitchHoleSet` — built

```ts
interface StitchHoleSet extends GeometricFeature {
  kind: 'stitch-hole-set';            // source is always `derived` with a `stitch-holes` op
}
```

Always derived from a stitch line. A hand-placed hole set is a different thing and is not in scope.
The parameters live in the op (§4):

```ts
{ type: 'stitch-holes';
  pitchMm: Mm;                        // nominal, from the iron: the value, not a preset id
  mode: 'fit-whole' | 'exact-pitch';
  corners: 'continuous' | 'hole-at-corner';
  startOffsetMm?: Mm; endOffsetMm?: Mm;
  ironLabel?: string }                // cosmetic, never read as geometry
```

Evaluates to holes `{ point, tangent, runIndex, ordinal }` and a report: the count, the achieved
spacing, and per-run length, count and spacing. **Holes have no ids.** They are addressed by
position, because there is no correct answer to which of the old 84 holes is this one of the new 86.

**Later:** slot and diamond hole shapes, and suppressing individual holes, expressed as a list of
ordinals on the set.

### 3.4 `FoldLine` — built

```ts
interface FoldLine extends GeometricFeature {
  kind: 'fold-line';
  direction: 'mountain' | 'valley';
  materialThicknessMm?: Mm;           // stored now; consumed by thickness compensation (v1.1)
}
```

Named for its direction on creation ("Fold (valley)"), because both directions draw identically.

### 3.5 `MarkingLine` — built

```ts
interface MarkingLine extends GeometricFeature {
  kind: 'marking-line';
  purpose: 'glue-area' | 'alignment' | 'logo' | 'skive' | 'other';
}
```

Never cut, never stitched. Printed as a light guide and left out of cutting exports.

### 3.6 `HardwareHole` — built

```ts
interface HardwareHole extends GeometricFeature {
  kind: 'hardware-hole';
  hardwareType: 'rivet' | 'snap' | 'screw' | 'eyelet' | 'other';
}
```

**The hole's position and size are its `source`**, as a `circle` shape, not fields of its own. Slice
4.7 corrected the earlier sketch: separate `centre` and `diameterMm` fields would have made it the
only feature whose position is not in `source`, so transforms, hit-testing, rendering and mirroring
would each need a case for it. The record holds a radius; the panel and the tool ask for a diameter
and halve it before quantising.

Kept distinct from a cut-out because a hardware hole is punched rather than cut, and is reported
separately.

**Later:** `hardwareRefId`, a link into the hardware library (v1.1).

### 3.7 `Measurement` — designed, 4.10

```ts
interface Measurement extends FeatureBase {
  kind: 'measurement';
  type: 'horizontal' | 'vertical' | 'aligned' | 'radial';
  a: MeasureRef;
  b?: MeasureRef;                     // absent for radial
  offsetMm: Mm;                       // how far the dimension line sits from the geometry
  precision: 0 | 1 | 2;
}

type MeasureRef =
  | { kind: 'anchor'; featureId: FeatureId; anchor: number }
  | { kind: 'centre'; featureId: FeatureId }
  | { kind: 'extent'; featureId: FeatureId; side: 'left' | 'right' | 'bottom' | 'top' };
```

- **An annotation.** It has no geometry source; its ends are **references** in the graph (§4.2).
- **Every end references geometry.** No segment indices (S9) and no free points, because a dimension
  that silently goes stale is worse than no dimension.
- **The value is generated**, never stored.
- A missing anchor fails the measurement (E4). It never attaches to a neighbouring corner.

**Later:** angular measurements.

### 3.8 `TextLabel` — built, 4.11b

```ts
interface TextLabel extends Omit<FeatureBase, 'source'> {
  kind: 'text-label';
  source: TextSource;                 // narrowed: only a label holds text, and it holds nothing else
}

type TextSource = {
  kind: 'text';
  text: string;
  at: Vec2;                           // the left end of the baseline, before rotation
  sizeMm: Mm;
  rotationRad: number;
};
```

Free text printed on the template: "fold before stitching", a logo position note.

**The words live in `source`.** This section used to sketch them as fields on the feature; that
predates `GeometrySource`, and §3.6 records the same decision for hardware holes and the reason for
it — a feature whose position is not in `source` is the one feature that moving, turning,
hit-testing and mirroring each need a special case for. As a source, a label inherits all of them,
and its glyph outlines are generated rather than stored, like every other derived geometry.

A label resolves to its laid-out text plus the **box** it occupies, which is what selection and
bounds use. Transforms go through the parameters: moving sets `at`, turning accumulates
`rotationRad`, an even scale sets `sizeMm`, and an uneven one is refused with `TEXT_WOULD_DISTORT`
(X9) — letters do not stretch.

**Text that restates a model value is never a label.** Part captions ("Card holder — cut 2") and
measurement values are generated from the model, so they cannot disagree with it. All document text
is set in the vendored typeface and sized in millimetres
([ADR 0011](adr/0011-one-vendored-typeface-outlined-on-paper.md)).

## 4. Geometry sources, derivations and the reference graph

**The most important section in the document.**

```ts
type GeometrySource =
  | { kind: 'path'; path: Path }                                        // drawn; the only coordinates stored
  | { kind: 'shape'; shape: ParametricShape }                           // parameters; the path is generated
  | { kind: 'derived'; sourceId: FeatureId; op: Derivation };           // built from one other feature

// A label's words are a source of their own (§3.8), kept out of GeometrySource
// so that only a TextLabel can hold them and a TextLabel can hold nothing else.
type FeatureSource = GeometrySource | TextSource;

type Derivation =
  | { type: 'offset'; distanceMm: Mm; side: 'inward' | 'outward'; run: Run }          // built
  | { type: 'stitch-holes'; pitchMm: Mm; mode: …; corners: …; … }                     // built
  | { type: 'mirror'; axis: { origin: Vec2; angleRad: Radians }; glideMm: Mm };       // built 4.8a

type Run =
  | { kind: 'whole' }
  | { kind: 'between'; fromAnchor: number; toAnchor: number };

type ParametricShape =
  | { type: 'rect'; origin: Vec2; width: Mm; height: Mm; radii: CornerRadii; rotation: Radians }
  | { type: 'circle'; centre: Vec2; radius: Mm }
  | { type: 'arc'; centre: Vec2; radius: Mm; startAngle: Radians; sweepAngle: Radians };
```

**One derived source, many ops.** An earlier sketch gave offset, mirror, transform and boolean a
geometry-source kind each. The code has one `derived` kind carrying a typed op, and new derivations
arrive as ops (the stitch derivation design, §2). **One source per derivation.** A genuinely
two-input derivation, such as a boolean, would be a new variant when it is needed.

**Later:** `ellipse` and `polygon` shapes; boolean derivations (v1.2).

### 4.1 Why parametric shapes live here and not in `geometry`

A rounded rectangle is a *domain* concept: "the user's panel is 105 × 75 with 8 mm corners", edited
by typing 105, not by dragging control points. `packages/geometry` provides `roundedRect(...)` as a
pure constructor; `packages/domain` stores the parameters and calls it. Keeping parameters out of
the geometry engine stops the engine growing a special case per product feature.

### 4.2 The reference graph

Two kinds of edge, in one graph:

- **derives**: the target's geometry is built from the source (every `derived` source);
- **references**: the target points at the source's geometry without being built from it
  (measurement ends).

Its structural invariants hold in memory and on disk. Commands refuse to break them, giving a
reason, and the loader refuses files that break them, naming the feature:

- **S2.** Every edge resolves to an existing feature.
- **S3.** The graph is acyclic, across both kinds of edge.
- **S4.** Every *derives* edge appears in this table:

| Target | Op | Source | Conditions |
|---|---|---|---|
| Stitch line | offset, inward | Cut contour (outer or cut-out) | Whole run or partial run |
| Outer cut contour | offset, outward | Stitch line | Source closed; whole run only |
| Stitch hole set | stitch holes | Stitch line | |
| The same kind | mirror | The same kind | A cut contour keeps its role — built 4.8a |

A representative card-holder panel:

```
   CutContour (outer)   shape: rect 105 × 75, radii 8
          │ derives: offset inward 3.5 mm
          ▼
   StitchLine
          │ derives: stitch holes, pitch 3.85, fit-whole, hole-at-corner
          ▼
   StitchHoleSet
```

Change the rectangle to 110 × 75 and all three update. That single behaviour is the biggest daily
time-saver in the product.

### 4.3 Both directions matter

A stitch line and its outline are related by one number, the **stitch margin**. Either end can be
the one the maker dimensions:

- **Stitch inset** (the common case): draw the outline, derive the stitch line inward.
- **Seam allowance** (designed, 4.9): draw the stitch line ("the pocket opening must be exactly
  95 mm"), derive the outline outward.

Seam allowance is **not a property**. It is a derivation direction. As a number hanging off a
contour it would force one workflow on everyone.

**"Inward" means into the part's material.** For an outer contour the material is inside the path;
for a cut-out it is outside. A stitch line around a card-slot window therefore runs outside the
window. The direction is resolved from the contour's role, not its winding (designed, 4.3).

One project default, `settings.defaultStitchInsetMm`, serves both directions. The panel calls it the
*stitch margin*.

### 4.4 Evaluation — built, with typed failures since 4.12a

```ts
function evaluate(project: Project): ResolvedProject;

type ResolvedFeature =
  | { ok: true;  feature: Feature; role: LayerRole; path: Path; holes?: StitchHoles;
      notes?: readonly Problem[] }    // what resolving gave up: an offset that split (E2)
  | { ok: false; feature: Feature; problem: Problem; location?: ProblemLocation };
```

A failure carries a `Problem` — a code and typed facts, never a sentence (§8.6). `location` is the
geometry the failure is about, which is what the canvas marks so a failed feature does not simply
vanish.

1. **Recursive, not scheduled.** A derived feature resolves its source first. Cycles cannot exist
   (S3). Evaluation keeps a defensive guard, which should be unreachable.
2. **Memoised on object identity.** Immutable updates with structural sharing make an unchanged
   feature the same object between revisions. A derived feature's cache entry also records the
   source path it was built from, because a stitch line can be identical while its outline changed.
3. **Failures are per feature** (E1). One bad number never blanks the canvas. A failed source is
   reported once, at its root (E3), and its dependents fail with `SOURCE_FAILED`.
4. **Nothing is dropped without a diagnostic** (E2). An offset that splits keeps its largest piece
   and reports `OFFSET_SPLIT`, saying how many were left out. Tier 1 offsetting never returns more
   than one piece, so that path is exercised by a unit test of the keep-largest step rather than
   through `evaluate`; it is written now so E2 holds when Tier 2 lands.
5. **Derived geometry is never persisted** (S8). The file stores parameters; evaluation regenerates
   paths on load, so an improved offset silently improves every existing file.
6. **Deterministic.** Same project in, same resolved geometry out.

**"Inward" means toward the material** (D6, built 4.3a). A part's leather is inside its outline and
*outside* every cut-out, so a stitch line inset from a cut-out runs **away** from the hole while the
same inset round the outline runs into it. The domain resolves the direction from the role of what is
being followed and hands geometry a signed distance; geometry keeps knowing only left and right.

> **Known limitation, to be resolved by 4.9.** The direction is read from the **directly followed**
> feature's role, in `applyDerivation`. That is correct for everything representable today, because
> §4.2 requires the source of an inward offset to be a cut contour — so its role is always there to
> read. It does **not** generalise. Seam allowance (4.9) derives an outline *outward from a stitch
> line*, and a stitch line does not have a role: which side of it the leather is on depends on the
> contour at the **root** of its chain, which may be an outline or a cut-out. An allowance grown
> from the stitching round a thumb slot has to run toward the hole, and nothing in the current
> signature can tell it so. 4.9 should resolve material orientation from the derivation's root
> rather than from its immediate source, and `towardsMaterial` is the line to change. Left as it is
> on purpose: guessing at the shape 4.9 needs before 4.9 exists is how a wrong abstraction gets
> frozen in.

### 4.5 Deleting a feature others depend on — built, 4.2b

[ADR 0009](adr/0009-explicit-resolution-when-deleting-a-source.md). **A delete never changes a feature
the user did not name without first showing them, and never leaves a reference dangling.**

- **Nothing depends on it:** deleted at once, one undo step.
- **Something outside the selection depends on it:** the user is shown every dependent, grouped by
  part and chain, and chooses:
  - **delete them too**;
  - **keep them, frozen**: each direct derived dependent keeps its last geometry as drawn geometry
    and records `frozenFrom`;
  - **cancel**.

  Dependents with no drawn form — references and stitch hole sets — are listed as deleted either
  way.
- **Re-pointing** keeps a relationship while replacing its source: every derived feature can be
  pointed at another compatible source (*Follows*).
- **Parts are removed only by deleting the part.** An emptied part stays, and is reported as
  `EMPTY_PART`.

`planDelete(project, ids)` is the one pure function that answers "what would this delete"; the
dialog reads it and the command enforces it.

*Superseded:* this section previously named "bake" the default, and the M3 implementation
cascades. Both change without telling the user; see the ADR.

### 4.6 Anchors — built, through derivations in 4.4b

[ADR 0010](adr/0010-anchors-address-geometry.md). **A place on a feature is an anchor:
`(featureId, anchor index)`. Nothing addresses geometry by segment index** (S9).

| Feature | Anchors | Stable under |
|---|---|---|
| `rect` shape | Its 4 corners | Width, height, radius, rotation: always 4 |
| Drawn path | Its corners, in order | Moving a point; **not** inserting one. Vertex ids come before slice 3.9 |
| `circle`, `arc` | None | Everything |
| Derived | The source's anchors, mapped by the derivation | Whatever the source is stable under |

How a derivation maps anchors:

- an **offset** maps each source corner to the corner it produced;
- a **mirror** maps each anchor through its transform;
- a **hole set** exposes its stitch line's anchors.

The mapping comes from the code that built the geometry, never from searching for the nearest point:
`offsetPathTraced` reports where each input segment and corner ended up, and the domain maps through
that. A corner arc the offset swallowed is a sharp corner rather than a collapse, so its anchor
still has an image.

Anchors live on the **resolved** feature, as distances along its own path, because that is where the
geometry was built. A partial run keeps only the anchors it covers.

**An anchor with no image is missing** (E4): it keeps its index and is `null` — dropping it would
renumber every anchor after it, which is a run silently moving to a different edge — and anything
that names it fails with `ANCHOR_MISSING`.

### 4.7 Duplicate, flip and mirror — flip built 3.7b; duplicate built 4.3b; mirror built 4.8a

| Operation | Result | Relationship afterwards |
|---|---|---|
| **Duplicate part** | A new part beside the original | None. Derivations inside the part re-point to the copies; derivations to other parts keep pointing there |
| **Flip** | The selected geometry, reflected in place | None |
| **Mirror** | A new feature or part, reflected | Linked ([ADR 0012](adr/0012-mirror-is-a-derivation.md)) |

- A mirror keeps kind and role. Mirroring a part mirrors every feature in it, so the counterpart's
  hole count equals the original's by construction.
- **Gestures on derived features are never silently ignored** (X3). A mirror-derived feature moves
  and rotates through its axis and glide, and refuses to scale. An offset-derived feature or a hole
  set refuses to move on its own ("it follows its outline").
- **Flip is built** (3.7b, [design](superpowers/specs/2026-09-16-reflections-design.md)).
  `transformShape` reflects a rectangle by re-expressing it about its centre: a mirror flips one of
  its own axes to restore handedness and the corner radii travel with it, so a mirrored panel lands
  on the other side of the axis, the same way up, with its rounded corners swapped **across** the
  axis rather than diagonally opposite. Judged against transforming the evaluated path, which is the
  comparison the old round-trip test could not make.
- **A label refuses to be mirrored**, with `TEXT_WOULD_READ_BACKWARDS`: a mirror is a similarity, so
  without refusing it the words would come out rotated rather than reflected.
- **A counterpart owns its placement and nothing else** (built 4.8a,
  [design](superpowers/specs/2026-09-17-mirror-design.md)). The axis and glide are its own; the path,
  the holes, the anchors, the kind and the role all come from its original. A gesture the placement
  can absorb is absorbed — moved alone the axis takes it, moved *with* its source the axis travels
  too, so a pair drags rigidly instead of sliding apart — and a gesture it cannot is refused with a
  reason. Since a glide reflection composed with any isometry is another glide reflection, the only
  thing that can fail is a scale, which is `MIRROR_WOULD_SCALE`.
- **The axis is absolute and does not track the source.** One that chased the source's bounding box
  would jump whenever the geometry changed, moving the counterpart by twice as much for reasons
  nobody could see. Fixed, the rule is one sentence — the counterpart is the original reflected in
  that line — which is also why moving the original moves the counterpart the *opposite* way. The
  panel says so rather than letting it be discovered.
- **A mirror axis is one of two things** (4.8b). `{ kind: 'line' }` is captured once and frozen;
  `{ kind: 'fold', foldId }` **tracks a fold line**, so moving the fold re-mirrors everything folded
  about it. The second makes a mirror the **first two-input derivation**: a *derives* edge to its
  source and a *references* edge to the fold, both walked by S2 and S3. It is not a constraint
  system — one derivation reads one referenced line at evaluation, nothing is bidirectional, and
  moving a counterpart does not move the fold.
- **A fold-tracked counterpart cannot be dragged.** It is placed by its fold, and the refusal names
  the fold and the source. This is the general rule's first instance: **dragging a derived, linked
  result must not silently break or half-alter the relationship.** Absorbing the drag would slide
  one half of a folded piece along its spine; detaching from the fold would break the link the maker
  asked for (X3). Deleting the fold is the deliberate way out, and it offers to **freeze the axis** —
  capturing the line the fold was on, so the counterpart keeps its shape and its source.
- **An outline cannot be mirrored across a fold into its own part** (S5): a piece of leather has one
  edge, and completing a contour from half of one needs a boolean union this project has
  deliberately not bought ([ADR 0008](adr/0008-no-clipper-binding.md)). Refused before the gesture,
  with a message naming both real alternatives — draw the whole outline, or mirror the part to make
  a second piece. Fold symmetry is for what is **inside** a piece: slots, stitching, hardware.
- **`Part.quantity` must never stand in for a mirrored pair.** It means "cut this many of this
  shape", and a left and a right are two *different* shapes — cutting two of one would give the maker
  two left gussets. A mirrored part is a separate part with `quantity: 1`.
- **`Mirror ↔` and `Mirror ↕` are a placement, not a symmetry constraint.** They capture an axis from
  the selection's world-aligned bounding box **at the moment they are used**, and that axis then stays
  where it was put. So changing the original afterwards changes the gap between the pair, and growing
  it far enough makes the two **overlap**. That is intentional and is pinned by a test: an axis that
  tracked the original would be less predictable, not more, because it would move whenever the
  geometry did. What these two gestures promise is "a counterpart of this piece, here" — never "these
  two stay symmetric forever". **Persistent symmetry is mirror-across-fold (4.8b)**, where the axis is
  a fold line the maker drew and can see, rather than a measurement of a shape that keeps changing.
- **Anchors map by doing nothing.** The image path's vertices are the source's reflected in the same
  order, so the arc-length parameterisation is identical and an anchor at *s* is still at *s*; none
  goes missing, because a reflection loses nothing (ADR 0010).
- **A mirrored hole set gets its holes from its source's**, not from redistributing along the
  mirrored line. Two panels sewn together must have the same hole count, and a reflection cannot
  produce a different one — which is why `evaluate` has a second place that produces a `holes` field
  and deliberately so.

## 5. Layer roles — built

Fixed by the domain, not managed by the user. Each feature kind maps to exactly one role, and the
role drives three tables.

| Role | Feature kinds | Screen style | Export layer | In cut export? |
|---|---|---|---|---|
| `cut` | `CutContour` | solid | `cut` | yes |
| `stitch` | `StitchLine` | dashed, blue | `stitch` | no |
| `stitch-holes` | `StitchHoleSet` | dots on screen; true-size marks on paper | `stitch-holes` | optional |
| `fold` | `FoldLine` | dash-dot, green | `fold` | no |
| `mark` | `MarkingLine` | solid, light grey | `mark` | no |
| `hardware` | `HardwareHole` | circle at true size, orange | `hardware` | yes |
| `annotation` | `Measurement`, `TextLabel` | grey, thin | `annotation` | no |

Export presets are role sets: **template print** (everything), **laser or CNC cut** (`cut` and
`hardware`, plus `stitch-holes` if lasered), **stitch guide** (`stitch` and `stitch-holes`).

Users toggle individual features' visibility; they never manage a layer stack.

## 6. Stitch hole distribution — the craft detail

The geometry layer distributes points along a path ([geometry.md](geometry.md) §9). The domain
decides *what the runs are*.

### 6.1 Corner policy — built

- **`continuous`** treats the whole path as one run. Right for shapes made of generous radii.
- **`hole-at-corner`** splits the line at every anchor and distributes each run independently, so a
  hole lands exactly on every corner. The shared hole where two runs meet is emitted once. Each run
  reports its own spacing.

**Later:** a configurable corner-angle threshold, and a radius-aware policy that flows round a large
radius but puts a hole on a tight one. It should become the default once real projects show where
the threshold belongs.

### 6.2 Iron presets

Application configuration, not document data: the **pitch value** is what a hole set stores, so a
file opens identically on a machine that has never heard of the author's irons. SPI is shown as a
hint; the model never stores inches.

### 6.3 What the report must surface

- Hole count per run and in total.
- Achieved spacing per run and overall, beside the nominal pitch.
- **Two levels of deviation** (DR4). Info above 5 %: the seam is visibly uneven. Warning above 25 %:
  holes crowd and can tear out between each other. Both are advice; the geometry is exactly what was
  asked for.
- Total stitch line length, for estimating thread (roughly 4–5 × the seam length).

## 7. Assembly and seams — designed for, built in v1.2

Two parts stitched together must have **the same number of holes** along their mating edges. Getting
it wrong is discovered once the leather is cut.

```ts
interface Seam {
  id: string;
  name: string;
  a: { partId: PartId; holeSetId: FeatureId; run?: Run };
  b: { partId: PartId; holeSetId: FeatureId; run?: Run };
  alignment: 'same-direction' | 'reversed';
}
```

Phase 4 keeps this possible without a migration: hole sets are addressable by id, runs by anchors,
holes by position, and a mirrored part's hole count equals its original's by construction.

## 8. Invariants and diagnostics

[ADR 0013](adr/0013-invariants-are-enforced-rules-are-reported.md). Everything the feature set keeps
true, in one place. Each entry says what enforces it and the slice it lands in.

### 8.1 Three categories

- **Structural invariants** are never violated. Commands refuse with a reason, through a pure query
  sharing the command's check, and the loader refuses files. They never appear as diagnostics.
- **Evaluation outcomes** are how a feature fails to resolve. Each is typed, and each is a
  diagnostic.
- **Design rules** are legal states that are probably wrong for leather. `validate(resolved)` reports
  them, and never blocks editing.

### 8.2 Structural invariants

| Id | Invariant | Enforced by | Lands in |
|---|---|---|---|
| S1 | Feature and part ids are unique | Loader; id generation | built |
| S2 | Every reference resolves to an existing feature | Commands (ADR 0009); loader | 4.2b; **references** edge 4.8b |
| S3 | The reference graph is acyclic | Commands; loader | built for derivations; **references** built 4.8b |
| S4 | Every derivation appears in the compatibility table (§4.2) | Commands; loader | 4.2b |
| S5 | A part has at most one outer contour | Commands; loader | built 4.3a |
| S6 | Outer contours and cut-outs enclose an area | Drawing modes; loader | built 4.3a |
| S7 | A locked feature changes only by being unlocked | Commands | built 4.3b |
| S8 | Derived geometry is never persisted | File format | built |
| S9 | Nothing addresses geometry by segment index | Model types | built for runs; 4.10 |
| S10 | Quantities, distances, pitches and text sizes are positive | Schema; commands | built; extended per slice |

### 8.3 Evaluation outcomes

| Id | Invariant | Lands in |
|---|---|---|
| E1 | Every feature resolves or fails with a typed failure | built, 4.12a |
| E2 | Nothing is silently dropped from what is drawn or printed: not a piece of a split offset, not an unrenderable character | 4.12a for offsets; text 4.11 |
| E3 | A failure is reported once, at its root; dependents report `SOURCE_FAILED` | built, typed 4.12a |
| E4 | A missing anchor fails; it never re-targets | built for runs, 4.12a; through derivations 4.4b |

### 8.4 Design rules

| Id | The domain invariant a rule protects |
|---|---|
| DR1 | A part is a piece of leather with one edge |
| DR2 | Everything in a part lies on its material: inside the outline, outside every cut-out |
| DR3 | A cut path is unambiguous |
| DR4 | Stitching is regular enough to sew |
| DR5 | Printed text is legible |
| DR6 | A part disappears only when someone deletes it |

**Design rules are sampled, not proved** (4.3a). DR2's containment questions — is this line on the
leather, is this cut-out inside the part — are asked at a finite number of points along a path, not
solved. A path that leaves the material and returns between two samples is not reported. This is
deliberate: an exact answer needs path-against-path clipping, which [ADR 0008](adr/0008-no-clipper-binding.md)
declined, and a rule that exists to catch mistakes does not have to certify their absence. What
follows from it: a rule finding nothing is **not** a guarantee, nothing downstream may treat these
rules as a proof of validity, and a cut path or an export must never be gated on one of them. Hole
rules are exact — a hole is a point, and a point is either on the material or not.

### 8.5 Interaction invariants

| Id | Invariant | Lands in |
|---|---|---|
| X1 | No command fails silently: every refusal has a reason, from the same check that refuses | 4.2b onward |
| X2 | No delete changes a feature the user did not name without showing it first | 4.2b |
| X3 | Derived features are never silently detached, converted or ignored | 4.2b, 4.8 |
| X4 | Selection chooses where something goes, never what is created | built 4.3a |
| X5 | Text that can reach paper is set in millimetres, in the vendored typeface, laid out once | built 4.11a |
| X6 | Text that restates a model value is generated, never stored | 4.10, 4.11 |
| X7 | Every surface that shows a problem reads one diagnostic list | 4.12a |
| X8 | Defaults come from project settings | built 4.3a |
| X9 | A transform never silently demotes a shape's representation | built 3.7; explained through the channel 4.12a |
| X10 | A refusal keeps the user's work where it can still be corrected | built 4.3a for drawing |

**S7 — what the lock protects** (built 4.3b). Before it, `locked` was a *pick lock* and nothing
else: `hitTest` and `snap` skipped a locked feature and every command still edited and deleted it
(defect D8). That was worse than no lock, because the one thing it did was take the feature off the
canvas — so a locked outline could not be selected in order to be unlocked. The parts panel is the
way back, which is why the two arrived together.

The lock covers **geometry and structure**: moving, transforming, reshaping, renaming,
re-parameterising, re-pointing a derivation, and deleting — directly, as part of a part, or as the
cascade behind someone else's delete. It does **not** cover visibility. Read strictly S7 would
include hiding, but that is the wrong answer on a workbench: you lock the outline so you cannot
nudge it, and you still want to hide it to see what is underneath. Lock protects the piece, not the
view. A locked feature is also still selectable in the parts panel, and its dependents still follow
it — it simply cannot change itself.

Enforced by refusing inside `mapFeature` **by default**, with an explicit `evenIfLocked` on the two
commands that may touch one, rather than by a check each command remembers to write. Same reasoning
as 4.3a's draw commit boundary: an invariant every caller has to remember is one that eventually
gets forgotten.

**X10 — a refusal is "not yet", not "gone"** (4.3a). Where a rejected operation has a plausible
correction, the work stays put and the reason is shown beside it; the user decides whether to fix it
or abandon it. Where there is no correction to make, the work goes and the reason still stays.

The case that named the rule: an open polyline in Outline mode. It is genuinely refused — an outline
has to enclose something (S6) — but the correction is one more click, so the run stays live, keeps
its rubber band, and can be extended, closed, backspaced or escaped. Discarding eleven points around
a gusset and leaving a sentence in the status bar is a correct refusal delivered as a punishment. By
contrast the Line tool finishes itself at two points and can never close, so holding its points would
trap the user in a refusal they cannot answer: there the points go and only the reason is kept.

Both halves are the same rule as X1 — the reason always survives — with the user's work added to it.
A tool that cannot say which case it is in should keep the work.

### 8.6 Diagnostics

Built in 4.12a as four separated layers — identity, information, presentation, surfaces. The design
is [the slice spec](superpowers/specs/2026-09-15-diagnostic-channel-design.md); the shapes are:

```ts
type Problem = { code: ProblemCode; facts: ProblemFacts[code] };   // facts, never a sentence

interface Diagnostic {                // a problem found in the design, placed
  problem: Problem;
  severity: 'error' | 'warning' | 'info';
  partId: PartId;
  featureId?: FeatureId;              // absent for a problem with the part itself
  related: readonly FeatureId[];      // what a SOURCE_FAILED follows
  location?: ProblemLocation;         // points, or the geometry the problem is about
}

function diagnose(project: Project): readonly Diagnostic[];   // the one list (X7)
function describeProblem(problem: Problem): string;           // the one catalogue of words
```

**Refusals are problems too**, with the same codes and catalogue, but they are never diagnostics:
they are refused at the gesture or by the loader, so they never exist in a document to be listed.
Their codes are `DUPLICATE_ID`, `SOURCE_MISSING`, `FOLLOWS_ITSELF`, `WOULD_LOOP`, `CYCLE` and
`DERIVATION_INCOMPATIBLE` (structural, S1–S4); `FEATURE_MISSING`, `NOT_DERIVED`,
`DERIVED_MOVED_ALONE`, `TRANSFORM_FLATTENS`, `WOULD_BECOME_ELLIPSE`, `WOULD_SHEAR`,
`NO_TARGET_PART` and `TARGET_SPANS_PARTS` (interaction, X1–X9).

The diagnostics themselves:

| Code | Severity | Category | Protects | Lands in |
|---|---|---|---|---|
| `PARAMETER_INVALID` | error | outcome | E1 | built 4.12a |
| `OFFSET_COLLAPSED` | error | outcome | E1 | built 4.12a |
| `OFFSET_UNSUPPORTED` | error | outcome | E1 | built 4.12a |
| `GEOMETRY_FAILED` | error | outcome | E1 | built 4.12a — the fallback for a geometry throw the domain has no specific check for yet |
| `OFFSET_SPLIT` | warning | outcome | E2 | built 4.12a; unreachable until Tier 2 offsetting |
| `SOURCE_FAILED` | error | outcome | E3 | built 4.12a |
| `ANCHOR_MISSING` | error | outcome | E4 | built 4.12a for runs; through derivations 4.4b |
| `TEXT_GLYPH_MISSING` | warning | outcome | E2 | built 4.11a for part names; labels 4.11b |
| `CONTOUR_SELF_INTERSECTS` | error | rule | DR3 | built 4.12a |
| `OUTSIDE_PART` | error for stitch and hardware holes, warning for lines | rule | DR2 | built 4.3a |
| `HOLE_TOO_CLOSE_TO_EDGE` | warning (under 1.5 mm) | rule | DR2 | built 4.3a |
| `CUT_OUT_OUTSIDE_PART` | error | rule | DR2 | built 4.3a |
| `PART_HAS_NO_OUTER_CONTOUR` | error | rule | DR1 | built 4.3a |
| `HOLE_SPACING_UNEVEN` | info (runs differing by above 5 % of the pitch) | rule | DR4 | built 4.12a |
| `HOLE_SPACING_DEVIATION` | warning (above 25 % from the iron) | rule | DR4 | built 4.12a |
| `HOLE_COUNT_TOO_LOW` | warning (under 2 in a set) | rule | DR4 | built 4.12a — counted per set, because with a hole at every corner a short run legitimately contributes one |
| `TEXT_TOO_SMALL_TO_PRINT` | warning (under 1.5 mm) | rule | DR5 | 4.11 |
| `EMPTY_PART` | info | rule | DR6 | built 4.12a (parts are kept since 4.2b) |

**Retired** from the earlier list, because the states they described are now unrepresentable rather
than reportable: `PART_HAS_MULTIPLE_OUTER` (S5), `CONTOUR_NOT_CLOSED` (S6), `BROKEN_DERIVATION` (S2
for a deleted source, `SOURCE_FAILED` for a failed one). `HOLES_OUTSIDE_PART` became `OUTSIDE_PART`.

Since 4.3a the first two exist as **refusal** codes rather than diagnostics — `PART_ALREADY_HAS_OUTER`
and `CONTOUR_NOT_CLOSED` — raised by the command and the loader that refuse them, never listed in the
panel.

**v1.2:** `SEAM_HOLE_COUNT_MISMATCH`, `PARTS_OVERLAP_ON_SHEET`.

An audit test holds the catalogue to this section: every code names an invariant, and every
structural invariant has a command-refusal test and a loader test.

## 9. Templates

**MVP:** save a part to a user library, insert a library part into a project. A copy, with no live
link to the library, stored as `.lcp`-shaped JSON in the user config directory. Inserting re-points
the part's internal derivations to the copies, exactly as duplicating does (§4.7).

**v1.2:** parameterised templates, whose named parameters (`cardWidth`, `stitchMargin`) are read by
shapes and derivations instead of literals.

**Not planned:** a template instance that live-updates when the library template changes.

## 10. What the MVP builds

| Concept | Status | Later |
|---|---|---|
| `CutContour`, `StitchLine`, `StitchHoleSet`, `FoldLine`, `MarkingLine`, `HardwareHole` | Built | |
| Cut-outs, drawn stitch lines, drawing modes | Designed: 4.3, 4.9 | |
| `Measurement` (horizontal, vertical, aligned, radial) | Designed: 4.10 | Angular |
| `TextLabel`, generated captions | Designed: 4.11 | |
| Sources: `path`, `shape`, `derived` · ops: `offset`, `stitch-holes` | Built | |
| Op: `mirror` | Designed: 4.8 | Boolean (v1.2) |
| Reference graph, explicit deletion, re-pointing | Built: 4.2b | References with 4.10 |
| Anchors through derivations | Designed: 4.4b | Vertex ids before 3.9 |
| Evaluation with memoisation and per-feature failures | Built; typed 4.12a | |
| Layer roles and export presets | Built | |
| Corner policies `continuous` and `hole-at-corner` | Built | Radius-aware (v1.1) |
| Validation, the §8.6 catalogue | Designed: 4.12a–4.12 | Seam and layout rules (v1.2) |
| Templates as copies | Later: 8.1 | Parameterised (v1.2) |
| `Seam` and assembly | Design only | v1.2 |
| Material thickness compensation | Fields stored | v1.1 |
| Hardware library | `hardwareType` only | v1.1 |
