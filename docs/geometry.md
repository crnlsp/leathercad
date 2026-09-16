# Geometry Engine

**Package:** `packages/geometry`
**Status:** Design — no implementation yet
**Last updated:** 2026-09-03

---

## 1. Contract

`packages/geometry` is **pure**. It contains no state, no I/O, no randomness, no time, and — most
importantly — **no concept of a pixel, a screen, a colour, or a file format**. Every function takes
plain data and returns plain data.

It may import only `packages/core` (ids, result types, epsilons, assertions).

This is not stylistic. It is what makes the engine testable in milliseconds, property-testable at
scale, runnable from the CLI and CI, and swappable for a WASM implementation later.

**Units: every scalar is millimetres. Every angle is radians. The Y axis points up.**

## 2. Coordinate system

**Y-up, X-right, angles counter-clockwise from +X.**

This matches CAD convention, DXF, and PDF — the two output formats where precision matters most.
Canvas2D and SVG are Y-down, so the flip lives in exactly two places: the Canvas2D backend and the
SVG writer. Both have a regression test asserting that a point at y = +10 renders *above* one at
y = 0.

Do not add a second flip anywhere else. If something looks upside down, the bug is in one of those
two files.

## 3. Numeric strategy

The single largest source of subtle bugs in geometry code. Handled centrally.

### 3.1 The working range

Documents span 0.1 mm to 2 000 mm. IEEE-754 doubles carry ~15–16 significant decimal digits, so at
2 000 mm the absolute resolution is about 1e-13 mm. There is enormous headroom; the risk is not
precision loss but *inconsistent comparison*.

### 3.2 Epsilons

One module, `core/epsilon.ts`. Nothing defines its own.

```ts
export const EPS_POINT  = 1e-7;    // mm — two points are the same point
export const EPS_PARAM  = 1e-9;    // dimensionless — t along a segment
export const EPS_ANGLE  = 1e-9;    // radians
export const EPS_AREA   = 1e-12;   // mm²
export const EPS_LENGTH = 1e-7;    // mm — a segment shorter than this is degenerate

export function approxEq(a: number, b: number, eps = EPS_POINT): boolean;
export function approxZero(a: number, eps = EPS_POINT): boolean;
```

`EPS_POINT` at 1e-7 mm (0.1 nanometre) sits far above floating-point noise and far below any
meaningful leather dimension, which is the property an epsilon needs.

**Rule: no `===`, `<`, or `>` on floating-point quantities that could be equal.** Ordering
comparisons where equality is impossible are fine. An ESLint rule flags float equality in
`geometry` and `domain`.

### 3.3 Input quantisation

Every coordinate that enters the model from the user — typed, clicked, or snapped — is quantised to
a **1e-4 mm (0.1 µm) grid** before being stored:

```ts
export function quantise(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}
```

This does three useful things at once:

1. Makes coincidence robust: two endpoints the user snapped together are *bitwise* equal, not
   "equal within epsilon".
2. Makes serialisation stable, so saving an untouched file produces a byte-identical result and
   `.lcp` files diff cleanly in git.
3. Aligns with Clipper2's integer coordinate space (§6), where 1 integer unit = 1e-4 mm gives a
   ±214 000 mm range in `int32` and effectively unlimited range in `int64`.

Quantisation applies to *source* geometry only. Intermediate computation runs at full double
precision.

### 3.4 Guards

Every public entry point rejects `NaN` and `Infinity` rather than propagating them. A single `NaN`
in a control point silently blanks the canvas and produces an unopenable file; catching it at the
boundary turns a mystery into a message.

## 4. Primitives

### 4.1 Points and vectors

```ts
export type Vec2 = { readonly x: number; readonly y: number };
```

A plain object, not a class. V8 optimises these well, they serialise directly to JSON, and they
carry no prototype into the file format. Treated as immutable by convention; not frozen, because
`Object.freeze` is slow in hot paths.

Operations are free functions: `add`, `sub`, `scale`, `dot`, `cross`, `len`, `lenSq`, `normalise`,
`perp`, `rotate`, `lerp`, `dist`, `distSq`, `angleOf`.

Prefer `lenSq`/`distSq` in comparisons — avoiding the square root is both faster and more accurate.

### 4.2 Transforms

```ts
export type Mat2x3 = {
  readonly a: number; readonly b: number;   // | a c e |
  readonly c: number; readonly d: number;   // | b d f |
  readonly e: number; readonly f: number;   // | 0 0 1 |
};
```

Constructors: `identity`, `translate`, `rotate`, `scale`, `mirrorAbout(line)`, `compose`, `invert`.

Property test: `apply(invert(m), apply(m, p)) ≈ p` for all invertible `m`.

**Non-uniform scaling and arcs.** A circular arc under a non-uniform scale becomes an *elliptical*
arc, which the `Segment` union cannot represent. Two rules resolve this:

1. **Parametric shapes are resized through their parameters, not by transforming their geometry.**
   Stretching a 105 × 75 rounded rectangle changes `w` and `h` in the domain record and regenerates
   the path. The corner radii stay circular, which is what the user wants — nobody wants their 8 mm
   corners to become ellipses because they widened the panel.
2. **Free-form paths under a non-uniform scale convert their arcs to cubics** first, then transform.
   Cubics are closed under affine transformation, so the result is exact for the cubics and within
   the arc-to-cubic approximation error (< 1e-4 mm with the standard four-segment subdivision) for
   the arcs.

`transformPath` therefore inspects the matrix: if it is a similarity transform (uniform scale,
rotation, translation, mirror), arcs stay arcs; otherwise they are converted. This decision is made
in one place and must not be duplicated by callers.

### 4.3 Segments

A discriminated union — three cases, deliberately not more:

```ts
export type Segment =
  | { kind: 'line';  a: Vec2; b: Vec2 }
  | { kind: 'arc';   centre: Vec2; radius: number;
                     startAngle: number; sweepAngle: number }
  | { kind: 'cubic'; p0: Vec2; p1: Vec2; p2: Vec2; p3: Vec2 };
```

Decisions embedded here:

- **Arcs use centre parameterisation**, not SVG's endpoint parameterisation. Centre form makes
  every arc computation — point-at-angle, tangent, length, intersection, offset — direct. Endpoint
  form is converted on import and export only.
- **The sweep is one signed angle**, not a start/end pair plus a direction flag. With `endAngle`
  and `ccw` you cannot distinguish a zero-length arc from a full circle when the two angles are
  equal, and every consumer has to normalise before it can do anything. A signed `sweepAngle` says
  direction and extent in one number, makes `reverse` a sign flip, and makes "is this angle on the
  arc" a subtraction with no special cases.
- **Quadratic Béziers are converted to cubics on ingest.** A fourth case would double the surface
  area of every algorithm in exchange for nothing; the cubic representation of a quadratic is exact.
- **Ellipses and elliptical arcs are represented as cubics**, not as a fourth segment kind. Exact
  circular arcs are worth a dedicated case because they are everywhere in leatherwork (every
  radiused corner); general ellipses are rare enough that a cubic approximation within 1e-4 mm is
  the right trade.

Every segment supports the same interface, which is what keeps the algorithms uniform:

```ts
pointAt(seg, t): Vec2;          // t in [0,1], NOT arc-length parameterised
tangentAt(seg, t): Vec2;
length(seg): number;
bbox(seg): Rect;                // exact, see §4.5
split(seg, t): [Segment, Segment];
reverse(seg): Segment;
transform(seg, m): Segment;
```

**`tangentAt` at a cusp.** A cubic's derivative vanishes wherever control points coincide — at
`t = 0` when `p0 === p1`, at `t = 1` when `p2 === p3`, both routine in offset output — and at any
`t` where the curve doubles back. The curve still has a direction there, so `tangentAt` falls back
to the second derivative and then to the chord. Getting the fallback's sign wrong is invisible to a
unit-length check and leaves the tangent 180° out, which `offset` turns into a join bridged the
wrong way round.

**The sign comes from the first derivative wherever it is not exactly zero.** A derivative too short
for `EPS_POINT` to normalise is too short to trust for its *length*, not its *direction*, so the
fallback is turned to agree with it. Only where the derivative is exactly zero is there nothing to
read, and there `tangentAt` returns the **outgoing** direction — the way a traveller faces just after
`t` — except at `t = 1`, where there is no "just after" and the incoming direction is the only one.

It is not decided by how close `t` is to an end. An earlier fix did that with a band of `EPS_PARAM`,
but near a stationary end the derivative drops under `EPS_POINT` at `1 − t ≈ 1e-7 / (6 |p2 − p1|)`,
which is past `EPS_PARAM` for any control leg shorter than about 17 mm — so every `t` in between
came back reversed. A band sized to fit would just be the same mistake with a different number.

The consequence, which is a genuine limit rather than an implementation gap: `tangentAt` is **not**
antisymmetric under `reverse` at an interior cusp. Reversal swaps the incoming and outgoing
directions, which are already exact negations of each other, so the same vector comes back both
ways. No single-valued tangent can be both defined and antisymmetric there, and offsetting and
stitch distribution need it defined. Property tests asserting the flip must exclude interior cusps —
the endpoints are safe, because doubling back needs both branches and an endpoint has only one.

### 4.4 Paths

```ts
export type Path = {
  readonly segments: readonly Segment[];
  readonly closed: boolean;
};
```

**Invariant:** consecutive segments share endpoints within `EPS_POINT`, and if `closed`, the last
segment's end coincides with the first segment's start.

Storing endpoints explicitly on every segment is redundant — a command-list form would not — but it
makes every algorithm simpler: any segment can be examined, split, offset, or reversed without
walking the path to find where it starts. The redundancy is checked by `validatePath()`, which runs
in tests and on file load, never in hot paths.

Path operations: `length`, `bbox`, `reverse`, `transform`, `isClosed`, `area` (signed, closed paths
only), `winding`, `containsPoint`, `subpathBetween(d0, d1)`.

### 4.5 Bounding boxes must be exact

The bounding box of a cubic is **not** the bounding box of its control points. Using the control
hull produces print pages larger than needed and misaligned "fit to content".

Exact bbox: solve `dx/dt = 0` and `dy/dt = 0` (quadratics in `t`), keep roots in `[0,1]`, and take
the extremes of the endpoints plus those roots. For arcs, include the axis crossings (0, π/2, π,
3π/2) that fall inside the angular sweep. This is twenty lines and it matters.

### 4.6 Shapes are constructors, not types

There is no `Rectangle` type in `packages/geometry`. There are **constructors that return `Path`**:

```ts
shapes.line(a, b): Path;
shapes.polyline(points, closed): Path;
shapes.rect(origin, w, h): Path;
shapes.roundedRect(origin, w, h, radii: CornerRadii): Path;   // four independent radii
shapes.circle(centre, r): Path;
shapes.ellipse(centre, rx, ry, rotation): Path;
shapes.arcThroughPoints(a, b, c): Path;
shapes.regularPolygon(centre, r, n, rotation): Path;
```

The *parametric record* ("this part is a 105 × 75 rounded rectangle with 8 mm corners") lives in
`packages/domain`, not here. If parametric shapes were geometry types, every algorithm would need a
case for each one, and the engine would grow a special case per product feature. Keeping geometry
generic and parameters semantic is what stops that.

Rounded rectangles with per-corner radii are the workhorse of leathercraft, so `roundedRect`
deserves care: it must clamp radii that exceed half the shorter side, handle zero radii by emitting
no arc, and produce line-arc-line-arc-… in a consistent winding.

## 5. Flattening and arc length

### 5.1 Flattening

Every hard operation reduces to flattening. It must be deterministic — the same input must always
produce the same polyline — because golden tests and file round-trips depend on it.

```ts
flatten(path: Path, toleranceMm: number): Vec2[][];   // one array per subpath
```

Adaptive subdivision by **flatness**: recursively split a cubic until the maximum distance from the
curve to the chord falls below the tolerance, using the standard control-point deviation bound.
Arcs subdivide by the sagitta formula: for tolerance `ε` on radius `r`, the maximum step angle is
`2·acos(1 − ε/r)`.

Tolerances:

| Use | Tolerance |
|---|---|
| Screen rendering | 0.05 mm (below one screen pixel at any usable zoom) |
| Export and print | 0.005 mm (600 dpi is 42 µm, so this is invisible) |
| Offsetting | 0.005 mm |
| Hit testing | derived from the 10 px pick radius via the viewport |

**Arc to cubic is not free.** PDF has no arc primitive, so every arc in an exported pattern is
converted to Béziers. With the standard `4/3·tan(θ/4)` handle, the maximum radial error is
`≈ 1.81e-5 · radius · θ⁶` (measured, accurate to 0.5% across 10°–90°). A fixed quarter-turn
subdivision therefore leaves 0.027 mm of error at a 100 mm radius — five times the export budget.
`toCubics` derives its step from the tolerance instead; because the error goes as θ⁶, one extra
split takes that same arc to 0.0004 mm. The coefficient lives in `geometry/tolerance.ts` with a
test that guards it against drift.

Recursion depth is capped (32) with an assertion, so a degenerate curve cannot hang the app.

### 5.2 Arc-length parameterisation

Stitch hole placement needs "give me the point 3.85 mm further along this path", which the natural
parameter `t` cannot answer — `t` is not proportional to distance on a cubic.

Build a lookup table per path: flatten at the working tolerance, accumulate chord lengths, and
binary-search it. Refine with one or two Newton steps against the true derivative for accuracy
better than the flattening tolerance.

```ts
class PathMeasure {
  constructor(path: Path, toleranceMm: number);
  totalLength(): number;
  pointAtDistance(d: number): Vec2;
  tangentAtDistance(d: number): Vec2;
  normalAtDistance(d: number): Vec2;
  distanceAtParam(segIndex: number, t: number): number;
}
```

Cache `PathMeasure` per resolved path in the evaluation layer; building it is the expensive part,
querying it is not.

Property tests: total length is invariant under rigid transform and under reversal; the sum of
sub-lengths equals the whole; `pointAtDistance(0)` is the start and `pointAtDistance(L)` is the end.

## 6. Offsetting

**The hardest algorithm in the project, and the one users will exercise constantly** — every derived
stitch line is an offset.

### 6.1 Why not naive per-segment offsetting

Offsetting each segment individually and joining them works on a convex shape and fails on the first
real wallet. At concave corners the offset segments overshoot and cross, producing self-intersecting
loops that must be detected and removed. Getting that pruning right in the general case is a
research-grade problem.

### 6.2 The approach: two tiers behind one interface

```ts
export function offsetPath(
  path: Path,
  distanceMm: number,          // signed: + is left of direction, - is right
  opts: {
    join: 'round' | 'miter' | 'bevel';
    miterLimit?: number;       // default 4
    toleranceMm?: number;      // default 0.005
  },
): Path[];                     // may return 0, 1, or many paths
```

The signature returns `Path[]`, not `Path`, because offsetting genuinely can produce nothing (the
shape collapsed) or several disjoint pieces (a narrow waist pinched apart). Callers must handle all
three; the domain layer turns "zero results" into a validation error rather than a crash.

**Tier 1 — analytic, exact.** When the path contains only lines and arcs and the offset does not
self-intersect, offset analytically: a line becomes a parallel line, an arc becomes a concentric arc
with radius `r ± d`. Arcs stay arcs, so a rounded rectangle's stitch line is still a rounded
rectangle. Detect self-intersection afterwards; if any is found, fall through to Tier 2.

**Tier 2 — flatten and clip, robust.** Flatten to a polygon at 0.005 mm, offset with **Clipper2**,
and return the result as a polyline `Path`. Clipper2 handles the self-intersection removal, which is
precisely the part that is hard to get right.

**Tier 1 was built first, against the original plan.** The intent was Tier 2 first, on the grounds
that it is correct in all cases. It was attempted in slice 1.9 and abandoned: `clipper2-js` — the
only pure-JavaScript Clipper2 binding, and the only one that does not force an async WebAssembly
init through this pure layer — returns a wrong round-join offset. A 100 mm square offset outward by
10 mm comes back with an area of 12000 mm² where the true value is 14314 mm², which is below even a
bevel join's 14200 mm², so no join setting explains it. `ArcTolerance` has no effect at all.

`clipper2-wasm`, the faithful build, cannot run here at all: the renderer's CSP is `script-src
'self'` with no `'wasm-unsafe-eval'`, so Chromium refuses to compile any WebAssembly in it. See
ADR 0008 for both investigations and the numbers behind them.

**Tier 2 will be written here, not bought.** After two rejected bindings the decision is to stop
shopping: it is slice 9.11, alongside boolean operations, which share the same hard part. Nothing
before it needs it — Tier 1 handles outlines of lines and arcs including concave corners, which is
every shape the drawing tools produce that a leatherworker actually cuts. Only an offset that
folds over itself is refused, with a validation error naming the shape rather than a wrong answer.

Tier 1 needs no dependency and produces better output anyway — arcs stay arcs.

**Tier 1's scope: paths of lines and arcs, open or closed, concave corners included.** Each corner
is judged on its own turn — where the offsets lean apart the gap is bridged with an arc, and where
they overlap they are trimmed to their intersection. An open path's ends simply end: a stitch line
along three sides of a pocket is an open offset, and it is the most common seam in leatherwork.
It rejects, rather than guesses at:

- **cubics**, which have no exact offset — the offset of a cubic is not a cubic;
- **overlaps where either side is an arc**, which the line-line intersection this tier uses cannot
  solve;
- **a result that self-intersects.** This replaced an input convexity test in slice 4.2a. Asking
  whether the input was convex refused an ordinary thumb scoop for what concavity *could* do
  elsewhere; asking whether the output folded over itself answers the question actually being asked.
  *Pruning* those loops — computing the correct remaining outline — is still Tier 2's job.

There is no tolerance parameter, because nothing is approximated. A line offsets to a parallel line
and an arc to a concentric one with radius `r ∓ d`; corners are either tangent already, bridged with
an exact arc, or trimmed at an exact intersection.

A corner arc consumed by the offset is a **corner, not a collapse** — it is dropped, and its
neighbours are trimmed to where they meet. Offsetting a rounded rectangle outward and back must
return the sharp rectangle it started as, and insetting a 3 mm corner by 3.5 mm must give a sharp
one. That second case used to abandon the whole path, which meant roughly half of realistic wallet
panels could not be given a stitch line at all. Only a segment cut past its own end means the ring
has closed over itself.

### 6.3 If robust offsetting is ever built here

Rules kept from the rejected integration work, because they will apply to our own implementation
just as they did to a library's:

- Work in integers at the quantisation scale — **1 unit = 1e-4 mm**. Conversion is exact for
  coordinates that have already been quantised (CLAUDE.md invariant 8), so the round trip introduces
  no error of its own.
- `offsetPathTraced` returns the same pieces plus **where each input segment and corner ended up**,
  which is what anchors on derived geometry are built from (ADR 0010, slice 4.4b). The
  correspondence comes from the joining code, because that is the only place it exists.
- Whatever computes it, the entry point stays `offsetPath`, returning `Path[]`. Callers already
  handle zero, one and several results, so a better implementation is a drop-in.
- Arc tolerance for round joins comes from our flatten tolerance. Never a library's default, and
  never a constant chosen because it looked reasonable.
- **A correct bounding box proves nothing.** Every wrong result from the rejected binding had the
  right bounds and the wrong area, because a self-intersecting ring loses area to the shoelace sum
  while still spanning the same extent. Test the area.

### 6.4 Offset direction

Signed distance is defined relative to path direction: positive is to the **left** of travel.
"Inward" and "outward" are domain concepts that require knowing the winding of a closed contour, so
the domain layer normalises contour winding (outer contours counter-clockwise, holes clockwise) and
converts inward/outward into a sign. Geometry stays direction-based and agnostic.

## 7. Intersections

```ts
intersectSegments(a: Segment, b: Segment): Intersection[];   // { point, tA, tB }
intersectPaths(a: Path, b: Path): Intersection[];
selfIntersections(p: Path): Intersection[];
```

Analytic for line/line, line/arc, and arc/arc — these are the common cases and they are exact.
Anything involving a cubic uses flatten-and-refine: find candidate crossings on the flattened
polylines, then polish each with Newton iteration on the true parametric forms to converge below
`EPS_POINT`.

Edge cases that need explicit tests: collinear overlapping segments (infinitely many intersections
— return the overlap endpoints), tangent circles (one intersection, numerically fragile), endpoints
touching exactly, and near-parallel lines where the determinant approaches zero.

Intersections feed snapping, trimming, and self-intersection detection in offsetting.

## 8. Boolean operations

Post-MVP as a *feature*, but the dependency arrives with offsetting, so the API is defined now:

```ts
booleanOp(a: Path[], b: Path[], op: 'union' | 'difference' | 'intersection' | 'xor'): Path[];
```

Delegated to Clipper2 on flattened input, with **non-zero winding** as the fill rule, matching SVG's
and PDF's default so that on-screen, exported, and computed results agree.

Property test: `area(A ∪ B) + area(A ∩ B) ≈ area(A) + area(B)`.

## 9. Point distribution — the stitch hole primitive

Geometry provides the mathematics; the craft policy lives in `domain`.

```ts
export function distributeAlongPath(
  measure: PathMeasure,
  opts: {
    mode: 'exact-pitch' | 'fit-whole';
    pitchMm: number;
    startOffsetMm?: number;
    endOffsetMm?: number;
    closed: boolean;
  },
): {
  points: readonly { distance: Mm; point: Vec2; tangent: Vec2 }[];
  actualPitch: Mm;
};
```

The achieved pitch comes back with the points rather than being left for the caller to infer.
Under `fit-whole` it is the only way to know what was actually achieved, and recomputing it from
consecutive distances would be a second implementation of the same arithmetic.

- **`exact-pitch`** — step by exactly `pitchMm` from the start; whatever remains at the end is left
  over. Correct for an open run where the user cares about matching a specific iron exactly.
- **`fit-whole`** — compute `n = round(usableLength / pitchMm)`, then use
  `actualPitch = usableLength / n`. Correct for closed contours, where a leftover gap would be
  visible and wrong. Report `actualPitch` so the domain layer can warn if it deviates from nominal
  by more than a few percent.

For a closed path, the last hole must not coincide with the first — `n` intervals produce `n` holes,
not `n + 1`. `startOffsetMm` shifts the phase of the first hole; `endOffsetMm` has no meaning on a
closed path and is rejected rather than ignored.

Two roundings are pinned by tests rather than left to chance. A run shorter than half a pitch would
round to zero intervals, so `n` is clamped to one and gets a hole at each end — which also keeps the
division safe. A run of exactly two and a half pitches is a tie, and rounds up.

Corner handling is *not* here. It is a domain policy that works by splitting the path at corner
vertices and calling this function once per run. See [domain-model.md](domain-model.md) §6.

## 10. Separation from rendering

Restating the boundary, because it is the one most likely to erode:

| `geometry` knows about | `geometry` must never know about |
|---|---|
| millimetres, radians | pixels, DPI, device pixel ratio |
| `Vec2`, `Segment`, `Path`, `Mat2x3` | colour, stroke width, dash patterns, opacity |
| lengths, areas, angles, intersections | canvas contexts, the DOM, SVG, PDF |
| tolerances | zoom level, viewport, screen size |

The renderer's job is to take a `Path`, apply the viewport transform, apply a style resolved from
the feature's layer role, and emit backend calls. It never modifies geometry; it never rounds
coordinates to pixels before transforming them.

A concrete consequence to hold onto: **hit testing happens in millimetres.** The 10-pixel pick
radius is converted to a millimetre tolerance through the viewport, and then every distance
comparison is a geometry-package call in mm. Testing in screen space would make hit results depend
on zoom in ways that are impossible to unit-test.

## 11. Module layout

```
packages/geometry/src/
├── index.ts                 # public API surface — the only entry point
├── vec2.ts
├── mat2x3.ts
├── rect.ts                  # axis-aligned bounding boxes
├── segment/
│   ├── index.ts             # the union + dispatch
│   ├── line.ts
│   ├── arc.ts
│   └── cubic.ts
├── path/
│   ├── path.ts              # construction, invariants, validation
│   ├── measure.ts           # PathMeasure, arc-length
│   ├── flatten.ts
│   ├── bbox.ts              # exact bounds
│   ├── winding.ts
│   └── contains.ts
├── shapes.ts                # Path constructors
├── ops/
│   ├── offset.ts
│   ├── boolean.ts
│   ├── intersect.ts
│   ├── distribute.ts
│   ├── trim.ts
│   └── fillet.ts            # corner rounding, post-MVP
```

Tests are co-located (`vec2.test.ts` beside `vec2.ts`), with golden fixtures under
`packages/geometry/__golden__/`.

## 12. Definition of done for any geometry function

Enforced by the `geometry-review` skill and by code review:

1. Public entry points guard against `NaN` and `Infinity`.
2. Degenerate inputs are handled explicitly and documented: zero-length segments, duplicate
   consecutive points, empty paths, zero-radius arcs, all-coincident cubic control points.
3. No float equality; epsilons come from `core/epsilon.ts`.
4. At least one **property test**, not only examples. See [testing.md](testing.md) §3 for the
   catalogue of properties that apply.
5. Deterministic: the same input always produces bitwise-identical output.
6. No import from outside `packages/core` and `packages/geometry`.
7. If it changes existing golden output, the diff is reviewed deliberately and the reason is
   recorded in the commit message.
