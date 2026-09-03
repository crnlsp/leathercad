# Domain Model

**Package:** `packages/domain`
**Status:** Design — no implementation yet
**Last updated:** 2026-09-03

---

## 1. The central idea

A generic vector editor stores *"a black closed path"*. This application stores *"the cut contour of
the outer panel"*, and that difference is the product.

Once geometry carries meaning, four things follow automatically that a vector editor cannot do:

- **Appearance** — a cut line draws solid, a stitch line dashed, a fold line dash-dot. The user
  never picks a stroke style.
- **Behaviour** — a stitch line can be *derived* from a cut contour, because the relationship
  "3.5 mm inside the edge" is meaningful. Two anonymous paths have no such relationship.
- **Export** — a laser-cutting export emits cut contours and hardware holes and drops everything
  else. A template print emits all of it. The user picks an intent, not a set of layers.
- **Validation** — "these stitch holes fall outside their part" is only checkable if the software
  knows which path is a part boundary and which is a hole set.

Everything below serves those four.

## 2. Entity overview

```
Project
├── settings          (grid, default iron, page setup, default stitch inset)
├── ironPresets[]     (named pitch values)
├── materials[]       (name, thickness, colour for display)
├── guides[]
└── parts[]
     └── Part
          ├── name, quantity, materialId, grainDirection, notes
          ├── transform        (placement in the workspace)
          └── features[]
               ├── CutContour
               ├── StitchLine
               ├── StitchHoleSet
               ├── FoldLine
               ├── MarkingLine
               ├── HardwareHole
               ├── Measurement
               └── TextLabel
```

## 3. Features

The discriminated union at the centre of the model. Every feature has a stable id, a name, a
visibility flag, a lock flag, and a `kind`.

```ts
type FeatureId = string;   // ULID — sortable, stable, collision-free

interface FeatureBase {
  id: FeatureId;
  kind: FeatureKind;
  name: string;
  visible: boolean;
  locked: boolean;
}
```

### 3.1 `CutContour`

The outline actually cut from leather. A part has exactly one `role: 'outer'` contour and any
number of `role: 'inner'` contours (card-slot windows, hardware cut-outs, thumb scoops).

```ts
interface CutContour extends FeatureBase {
  kind: 'cut-contour';
  role: 'outer' | 'inner';
  source: GeometrySource;      // see §4
  // invariant: the resolved path must be closed
}
```

Winding is normalised on evaluation: outer contours counter-clockwise, inner clockwise. This is what
lets "inward" and "outward" offsets have an unambiguous meaning.

### 3.2 `StitchLine`

Where the thread runs. Open or closed.

```ts
interface StitchLine extends FeatureBase {
  kind: 'stitch-line';
  source: GeometrySource;
  threadPathLength?: never;    // derived at evaluation, never stored
}
```

Usually derived (`kind: 'offset'` source) from a cut contour by the **stitch inset** — typically
3–4 mm. Occasionally drawn directly, when the user wants stitching that does not follow an edge.

### 3.3 `StitchHoleSet`

The discrete holes. **Always derived from a stitch line** — a hole set with hand-placed holes is a
different thing and is not in scope.

```ts
interface StitchHoleSet extends FeatureBase {
  kind: 'stitch-hole-set';
  stitchLineId: FeatureId;

  pitchMm: number;                 // nominal, from an iron preset or typed
  ironPresetId?: string;

  distribution: 'fit-whole' | 'exact-pitch';
  cornerPolicy: CornerPolicy;      // see §6
  startOffsetMm: number;           // inset from the start of an open line
  endOffsetMm: number;

  hole: {
    shape: 'round' | 'slot' | 'diamond';
    diameterMm: number;            // round: diameter; slot/diamond: width
    lengthMm?: number;             // slot/diamond only
    angleDeg?: number;             // slot/diamond, relative to the local tangent; typically 20–30
  };
}
```

Evaluates to `{ centre: Vec2, tangent: Vec2, index: number }[]` plus a report:
`{ count, actualPitchMm, nominalPitchMm, deviationPercent, runs }`.

The report is not decoration. "How many holes?" and "did my 3.85 mm iron actually come out at
3.85 mm?" are questions the user asks on every project.

### 3.4 `FoldLine`

```ts
interface FoldLine extends FeatureBase {
  kind: 'fold-line';
  source: GeometrySource;
  direction: 'mountain' | 'valley';
  materialThicknessMm?: number;    // overrides the part's material
  bendAllowanceMm?: number;        // v1.1 — computed, not typed, once thickness math lands
}
```

`direction` and `materialThicknessMm` are stored in the MVP even though nothing consumes them yet.
They cost nothing now and they are what makes thickness compensation (v1.1) an additive change
rather than a migration.

### 3.5 `MarkingLine`

```ts
interface MarkingLine extends FeatureBase {
  kind: 'marking-line';
  source: GeometrySource;
  purpose: 'glue-area' | 'alignment' | 'logo' | 'skive' | 'other';
  label?: string;
}
```

Never cut, never stitched. Printed on the template as a light guide, and excluded from cutting
exports.

### 3.6 `HardwareHole`

```ts
interface HardwareHole extends FeatureBase {
  kind: 'hardware-hole';
  centre: Vec2;
  diameterMm: number;
  hardwareType: 'rivet' | 'snap' | 'screw' | 'eyelet' | 'other';
  hardwareRefId?: string;          // v1.1 — link to the hardware library
}
```

Kept distinct from an inner `CutContour` because the semantics differ: hardware holes are punched,
not cut; they export on the cut layer but are reported separately ("6 × 4 mm rivet holes"); and they
have a natural parametric UI (diameter, not a path).

### 3.7 `Measurement`

```ts
interface Measurement extends FeatureBase {
  kind: 'measurement';
  type: 'linear' | 'aligned' | 'radial' | 'angular';
  anchorA: MeasureAnchor;
  anchorB?: MeasureAnchor;
  offsetMm: number;                // how far the dimension line sits from the geometry
  precision: number;               // decimal places, default 1
}

type MeasureAnchor =
  | { kind: 'point'; at: Vec2 }
  | { kind: 'vertex'; featureId: FeatureId; segmentIndex: number; end: 'start' | 'end' }
  | { kind: 'feature-extent'; featureId: FeatureId; axis: 'x' | 'y' };
```

Anchors reference geometry rather than caching coordinates, so a measurement **updates when the
thing it measures changes**. A dimension that silently goes stale is worse than no dimension.

### 3.8 `TextLabel`

Part names, project name, "cut 2", grain arrows. Printed on the template. Uses a vendored font so
that screen, PDF, and SVG agree and snapshots are reproducible.

## 4. Geometry sources and the derivation graph

**This is the most important section in the document.**

Every feature that owns a path gets its geometry from a `GeometrySource`:

```ts
type GeometrySource =
  // Drawn directly. The only kind that is persisted as coordinates.
  | { kind: 'path'; path: Path }

  // A parametric primitive. Stored as parameters; the path is generated.
  | { kind: 'shape'; shape: ParametricShape }

  // Derived from another feature by offsetting.
  | { kind: 'offset'; fromId: FeatureId; distanceMm: number;
      side: 'inward' | 'outward'; join: 'round' | 'miter' | 'bevel'; miterLimit: number }

  // Derived by mirroring another feature.
  | { kind: 'mirror'; fromId: FeatureId; axis: { origin: Vec2; angleRad: number } }

  // Derived by copying with a transform (arrays, rotated copies).
  | { kind: 'transform'; fromId: FeatureId; matrix: Mat2x3 }

  // v1.2 — boolean combination.
  | { kind: 'boolean'; op: 'union' | 'difference' | 'intersection';
      aId: FeatureId; bIds: FeatureId[] };

type ParametricShape =
  | { type: 'rect'; origin: Vec2; w: number; h: number; radii: [number, number, number, number] }
  | { type: 'circle'; centre: Vec2; r: number }
  | { type: 'ellipse'; centre: Vec2; rx: number; ry: number; rotationRad: number }
  | { type: 'polygon'; centre: Vec2; r: number; n: number; rotationRad: number };
```

### 4.1 Why parametric shapes live here and not in `geometry`

A rounded rectangle is a *domain* concept — "the user's panel is 105 × 75 with 8 mm corners" — and
the user edits it by typing 105, not by dragging control points. `packages/geometry` provides
`shapes.roundedRect(...)` as a pure constructor; `packages/domain` stores the parameters and calls
it. Keeping the parameters out of the geometry engine is what stops the engine growing a special
case per product feature.

### 4.2 The graph

Derivation edges form a **directed acyclic graph**. A representative card-holder panel:

```
   ┌─────────────────────┐
   │ CutContour (outer)  │  shape: rect 105×75, radii 8
   └──────────┬──────────┘
              │ offset inward 3.5 mm, round joins
              ▼
   ┌─────────────────────┐
   │     StitchLine      │
   └──────────┬──────────┘
              │ pitch 3.85, fit-whole, hole-at-corner
              ▼
   ┌─────────────────────┐
   │   StitchHoleSet     │
   └─────────────────────┘
```

Change the rectangle to 110 × 75 and all three update. That single behaviour is the biggest daily
time-saver in the product.

### 4.3 Both directions matter

Leatherworkers genuinely work both ways, and the graph supports both because it is direction-neutral:

- **Stitch inset** (common): draw the outline, derive the stitch line inward 3.5 mm.
- **Seam allowance** (the reverse): draw the stitch line — the functional dimension, e.g. "the
  pocket opening must be exactly 95 mm" — and derive the cut contour outward by the allowance.

Seam allowance is therefore **not a property**. It is a derivation direction. Modelling it as a
number hanging off a contour would force one workflow on everyone and would not survive contact with
real projects.

### 4.4 Evaluation

```ts
function evaluate(project: Project): ResolvedProject;

type ResolvedFeature =
  | { ok: true;  id: FeatureId; geometry: ResolvedGeometry; report?: FeatureReport }
  | { ok: false; id: FeatureId; error: EvaluationError };
```

Rules:

1. **Topological order.** Cycles are rejected at *command* time, not at evaluation time — the
   command that would create a cycle fails and the UI explains why. Evaluation can then assume a
   DAG.
2. **Memoised per node**, keyed on a hash of the node's own parameters plus the resolved hashes of
   its inputs. Editing one part does not re-evaluate the others.
3. **Errors are per-node.** An offset that collapses produces a failed node, not a blank canvas. The
   part still renders; the broken feature shows in the problems panel and draws as a warning
   outline.
4. **Derived geometry is never persisted.** The file stores parameters; evaluation regenerates
   paths on load. This keeps files small, keeps them free of stale data, and means an improved
   offset algorithm silently improves every existing file.
5. **Deterministic.** Same project in, same resolved geometry out, always. Golden tests depend on
   this.

### 4.5 Deleting a node with dependents

Three options, and the choice matters for how the app feels:

- **Block** the delete — safe, annoying.
- **Cascade** — deletes work the user did not ask to lose.
- **Bake** — convert each dependent's source from `{kind:'offset', fromId}` to `{kind:'path', path}`
  using its last resolved geometry, then delete.

**Bake is the right default.** The user loses the parametric link, which the UI states clearly, but
loses no geometry. Offer "delete with dependents" as an explicit alternative.

## 5. Layer roles

Fixed by the domain, not user-managed. Each feature kind maps to exactly one role, and the role
drives three separate tables.

| Role | Feature kinds | Screen style | Export layer | In cut export? |
|---|---|---|---|---|
| `cut` | `CutContour` | solid, 1 px, black | `cut` | yes |
| `stitch` | `StitchLine` | dashed 2-2, blue | `stitch` | no |
| `stitch-holes` | `StitchHoleSet` | filled dots, blue | `stitch-holes` | optional |
| `fold` | `FoldLine` | dash-dot, green | `fold` | no |
| `mark` | `MarkingLine` | solid, light grey | `mark` | no |
| `hardware` | `HardwareHole` | solid circle, orange | `hardware` | yes |
| `annotation` | `Measurement`, `TextLabel` | grey, thin | `annotation` | no |

Export *presets* are then just role sets:

- **Template print** — everything.
- **Laser / CNC cut** — `cut` + `hardware` (+ `stitch-holes` if the user wants them lasered).
- **Stitch guide only** — `stitch` + `stitch-holes`.

Users can still toggle individual features' visibility, but they never manage a layer stack. One
less concept.

## 6. Stitch hole distribution — the craft detail

Where most of the domain-specific value sits. The geometry layer distributes points along a path
([geometry.md](geometry.md) §9); the domain layer decides *what the runs are*.

### 6.1 Corner policy

```ts
type CornerPolicy =
  | { kind: 'continuous' }
  | { kind: 'hole-at-corner'; cornerAngleThresholdDeg: number }   // default 30
  | { kind: 'hole-at-corner-radius-aware';
      cornerAngleThresholdDeg: number; maxRadiusMm: number };     // default 2
```

**`continuous`** treats the whole path as one arc-length run. Correct for shapes made of generous
radii, where there is no visual corner.

**`hole-at-corner`** is what most makers want on a square or tightly-radiused corner: a hole lands
*exactly* on the corner, because a corner without a hole looks wrong and stitches badly. Implemented
by splitting the path at every vertex whose turn angle exceeds the threshold, then running
`fit-whole` independently on each resulting run. Each run gets its own `actualPitch`, so the report
must list per-run values, not one global number.

**`hole-at-corner-radius-aware`** is the refinement: an 8 mm radius is a smooth curve and should
flow continuously; a 1 mm radius is visually a corner and should get a hole. Split only where the
turn is sharp *and* the local radius is below `maxRadiusMm`. This is the policy that should
eventually become the default; ship the simpler two first and add it once real projects show what
the threshold should be.

### 6.2 Iron presets

Shipped defaults, editable and extensible by the user:

| Name | Pitch (mm) | ≈ SPI |
|---|---|---|
| 2.7 mm | 2.7 | 9.4 |
| 3.0 mm | 3.0 | 8.5 |
| 3.38 mm | 3.38 | 7.5 |
| 3.85 mm | 3.85 | 6.6 |
| 4.0 mm | 4.0 | 6.4 |
| 5.0 mm | 5.0 | 5.1 |

Stored as mm. SPI is shown as a hint only — the model never stores inches.

### 6.3 What the report must surface

- Hole count per run and in total
- Achieved pitch per run, and the deviation from nominal
- A **warning above 5 % deviation** — at that point the user should adjust the shape or accept
  visibly uneven stitching
- Total stitch line length, for estimating thread (rule of thumb: 4–5× the seam length)

## 7. Assembly and seams — designed now, built in v1.2

Two parts stitched together must have **the same number of holes** along their mating edges. Getting
this wrong is discovered when the leather is already cut, which is exactly the class of error
software should prevent.

```ts
interface Seam {
  id: string;
  name: string;
  a: { partId: PartId; holeSetId: FeatureId; range?: [number, number] };
  b: { partId: PartId; holeSetId: FeatureId; range?: [number, number] };
  alignment: 'same-direction' | 'reversed';
}
```

The MVP does not build the seam UI, but it must not make it impossible: hole indices are stable and
exposed in the evaluation output, and hole sets are addressable by id. That is enough for v1.2 to
add pairing without a migration.

## 8. Validation

A pure function over the resolved project. Runs after every evaluation and feeds a problems panel.

```ts
function validate(resolved: ResolvedProject): Diagnostic[];

interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;                    // stable, e.g. 'HOLES_OUTSIDE_PART'
  message: string;
  partId?: PartId;
  featureId?: FeatureId;
  location?: Vec2;                 // for "zoom to problem"
}
```

### MVP rules

| Code | Severity | Meaning |
|---|---|---|
| `CONTOUR_NOT_CLOSED` | error | A cut contour must be closed |
| `CONTOUR_SELF_INTERSECTS` | error | Self-intersecting outline; the cut path is ambiguous |
| `OFFSET_COLLAPSED` | error | The offset produced nothing — inset exceeds the shape's inradius |
| `OFFSET_SPLIT` | warning | The offset produced disjoint pieces; probably not intended |
| `HOLES_OUTSIDE_PART` | error | Stitch holes fall outside their part's outer contour |
| `HOLE_TOO_CLOSE_TO_EDGE` | warning | Hole centre nearer the cut edge than 1.5 mm — it will tear |
| `HOLE_SPACING_DEVIATION` | warning | Achieved pitch differs from nominal by more than 5 % |
| `HOLE_COUNT_TOO_LOW` | warning | Fewer than 2 holes on a run |
| `PART_HAS_NO_OUTER_CONTOUR` | error | A part must have exactly one outer contour |
| `PART_HAS_MULTIPLE_OUTER` | error | Same |
| `EMPTY_PART` | info | A part with no features |
| `BROKEN_DERIVATION` | error | A feature references a deleted or failed source |

### v1.2 rules

`SEAM_HOLE_COUNT_MISMATCH`, `INNER_CONTOUR_OUTSIDE_OUTER`, `PARTS_OVERLAP_ON_SHEET`,
`FOLD_LINE_NOT_ON_PART`.

Diagnostic codes are stable strings so tests, docs, and the UI can reference them without
duplicating message text.

## 9. Templates

**MVP:** save a part to a user library, insert a library part into a project. A copy — no live link
to the library. Stored as `.lcp`-shaped JSON in the user config directory.

**v1.2:** parameterised templates. A template exposes named parameters (`cardWidth`, `stitchInset`)
bound to fields in its shapes and derivations; inserting one prompts for values. This is a natural
extension of the derivation graph — a parameter is just a named scalar that graph nodes read instead
of a literal — but it needs the graph to be settled first, which is why it waits.

**Not planned:** a template *instance* that live-updates when the library template changes. That
sounds appealing and creates a hard versioning problem for very little real benefit.

## 10. What the MVP builds

| Concept | MVP | Later |
|---|---|---|
| `CutContour`, `StitchLine`, `StitchHoleSet`, `FoldLine`, `MarkingLine`, `HardwareHole` | ✅ | |
| `Measurement` (linear, aligned, radial) | ✅ | angular |
| `TextLabel` | ✅ | |
| `GeometrySource`: `path`, `shape`, `offset`, `mirror`, `transform` | ✅ | `boolean` (v1.2) |
| Evaluation DAG with memoisation and per-node errors | ✅ | |
| Layer roles and export presets | ✅ | |
| Corner policies `continuous` and `hole-at-corner` | ✅ | radius-aware (v1.1) |
| Iron presets | ✅ | user-shareable preset files |
| Validation (the 12 MVP codes) | ✅ | seam and layout rules (v1.2) |
| Templates as copies | ✅ | parameterised templates (v1.2) |
| `Seam` / assembly | design only | v1.2 |
| Material thickness compensation | fields stored | v1.1 |
| Hardware library | `hardwareType` enum only | v1.1 |
