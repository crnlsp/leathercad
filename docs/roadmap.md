# Roadmap

**Status:** In progress — Phase 0 complete, Phase 1 (geometry core) under way
**Last updated:** 2026-09-03

---

## 1. Repository structure

```
leathercad/
├── CLAUDE.md
├── README.md
├── LICENSE                          Apache-2.0
├── package.json                     workspace root, scripts only
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.workspace.ts
├── eslint.config.js
├── .dependency-cruiser.cjs          layering rules — CI fails on violation
├── .github/workflows/ci.yml
│
├── .claude/
│   ├── settings.json                hooks, permissions
│   ├── commands/                    slash commands
│   └── skills/                      project skills
│
├── docs/
│   ├── product-spec.md   architecture.md   domain-model.md   geometry.md
│   ├── file-format.md    printing.md       testing.md        roadmap.md
│   ├── glossary.md       claude-code-setup.md
│   ├── print-verification-log.md    physical measurements, one entry per release
│   └── adr/                         0001-record-architecture-decisions.md, …
│
├── packages/
│   ├── core/            ids, Result, epsilons, assertions, quantise
│   ├── geometry/        PURE. vec2, mat2x3, segment/, path/, shapes, ops/
│   ├── domain/          part, features, derivation graph, stitching, validation, presets
│   ├── document/        Document, Command, DocumentStore, undo, selection, transactions
│   ├── persist/         .lcp container, zod schemas, migrations/, fixtures
│   ├── render/          DisplayList, styles, canvas2d/, svg/
│   ├── editor/          Viewport, tools/, snapping, hit-testing, guides, alignment
│   ├── export/          ExportScene, svg/, pdf/, dxf/
│   ├── print/           paginate, registration, calibration
│   ├── ui/              React panels, dialogs, canvas host, design tokens
│   └── cli/             `lcad` — used by slash commands and CI
│
├── apps/
│   └── desktop/         electron main, preload, renderer entry, electron-builder config
│
├── fixtures/
│   ├── projects/        sample .lcp files: cardholder, bifold, strap, calibration-target
│   ├── format/          v1.lcp, v2.lcp, … one per shipped format version
│   └── golden/          committed geometry outputs
│
├── e2e/                 Playwright specs
├── assets/fonts/        vendored fonts — required for deterministic output
└── tools/               bench baseline, visual-diff runner, release scripts
```

Conventions:

- **Tests are co-located**: `src/vec2.ts` beside `src/vec2.test.ts`. Integration and golden tests
  live in each package's `test/`. Co-location matters more than usual here, because it keeps the
  test in context whenever the implementation is being edited.
- **Every package has a single `src/index.ts`** as its public surface. Cross-package imports go
  through it, never into a package's internals.
- **`packages/geometry` and `packages/domain` have zero runtime dependencies** beyond `core` and
  (for geometry) the Clipper binding, which is isolated in one file.

## 2. Development workflow

### 2.1 The vertical slice

Every unit of work is a **vertical slice**: it touches whatever layers it needs, and it ends with
the application running, tests green, and something demonstrable. No slice leaves the app broken,
and no slice is "just the model layer, UI next week".

A slice is roughly 200–600 lines of production code. If a slice is bigger than that, it is two
slices.

Each slice is written down *before* it starts:

```markdown
## Slice 3.4 — Rectangle tool

**Goal:** Draw a rounded rectangle by dragging, or by typing exact dimensions.

**Acceptance criteria**
- Drag on empty canvas creates a rectangle; it appears as a cut contour on a new part
- Typing "105" Tab "75" Enter during the drag creates exactly 105 × 75 mm
- Shift constrains to a square
- Corner radius is editable in the property panel, per corner
- Escape mid-drag cancels and leaves the document unchanged
- Undo removes it in one step

**Out of scope:** editing an existing rectangle's vertices; non-uniform scaling.

**Tests:** tool state machine; command undo round trip; numeric parser;
         radius clamping when it exceeds half the shorter side.
```

Acceptance criteria are written as things a person could check by using the app. "Implement
RectangleTool" is not an acceptance criterion.

### 2.2 The loop

```
  read the slice        → docs/roadmap.md, restate acceptance criteria
        ↓
  plan                  → what changes, in which packages, in what order
        ↓
  tests first           → mandatory in geometry/domain; command-first in UI
        ↓
  implement
        ↓
  verify                → /geo-check, /arch-check, and run the app
        ↓
  document              → update the relevant docs/ file if an invariant changed
        ↓
  commit                → one slice, one commit, message names the slice
```

### 2.3 Working with Claude Code specifically

What works:

- **One slice per session.** Start with "read `docs/roadmap.md` slice 3.4 and the docs it
  references, then plan". Context stays focused and the plan is checkable before code exists.
- **Tests before implementation, stated explicitly.** Left implicit, geometry code arrives
  plausible and untested, and plausible-but-wrong is the failure mode that costs leather.
- **Reference the docs rather than re-explaining.** `CLAUDE.md` points at `docs/`; a prompt saying
  "follow `docs/geometry.md` §12" is shorter and more reliable than restating the rules.
- **Let the review skills run.** `/geo-check` and `/arch-check` catch the mechanical mistakes so
  human review can be about design.

What does not:

- "Build the pattern editor." Produces a large volume of confident, subtly wrong geometry.
- Accepting a new dependency without an ADR. Dependencies are architecture.
- Accepting geometry code with only example-based tests. The property tests are the point.
- Letting `CLAUDE.md` and `docs/` drift from the code. Once they are wrong, they are worse than
  absent, because they will be followed.

### 2.4 Branching and commits

One branch per slice, named `slice/3.4-rectangle-tool`. Merge when acceptance criteria pass and CI
is green. Commit messages name the slice and its user-visible effect, not the files touched.

```
git switch -c slice/3.4-rectangle-tool
... build the slice, commit ...
git push -u origin HEAD          # the hook runs pnpm check
gh pr create --fill              # three CI jobs run
gh pr merge --squash             # once they are green
```

A `pre-push` hook enforces this: it refuses a push to `main` and runs `pnpm check` on slice
branches. `pnpm install` installs it, by pointing `core.hooksPath` at `.githooks/`.

The enforcement is client-side and `--no-verify` defeats it. That is the available option, not the
preferred one: GitHub's branch protection and rulesets both require a public repository or a paid
plan, and this one is private on the free plan. Revisit at slice 8.6, which ships the contribution
guide and the v1.0.0 release.

## 3. Milestones

Five moments where the project becomes meaningfully more real. Everything else is scaffolding
between them.

| # | Milestone | Proves |
|---|---|---|
| **M1** | A 100 mm square, drawn from data, renders on a zoomable canvas with a mm ruler | The coordinate system and viewport are right |
| **M2** | Draw a rounded rectangle by hand with snapping, undo it, redo it | The interaction architecture holds |
| **M3** | Change a rectangle's width; its stitch line and 120 holes update live | **The core value of the product exists** |
| **M4** | Save, quit, reopen, and everything is exactly as it was | The format works |
| **M5** | Print a wallet pattern and measure 100.0 mm with a steel rule | **The product does the thing** |

M3 and M5 are the two that matter. M3 is the feature nobody else in the hobbyist price bracket does
well; M5 is the reason the application exists at all.

## 4. Phases and slices

Slice numbers are stable identifiers — `/slice 4.3` should always mean the same thing.

### Phase 0 — Foundations
*Nothing visible. Two or three sessions.*

- **0.1** ✅ **Done (2026-09-03).** Monorepo skeleton: pnpm workspaces, strict TS 5.9, Vitest 5,
  ESLint 10 with the pure-layer rules, Prettier, dependency-cruiser with the layering rules from
  [architecture.md](architecture.md) §2, CI workflow, and `packages/core` as a placeholder.
  `pnpm check` is green, and the layer rules were verified to actually reject a node-builtin import
  from `geometry`, a relative cross-package import, and a `geometry → document` edge.
- **0.2** ✅ **Done (2026-09-03).** Electron 44 shell with React 19: window opens, a DPR-aware
  canvas is mounted and resized via `ResizeObserver` plus a `matchMedia` DPR watch, and
  `PlatformHost` lives in a new `packages/platform` with its Electron implementation (atomic writes
  via `rename`) and `InMemoryPlatformHost` for tests. `contextIsolation`/`sandbox` on,
  `nodeIntegration` off, CSP set, navigation denied. Five Playwright specs drive the real app.
  `apps` is back in `depcruise`; `dev`, `build` and `test:e2e` are implemented.
  Notes for later: Electron 44 has no `postinstall` — it ships an `install-electron` bin, wired
  from `apps/desktop`'s own postinstall. `app.setPath('userData', …)` is required or config lands
  in `~/.config/@leathercad/desktop`.
- **0.3** ✅ **Done (2026-09-03).** ADRs 0001 (record decisions), 0002 (Electron over Tauri),
  0003 (TypeScript geometry core), 0004 (pnpm workspaces), 0005 (TypeScript 5.9 pin).

### Phase 1 — Geometry core
*Pure, headless, heavily tested. The foundation everything else stands on.*

- **1.1** ✅ **Done.** `core`: epsilons + `approxEq`/`approxLte`/`approxCmp`, `quantise` (0.1 µm
  grid, −0 normalised), `assertFinite`/`invariant`, `Result`, and a ULID factory with injectable
  clock and entropy. The real clock lives in `packages/platform` as `systemIdSource`, which keeps
  `core` free of `Date.now` so the lint ban stays absolute.
  Two things the property tests caught: with all-bits-set entropy the ULID random component
  overflows on the first increment (now rolls the timestamp forward instead of throwing), and an
  exact-epsilon boundary cannot be tested as `approxEq(1, 1 + EPS)` because `(1 + 1e-7) − 1` is not
  `1e-7` — measure from zero.
- **1.2** ✅ **Done.** `Vec2`, `Mat2x3`, `Rect` plus shared fast-check arbitraries in
  `packages/geometry/test/arbitraries.ts`. 93 tests. `compose(first, second)` takes its arguments
  in chronological order, not matrix order — the reverse is a reliable source of mirrored output.
  `isSimilarity` is the predicate that will decide whether an arc survives a transform as an arc
  (docs/geometry.md §4.2).
  A property test caught `intersects` and `intersection` disagreeing for rects separated by 5e-324:
  one was tolerant, the other exact. Both now share an epsilon, and a touching intersection
  collapses to a degenerate rect rather than inverting.
- **1.3** ✅ **Done.** `Segment` union: line, arc, cubic, with `pointAt`, `tangentAt`, `length`,
  `split`, `reverse`, `transform`, `toCubics` and **exact** `bbox`. 143 tests in geometry.
  Two departures from what this doc originally specified, both now reflected in
  [geometry.md](geometry.md): arcs carry a signed `sweepAngle` instead of `endAngle` + `ccw` (the
  pair cannot distinguish a zero-length arc from a full circle), and `toCubics` derives its
  subdivision from a tolerance rather than fixing it at a quarter turn — a quarter turn leaves
  0.027 mm of error at a 100 mm radius, five times the export budget, and PDF has no arc primitive
  so every exported arc takes that path. New `geometry/tolerance.ts` holds the measured error
  coefficient with a test guarding it against drift.
  `transform` returns `Segment[]` because a non-uniform scale turns an arc into an ellipse, which
  the union deliberately cannot represent.
- **1.4** ✅ **Done.** `Path` with the shared-endpoint invariant and a `validate` that reports the
  size of each gap, plus length, exact bbox, reverse, transform, signed area, orientation,
  winding number and `containsPoint`. Also `polynomial.ts` (linear/quadratic/cubic real roots),
  needed for exact ray casting and again for intersections in 1.10. 209 tests in geometry.
  Nothing here flattens: arc areas are closed-form and cubic areas use three-point
  Gauss-Legendre, which is *exact* for the degree-5 integrand rather than an approximation.
  `containsPoint` defaults to the non-zero fill rule, matching SVG and PDF, so screen, export and
  geometry cannot disagree.
  Three findings, all regression-tested: a ray cast through a full circle's seam fell into a crack
  in the half-open sweep window and reported the circle's own centre as outside (ray casting now
  detects grazing hits and re-casts with a nudged ray); `solveQuadratic` tested the discriminant
  against exactly zero, so near-tangencies produced two garbage-precision roots; and the
  float-equality lint rule was flagging `.length === 0`, burying real signal — it now excludes
  integer counts, verified against a probe file.
- **1.5** ✅ **Done.** Adaptive flattening: arcs by the sagitta bound, cubics by the Sederberg
  flatness test, with `flattenSegment`, `flattenPath` and `flattenToPolyline`. Determinism is
  asserted directly, since golden fixtures and byte-stable saves depend on it.
  Three genuine bugs surfaced while stabilising the property tests, all regression-tested:
  `solveCubic` used an **absolute** discriminant threshold, misclassifying small-coefficient
  cubics — and curve parameters live in [0, 1], so small coefficients are the norm; catastrophic
  cancellation in that discriminant made it invent a spurious root that Newton polished into
  something plausible, now rejected by a two-part certificate (relative residual, or a Newton step
  small against Cauchy's bound); and `cubic.ts` had **inlined** the textbook quadratic formula for
  its exact-bbox derivative roots, so for control points 0 → −2000 → −2000 → 0 the extremum at
  t = 0.5 was lost to cancellation and the bounding box collapsed from 1500 mm wide to nothing.
  Also: the residual-based property tests were replaced with ground-truth ones (build a polynomial
  from known roots, assert the solver returns exactly those). A residual bound cannot express
  accuracy at a root of zero or at a double root, and kept restating the solver's own tolerance.
  Test generators are now constrained to realistic coefficient magnitudes, and `vitest.setup.ts`
  pins the fast-check seed in CI so failures reproduce.
  A fourth bug surfaced only in CI, where the seed is fixed and 300 cases run: cubic `length` was
  pathologically slow. It halved the tolerance at every recursion level, so the flatness
  requirement tightened exponentially while the chord–polygon gap only shrank fourfold — a 2000 mm
  curve drove it to the depth cap and sixteen million nodes. Replaced with adaptive
  Gauss-Legendre, which subdivides only near cusps; the CI suite went from timing out to 3.5 s.
- **1.6** ✅ **Done.** `PathMeasure` with an exact cumulative arc-length table, `locate`,
  `pointAtDistance`, `tangentAtDistance` and `normalAtDistance`; plus `lengthBetween` on all three
  segment kinds (exact for lines and arcs, adaptive quadrature for cubics). Linear interpolation
  between table entries is refined by two Newton steps against the true speed, because
  first-order interpolation shows up as visibly uneven stitch spacing where the speed varies.
  Verified against an independent dense Simpson integration of |B'(t)|: points land at the true
  arc distance to within 1e-4 mm. The first attempt asserted that chords between arc-equidistant
  points are equal — they are not, they shorten wherever curvature rises, so that was the wrong
  property.
- **1.7** ✅ **Done.** `rect`, `roundedRect` with four independent radii, and `circle`.
  Radii are clamped proportionally so competing corners keep their ratio rather than being
  silently made symmetric, and a zero radius emits no arc so a square corner is genuinely square.
  Verified against the analytic perimeter and area.
  Completed later in the phase-closing pass: `line` and `polyline` as path constructors, `ellipse`,
  `arcThroughPoints` and `regularPolygon`, so the constructor list in [geometry.md](geometry.md)
  §4.6 is now real rather than aspirational.
  The ellipse is the affine image of a unit circle, converted to cubics at a tolerance divided by
  the larger radius and then transformed — an affine map takes cubics to cubics exactly. The usual
  fixed four Béziers carry 0.027 % radial error, which is 0.027 mm on a 100 mm ellipse: five times
  the export tolerance and visible on a cut line.
  `arcThroughPoints` falls back to a straight line for collinear points, where the circle has
  infinite radius, and throws for coincident ones, where there is no circle at all — two different
  degeneracies that deserve two different answers. fast-check found the boundary between them:
  given collinear points with the middle one *outside* the span, no path from `a` to `c` reaches it
  without doubling back, so the endpoints win and the middle point is dropped.
- **1.8** ✅ **Done.** `distributeAlongPath` in `geometry/ops/`, with both modes and the property
  set from [testing.md](testing.md) §3.2. Distances are computed as `start + k × pitch` from the
  index, never by repeated addition — the same drift lesson the tick generator in 2.5 records, and
  it matters more here, where a wallet has hundreds of holes.
  Two roundings needed deciding rather than discovering. A run shorter than half a pitch rounds to
  zero intervals under `fit-whole`, so `n` is clamped to one: a short run gets a hole at each end
  rather than none, and the division is always safe. fast-check found that boundary — a 3.85 mm run
  at a 7.7000000154 mm pitch — while disproving the half-interval property as stated; the property
  now carries the precondition and the shrunk case is a named regression test.
  `endOffsetMm` is rejected on a closed path rather than ignored, because a caller passing one has
  misunderstood the model and silence would let them keep doing so.
  The property generators are independent, so a 10 m path could pair with a 0.1 mm pitch: a hundred
  thousand points, built and compared a thousand times. That passed locally and timed out under
  coverage instrumentation in CI. The properties now bound their own work and a single example test
  covers the six-figure count, which took the suite from 53 s to 14 s. `pnpm check` runs
  `test:coverage` from this slice on, because running plain `test` locally is what let the
  divergence through.
- **1.9** ✅ **Done — analytic offsetting. Tier 2 moved to 9.11.** `offsetPath` offsets convex closed paths
  of lines and arcs exactly: a line to a parallel line, an arc to a concentric one. A rounded
  rectangle's stitch line is another rounded rectangle, not a polyline approximation of one, and
  there is no tolerance parameter because nothing is approximated. No dependency, so no ADR.
  **Tier 2 was attempted first, as planned, and abandoned.** `clipper2-js` is the only pure-JS
  Clipper2 binding — the WASM ones force an async init through the purest layer in the codebase —
  and its round joins are wrong: a 100 mm square offset by 10 mm returns an area of 12000 mm²
  against a true 14314 mm², below even a bevel join's 14200 mm², with `ArcTolerance` having no
  effect. Two hours of that is recorded here so nobody repeats it. The work sits unmerged on
  `slice/1.9-clipper-offset`, including a drafted ADR 0008.
  One trap worth keeping: `clipper2-js` needs the ring closed explicitly, the first vertex repeated,
  even under `EndType.Polygon`. Given an unclosed ring it does not fail — it offsets as though there
  were a spike at the last vertex and returns a self-intersecting ring whose *bounds look correct*
  and whose area is quietly wrong.
  **Tier 2 is now slice 9.11, and will be written here rather than bought.** Two bindings were
  investigated and both failed, for unrelated reasons; after that the decision is to stop shopping.
  Nothing before it needs it — Tier 1 offsets every convex outline of lines and arcs exactly, which
  is every shape the drawing tools produce that a leatherworker actually cuts. `clipper2-js` computes offsets wrongly across joins and shapes:
  with a correctly closed ring it returns a pinwheel that visits each source vertex between offset
  corners, so the area comes out under the truth every time — square/miter 12150 against 14400,
  square/round 12000 against 14314, hexagon/miter 8837 against 9841, hexagon/round 7995 against
  9809. Identical output from `ArcTolerance` default down to 0.005, so it is not a tolerance
  setting. `clipper2-wasm` is the faithful build, but the renderer's CSP is `script-src 'self'`
  with no `'wasm-unsafe-eval'`, so Chromium refuses to compile *any* WebAssembly there — a
  100-byte module fails exactly as a 220 KB one does. See ADR 0008.
- **1.10** ✅ **Done.** `intersectSegments`, `intersectPaths` and `selfIntersections`. Analytic for
  line/line, line/arc and arc/arc; anything with a cubic is located on the flattened polylines and
  polished by two-dimensional Newton on the true parametric forms, so the returned point sits on
  both curves rather than on their approximations — which is what makes the result usable for
  trimming and not only for detection.
  Collinear overlaps return the overlap endpoints, the only finite answer that loses nothing.
  On a path the integer part of each parameter is the segment index, so `2.5` is halfway along the
  third segment. `selfIntersections` skips neighbours, including the first and last of a closed
  path, since reporting a shared vertex would make every path self-intersecting.
  Three bugs the tests caught. Newton was fed `tangentAt`, which returns a **unit** tangent, where
  it needed the actual derivative — on a 20 mm line those differ by a factor of twenty, so every
  step overshot and no cubic intersection ever converged. The parallel test compared a cross
  product, an area, against a length epsilon: dividing by both lengths gives the sine of the angle,
  which is scale-invariant and stable under a rigid transform. And segments and paths de-duplicated
  differently, so the same geometry could report different crossing counts at the two levels.
  A boundary that cannot be fixed, only chosen: whether two segments 1e-9 radians apart are parallel
  is undecidable in doubles, and a rigid transform perturbs the last bit enough to change the
  answer. The transform property excludes pairs within a millionth of parallel and an example test
  pins what the epsilon decides, so changing it is a deliberate act.

### Phase 2 — Document and first working canvas
*Ends at M1.*

- **2.1** ✅ **Done.** `Document`, `Command`, `DocumentStore` with undo/redo, transactions and a
  selection model. History is snapshots with structural sharing, not hand-written inverses, so one
  property test covers every command that will ever exist — verified over all of them.
  Transactions collapse a drag into one undo step; without that, dragging a rectangle would need
  three hundred presses of undo. Untouched parts stay identical by reference, which is what makes
  the evaluation cache in `domain` sound.
- **2.2** ✅ **Done.** `Viewport` in `packages/editor`: mm ↔ px, zoom about the cursor, pan,
  DPR handling, fit-to-content, and `pickToleranceMm` for turning a pixel pick radius into a
  millimetre tolerance. A property test pins the one behaviour that matters — the millimetre point
  under the cursor stays under the cursor through any zoom.
- **2.3** ✅ **Done.** `packages/render`: `DisplayList`, layer-role styles, and the Canvas2D
  backend. Geometry is drawn in millimetre space with the world transform on the context, so the
  canvas rasterises arcs and Béziers natively; stroke widths and dashes are divided by the scale to
  stay screen-constant. Text is a second screen-space pass, or the Y flip would mirror it.
  The backend is typed against a small `Canvas2DLike` interface rather than
  `CanvasRenderingContext2D`, so it is driven by a recorder in tests — there is no canvas in Node,
  and a renderer checkable only by screenshot is one that mostly goes unchecked.
  One rAF loop with a dirty flag, rather than three stacked canvases; revisit if dragging with
  3000 holes needs it.
- **2.4** ✅ **Done → M1.** The app draws a real 105 × 75 mm card holder with 8 mm corners, its
  stitch line inset 3.5 mm, and 84 stitch holes placed by `PathMeasure` at a 3.85 mm iron pitch —
  all from `@leathercad/geometry`, nothing positioned in pixels. Scroll zooms about the cursor,
  drag pans, double-click fits. The status bar reports live perimeter, stitch length, hole count
  and achieved pitch, plus the cursor position in millimetres.
  The inward offset is analytic here (a rounded rectangle's inset is another rounded rectangle);
  the general case needs Clipper in slice 1.9.
- **2.5** ✅ **Done.** Adaptive grid and millimetre rulers off a shared 1/2/5 tick generator, so
  a gridline always lands on a number a person would measure to and major lines always fall on a
  power of ten. Ticks are generated by index rather than repeated addition, so error cannot
  accumulate across a long span.
  Two defects the screenshot caught that the tests did not: `renderDisplayList` was clearing the
  canvas and silently erasing the grid beneath it — clearing is now its own `clearCanvas` step —
  and the left ruler was too narrow for its labels, so "-160" was drawn off-canvas.
- **2.6** ✅ **Done.** SVG backend for the same `DisplayList`, which unlocks SVG-snapshot testing
  for everything after this point — deterministic, diffable in review, no image tooling. Closes
  Phase 2.
  It mirrors the Canvas2D backend deliberately, including the awkward parts: geometry is emitted in
  **millimetres** inside a group carrying the world transform, so arcs stay arc commands and a
  snapshot diff reads in the units the user typed; stroke widths and dashes are divided by the
  scale; and text is a second, screen-space pass, because the world transform flips Y and text
  drawn through it comes out mirrored.
  Coordinates are rounded to four decimals — 0.1 µm, finer than the storage grid. Without that the
  last bit of a float differs between platforms and every snapshot churns for no reason. Negative
  zero, which the flip produces freely, is normalised for the same reason.
  A full-turn arc is split in half: its endpoints coincide, and an SVG arc command between two
  identical points draws nothing at all.

### Phase 3 — Editing
*Ends at M2.*

- **3.1** ✅ **Done.** `Tool`, `ToolContext`, `ToolManager`. The context deliberately has no way to
  write to the document — tools dispatch commands and nothing else. Every tool carries an explicit
  state discriminant and returns to `idle` on Escape, and `onDeactivate` must leave no transaction
  open.
- **3.2** ✅ **Done.** Click, shift-click to toggle, rubber band (contained only), move by drag,
  Delete, Escape. Hit testing works entirely in millimetres, with the pick radius converted from
  pixels through the viewport, so picking feels identical at any zoom — asserted directly.
  A drag threshold stops a one-pixel wobble on a click from writing a spurious undo entry.
- **3.3** ✅ **Done.** Snap engine: endpoint, midpoint, centre, intersection, on-path and grid,
  with a per-kind overlay glyph so a user can see which one they are about to commit to — a corner
  and the edge running through it are a fraction of a millimetre apart on screen and very different
  in the file.
  Priority first, distance second. The order is a product decision, not an implementation detail: a
  user aiming at a corner means the corner, so an endpoint beats the edge through it however much
  closer the edge happens to be.
  Endpoints, midpoints, centres and crossings are a fixed point set per revision, so they are
  bucketed once into a 20 mm grid rather than rescanned on every pointer move; on-path and grid are
  continuous and computed on demand. A property test checks the index returns exactly what a
  brute-force scan does, since an index that changes the answer is worse than none.
  Tolerance arrives in millimetres — the caller converts its pixel radius through the viewport, the
  same rule `hitTest` follows, so the feel is identical at any zoom.
  Crossings are the first consumer of `intersectPaths` from 1.10. Excluding the dragged feature is
  not an optimisation: snapping a shape to its own corner would pin it in place.
  A fixture caught something worth keeping: two lines crossing at (10,10) also meet at *both* their
  midpoints, so the test asserting `intersection` legitimately got `midpoint`. The fixture moved;
  the priority order did not.
- **3.3b** ✅ **Done.** Wiring the snap engine to the tools, which 3.3 built and nothing used.
  `buildSnapIndex` had **zero callers outside its own tests** for four slices — the engine was
  complete, property-tested and dead, while M2 claimed the app snapped and it did not. Found while
  designing 4.7, because a fold line placed by eyeball is a pattern that gets cut wrong.
  Snapping happens in **`ToolManager`**, once, before any tool sees the event. A tool therefore
  cannot forget to snap and a tool written later inherits it without knowing it exists — the
  alternative, snapping in each tool, is four copies today and a missing one every time a tool is
  added. Tools that *move* geometry declare `snapExclusions`; the select tool returns its dragged
  selection, because a shape that catches its own corner cannot be moved at all.
  The index is rebuilt when the project **object** changes, reusing the identity-as-cache-key trick
  from 4.1 — structural sharing means a new object is exactly the case where geometry could have
  moved.
  **Ctrl suspends snapping**, for a point wanted near geometry rather than on it. Not Alt: Alt
  already pans, and one key meaning two things is how a modifier stops being learnable.
  Two things only running the app caught, both invisible to every assertion.
  **A hovering pointer asks for no repaint.** `handlePointerMove` invalidates only when panning and
  otherwise leaves it to the tool, and an idle tool has nothing to redraw — so the glyph was
  computed correctly and never painted. The manager now asks for a repaint when the caught snap
  *changes*, which is also the cheapest correct rule.
  **The glyph was the selection colour.** `#ffd166` against a selection drawn `#ffcc44`: the marker
  disappeared into the very outline it was pointing at, which is the one thing it exists not to do.
  Magenta is the only hue no layer role uses.
  And the **status readout showed the raw cursor**, not the snapped point — 61.50 while a click
  would commit 62.5. Not a rounding difference; the wrong number, in the place the user looks to
  check exactly this.
  **Grid snapping is deliberately off.** The grid on screen is adaptive to zoom
  (`niceTickStepMm`), so snapping to it would make the same drag land on 90 mm at one magnification
  and 90.0 at another — the one property a 1:1 tool cannot have. `settings.gridSpacingMm` exists but
  nothing draws it, and snapping to an invisible grid is worse than not snapping. Turning it on
  means reconciling those two first.
- **3.4** ✅ **Done → M2.** Drag to draw, shift constrains to a square, live millimetre
  dimensions in the overlay, Escape abandons. Creates a real `cut-contour` on a new part, not a
  generic path. Per-corner radii and exact numeric entry arrived with the property panel (3.8).
- **3.5** ✅ **Done.** Line and polyline tools. Click to place, Enter or a second click to finish,
  Backspace to drop the last point, Escape to abandon, Shift to constrain the segment to 15°.
  Clicking back on the first point closes the shape — but only from three points, since two enclose
  nothing.
  A line is a polyline that finishes itself, not a second implementation: two copies of the same
  rubber-banding would drift apart.
  What a drawn run *becomes* is a product decision, not a formality. A closed run is a `cut-contour`
  — an outline with an inside is something to cut out. An open one is a `marking-line`, because a
  line with two ends is not an outline, and calling it one would leave a part in the list that can
  never be cut. Drawn paths are the only geometry persisted as coordinates rather than parameters.
  This is also the first way to draw a concave outline, which analytic offsetting rejects: deriving
  a stitch line from one reports a validation error naming the shape until 9.11 lands. Drawing,
  measuring, saving and printing such a shape all work.
- **3.5a** ✅ **Done.** Tool palette and window chrome. Built before 3.6 rather than after 3.10,
  because the header already wrapped to two lines and Phase 3 still adds six tools — placing them
  into a cramped bar would only mean moving all of them again. Modes move to a grouped left rail
  (Select alone, then Draw; Modify and Measure appear as their slices land, since an empty heading
  is noise), history separates from the file actions in the header, and a strip above the canvas is
  reserved for the active tool's settings — rendering nothing until a tool has one. Three scopes,
  three homes: document in the header, mode in the rail, selection in the properties panel.
  See [the design](superpowers/specs/2026-09-04-tool-palette-design.md).
  Driving the app at 1024 px found two shrink failures the suite could not: a column wrapping the
  fixed-size canvas would not narrow, and the header's min-content width dragged every other row
  out with it. Both are now asserted.
- **3.6** ✅ **Done.** Circle tool. Drag out from the centre — a hole, a rivet and a strap end are
  all positioned by where their middle goes, and the record already stored a centre and a radius, so
  the gesture and the parameters agree. No Shift constraint: a circle is already uniform.
  The panel asks for a **diameter** and stores a radius, quantising after halving, because the
  diameter is the number stamped on a punch. `circle` was already a `ParametricShape` with a schema
  and an evaluator, so this slice touches no persistence at all — which is why it was split from the
  arc.
  Also the property-panel refactor: one editor per shape under `shapeEditors/`, dispatched by a
  single switch whose `never` check makes a shape without an editor a **compile error**. Verified by
  adding a throwaway variant and watching the build stop. `shapePart` now states the closed/open
  rule once for parametric shapes, mirroring `pathPart`.
  See [the design](superpowers/specs/2026-09-04-circle-and-arc-tools-design.md).
- **3.6b** ✅ **Done.** Arc tool: click start, click end, then bend it through a third point. Stored
  as parameters — centre, radius, start angle and **sweep** — so it can be retyped as exactly 40 mm
  and so 3.7 resizes it through [geometry.md](geometry.md) §4.2 rule 1 rather than converting it to
  cubics. Sweep rather than an end angle because an end angle alone does not say which way round the
  circle the arc went, which is the whole question a three-point gesture answers.
  No new geometry: `arcThroughPoints` already solves the circumcentre and returns a segment holding
  those four numbers, and it already owns what "degenerate" means — it throws on coincident points
  and returns a *straight* segment for collinear ones, so the tool declines anything that is not an
  arc rather than forming a second opinion about collinearity.
  An arc has two ends, so it is a `marking-line`, not a cut contour. Shift constrains each point to
  15°, sharing one `constrainToAngleStep` with the polyline so the key cannot come to mean two
  things.
  The format stays at **version 1**, with the variant added in place: nothing has shipped, so there
  was no compatibility to protect. That latitude ends at the first release — file-format §4.2 rule 1
  applies from then on. `fixtures/format/v1.lcp` is the corpus this creates, written by the current
  writer and holding one of every shape; regenerate with `UPDATE_FIXTURES=1`.
  Two gotchas worth not rediscovering. **`stableJson` rounds every number to six decimals**, which
  is sub-quantum for millimetres but is 3e-4 mm at a 300 mm radius for an *angle* — recorded in
  `lcp.test.ts`, and the reason the fixture uses a round number of radians. And **an overlay that
  throws stops the whole draw loop**: a zero-length rubber band the instant after the first click
  blanked the grid and rulers, which no assertion caught and one screenshot did.
- **3.7** ✅ **Done.** Rotate and scale, about the selection's own centre, and the rule that governs
  every parametric transform from here on:
  **a transformation that cannot preserve a shape's semantic representation must not silently demote
  it to another representation.** A circle under a non-uniform scale would become an ellipse, which
  the `Segment` union cannot hold — so it is refused, with the reason in the status bar, and the
  record is left exactly as it was. [geometry.md](geometry.md) §4.2 rule 1 said parametric shapes
  resize through their parameters; it did not say what happens when the parameters cannot express
  the result, and this is that answer.
  `transformShape` delegates the arc case to `SegmentOps.ArcOps.transform` rather than restating it,
  because §4.2 requires that decision to live in one place. Two things it already gets right and a
  reimplementation would not: the new start angle comes from applying the matrix to the *start
  direction* rather than extracting a rotation, so mirrors need no special case; and a mirror
  **negates the sweep**, since an arc that bent one way bends the other.
  **`rect` gained a `rotation`.** It was axis-aligned by construction, which made a turned rectangle
  as unrepresentable as a squashed arc — and turning a strap is not exotic. `domain-model.md` already
  gives `ellipse` and `polygon` a rotation and never gave one to `rect`, which read as an oversight.
  No geometry changed: the evaluator builds the axis-aligned rounded rectangle and turns it about its
  own centre, and because a rotation is a similarity the corner arcs stay arcs.
  The format stays at version 1 with `rotation` **defaulting to zero**, so `fixtures/format/v1.lcp` —
  written before the field existed — still opens. That fixture now earns its keep twice, as the
  baseline *and* as a real backward-compatibility test, so it must not be regenerated.
  **No Move mode.** The select tool already moves a selection by dragging it, and a second mode doing
  the same thing would teach the user that modes are not distinct — the opposite of what the palette
  exists to say. Reserved keys remaining: M, N, G.
  See [the design](superpowers/specs/2026-09-05-transforms-design.md).
- **3.12** "Convert to drawn path": the explicit, opt-in escape hatch for a shape the user *wants*
  flattened — a circle they need to squash into an ellipse, an arc they want to reshape freely. It
  must say plainly that the shape stops being editable as a circle or an arc, because that is the
  whole cost. Until it exists, 3.7 refuses those transforms rather than performing them quietly,
  which is the right default but not a complete answer.
- **3.7b** ✅ **Done.** Reflections through `transformShape`
  ([design](superpowers/specs/2026-09-16-reflections-design.md)). Reflecting a rectangle used to keep
  its origin and change its rotation, leaving it where it was with its rounded corners diagonally
  opposite — measured: a 10 × 5 panel mirrored across x = 0 landed at x ∈ [0, 10] instead of
  [−10, 0]. Everything is now computed from the rectangle's **centre** and its own two axes, which is
  what the parameters mean: `pathForShape` builds the box from `origin` and *then* turns it about its
  centre, so transforming `origin` alone moved the box somewhere the rotation swung away from.
  A mirror flips one of the rectangle's own axes to restore handedness, and the corner radii travel
  with it; the axis chosen is whichever leaves the panel closest to the way it was lying, so a
  flipped piece does not report a half turn. Adds a *Flip* command, mirroring the selection about its
  own centre. The prerequisite of mirror (4.8); see [ADR 0012](adr/0012-mirror-is-a-derivation.md).
  **Judged against transforming the evaluated path**, sampled as point sets — the comparison the 3.7
  round-trip test could not make, because a wrong mapping still inverts.
  A refused flip returns the document by identity, so it earns no undo entry, and the panel asks
  `flipRefusal` before offering the button at all — a disabled button with the reason in its title
  beats one that quietly does nothing (X1).
  Gotchas: a mirror **is** a similarity, so `transformTextSource` accepted one and would have turned
  a flipped label into a rotated one — refused now with `TEXT_WOULD_READ_BACKWARDS`; and taking the
  scale from the turned axis rather than the determinant left a 100 mm panel 99.99999999999999 mm
  wide, which an existing exact-equality test caught.
- **3.8** ✅ **Done.** Property panel with exact millimetre fields for position, size and all four
  corner radii, plus part name and quantity, and measured perimeter and area. Also a parts list for
  selecting what the canvas cannot reach. Entry commits on Enter or blur, reverts on Escape,
  steps with the arrow keys, and quantises to the storage grid before it reaches the document
  (CLAUDE.md invariant 8).
  One bug worth remembering: `commit()` ran **twice** for a single edit, because Enter committed
  and then blurred, and the blur handler committed again from the same render's closure where the
  draft state was still set. Two identical commands meant two history entries, so the first press
  of Undo appeared to do nothing. The draft is now mirrored in a ref so the second call sees it
  already consumed.
- **3.9** Vertex editing: add, remove, move, corner ↔ smooth.
- **3.10** Guides, alignment, and distribution.
- **3.11** Isolate a tool's overlay from the draw loop. `buildOverlay` runs inside the paint, so
  anything it throws stops the canvas painting entirely — grid, rulers and every feature, not just
  the offending preview. Slice 3.6b hit this: the instant after the arc tool's first click the
  cursor still sits on the point just placed, and a zero-length rubber band threw. Every assertion
  stayed green; one screenshot showed a blank grid. That tool now guards its own constructors, but
  the next one will have to remember to, which is the wrong place for the rule to live.
  Catch per tool, draw the rest of the frame, and surface the failure somewhere a developer sees it
  — a silently swallowed overlay error is its own trap. Worth a test that a deliberately throwing
  tool leaves the grid and rulers intact.

### Phase 4 — The leathercraft domain
*Ends at M3. The phase that makes this a leathercraft application rather than a drawing program.*

**The remaining work was reconciled as one design before any of it was built:** the
[Phase 4 reconciliation](superpowers/specs/2026-09-15-phase-4-reconciliation-design.md) and ADRs
0009–0013. Slice numbers stay stable identifiers, but the build order follows the dependencies
instead: **4.2b → 4.12a → 4.11a → 4.11b → 4.4b → 3.7b → 4.3 → 4.8 → 4.9 → 4.10 → 4.12**, then a
close-out that walks one scenario through the whole phase (4.13), and then the **UI/UX audit
checkpoint** below — which Phase 5 waits on.

- **4.1** ✅ **Done.** `Part`, `Feature` (cut contour, stitch line, fold line, marking line),
  `GeometrySource` (`path` and `shape`), layer roles, and `evaluate` producing a resolved document.
  Derived geometry is never persisted — the file holds parameters and evaluation recomputes, so an
  improved shape constructor improves every existing file.
  Memoised on **object identity**: immutable updates with structural sharing make an unchanged
  feature literally the same object between revisions, which is a perfect cache key with no hashing
  and no invalidation logic to get wrong. Errors are per feature, so one bad number does not blank
  the canvas.
  Still to come in 4.2: the derivation graph (`offset`, `mirror`), which is where the product value
  is and which needs Clipper (1.9).
- **4.2** ✅ **Done.** Derived features. `GeometrySource` gained one variant — `derived`, with one
  source id and one operation — and that is the whole structural change. The chain is two links deep
  and each node has a single source, so resolution is recursive and memoised rather than scheduled;
  a topological pass would be machinery without a job. Cycles are refused at command time, so the
  document is never in a cyclic state, and evaluation keeps a second guard that should now be
  unreachable.
  **Memoisation on object identity needed a second key.** Structural sharing makes an unchanged
  feature the same object, which is what makes identity a good cache key — and is exactly what
  breaks a *derived* one: widening a panel replaces the cut contour and leaves the stitch line
  following it untouched, so it served geometry for the old outline. An entry now records the source
  path it was built from. The unit tests missed this by building a fresh project each time, which
  never shares an object; the app caught it in a second.
  Deleting a source cascades to everything derived from it, in the same command, so one undo brings
  all of it back. An orphaned stitch line has no geometry and no meaning.
- **4.2b** ✅ **Done.** Reference graph and deletion. Derivations and references (measurement ends) as one acyclic
  graph, with the derivation compatibility table enforced by commands and by the loader. **Deleting
  something others depend on asks** — delete the chain, freeze, or cancel — rather than cascading or
  baking silently ([ADR 0009](adr/0009-explicit-resolution-when-deleting-a-source.md)). Any derived
  feature can be re-pointed (*Follows*); parts are removed only by deleting the part; every refusal
  is explained by a query that shares the command's check. **Supersedes the cascade recorded under
  4.2.** Design in
  [2026-09-15-reference-graph-and-deletion-design.md](superpowers/specs/2026-09-15-reference-graph-and-deletion-design.md).
  Four gotchas worth not rediscovering.
  **An undo label that names what it deletes cannot be fixed when the command is created**, because
  the command has not seen the document yet. `Command` gained an optional `labelFor(document)`, which
  the store reads from the document the command is about to change. Setting the label inside
  `apply` would also have worked, and would have been a side effect hiding in a pure function.
  **Freezing has to recompute what is still reachable afterwards.** The holes on a frozen stitch line
  are no longer dependents of the deleted outline, because the stitch line stops following it; taking
  dependents from the graph as it was would delete them.
  **`followRefusal` checks the whole project after the re-point**, not only the feature. Re-pointing
  one feature can break another downstream — a seam allowance needs its source closed — and a
  property test holds the query to "yes means the graph is still sound".
  **Two E2E tests assumed deleting a lone outline removed its part.** The part now stays, marked
  empty, until *Remove*. Format **version 4** (`frozenFrom`), with `fixtures/format/v4.lcp`; v3 is now
  an old file.
- **4.3a** ✅ **Done.** Cut-outs and the rules that give them meaning
  ([design](superpowers/specs/2026-09-16-cutouts-and-part-rules-design.md)). Drawing modes regrouped
  so each has **one fixed result** and selection only chooses the part (X4): *Outline* makes a new
  part and never reads the selection, while *Cut-out*, *Stitch*, *Fold* and *Marking* join the
  selected one. An open path in an enclosing mode is **refused with a reason** (S6) rather than
  quietly filed as a marking line, and a part refuses a second outline (S5) — both also refused by
  the loader.
  **"Inward" now means toward the material** (D6): a part's leather is inside its outline and outside
  every cut-out, so a stitch line round a thumb slot runs away from the hole instead of across the
  gap. **Defaults come from project settings** (D7): the panel no longer hard-codes 3.5 mm and
  3.85 mm.
  Four part rules land with the cut-outs that make them askable: `PART_HAS_NO_OUTER_CONTOUR`,
  `CUT_OUT_OUTSIDE_PART`, and `OUTSIDE_PART` and `HOLE_TOO_CLOSE_TO_EDGE`, the two deferred from
  4.12a because they need material-relative containment. One definition of "the material" serves the
  offset direction and every rule, so they cannot disagree about where the leather is.
  Gotchas: the old tool tests all drew open runs in what is now Outline mode, so they were saying
  "an open path becomes a marking line" — the rule §3.8 replaces; and `PathOps.distanceToPath` had to
  be exported from geometry, where `isPointOnPath` already computed it and threw the number away.
  **From review**, seven things the acceptance criteria passed without: the held refusal moved out of
  the polyline tool into a `DrawCommit` boundary every draw tool commits through, because the arc
  tool did not have it and an arc in Outline mode vanished saying nothing (X1); `PART_HAS_NO_OUTER_CONTOUR`
  now reads the part's parameters rather than its evaluated material, because an outline that failed
  to build was reported as no outline at all and the advice — draw one — is advice S5 refuses;
  containment samples an open path's far end, where a 1 mm overshoot used to hide while a 5 mm one
  did not; the hole rules carry the offending hole positions, so "a hole is 0.8 mm from an edge" no
  longer highlights eleven metres of stitch line; a refused open run keeps its points so it can be
  closed rather than redrawn (**X10**, new); *Inset* became **Edge margin** throughout, which is the
  one name that reads correctly round a cut-out, where the line runs outward; and the D6 direction's
  dependence on the immediately-followed feature is written down in `domain-model.md` §4.4 as 4.9's
  problem to solve. Making the arc's refusal audible then showed it giving advice nobody can take —
  "close the shape", to an arc — so `CONTOUR_NOT_CLOSED` carries whether closing is a correction that
  exists.
  **Measured, not budgeted:** `diagnose` — evaluation *and* validation, which is what the panel
  waits for — costs ~13 ms on a 3 000-hole strap, ~24 ms with twenty slots, and ~70 ms on a
  500-point traced outline, of which ~42 ms is validation. The material rules are O(holes × edge
  segments). `product-spec.md` §7 budgets chain regeneration at 50 ms and the traced case exceeds it;
  `perf.test.ts` records the baseline with loose ceilings rather than pretending otherwise. Whether
  to spend a bounding-box rejection or a clearance band on it is **4.3b or later**, once the parts
  panel shows what real documents look like.
- **4.3b** ✅ **Done.** The parts panel, and a lock that means it
  ([design](superpowers/specs/2026-09-17-parts-panel-design.md)). **Part selection** beside feature
  selection: clicking a part's heading makes it the target for the next cut-out or fold line, which
  is how you name a part after reopening a file without first picking something inside it. The panel
  is a **dependency tree** — *Outline ▸ Stitch line ▸ Holes* — so the reference graph is visible and
  the delete dialog stops being a surprise. **Duplicate part** re-points the derivations inside the
  copy, so the copy's stitch line follows the copy's outline; derivations reaching into other parts
  keep pointing there. **Visibility** per feature and per part, and **delete part** through the
  existing plan and dialog.
  **The lock now means it** (S7, D8). `locked` was a *pick lock*: hit-testing and snapping skipped a
  locked feature and every command still edited and deleted it — worse than no lock, because it took
  the feature off the canvas and nothing could give it back. Commands refuse it now, the refusal
  names the feature, and the panel is the way to unlock it. Enforced by refusing inside `mapFeature`
  **by default**, with an explicit `evenIfLocked` on the two commands allowed to touch one, rather
  than a check each command must remember. Visibility is deliberately outside the lock: you pin the
  outline down so you cannot nudge it, and still want to hide it to see underneath.
  Gotchas: **a duplicate of a locked part landed exactly on top of its original** — the copy
  inherited the lock and the placement step was then refused by it, which looks precisely like the
  button doing nothing; copies are built unlocked and re-locked once placed. The **delete dialog
  opened for locked features** and the command then refused, asking a question about something that
  was never going to happen — both delete paths and the button now ask `lockRefusal` first, and
  `flipRefusal` gained the lock for the same reason. A locked feature's parameter fields are
  disabled by a `fieldset`, so a later editor inherits the guard instead of having to ask. And
  `mapFeature` used to rebuild the project even when the id did not exist, so a no-op command pushed
  an undo entry with nothing behind it.
  **No `Part.visible` field**, so no format version 5: a part is hidden when every feature in it is.
  The cost is that hiding a whole part and showing it again forgets which single features were
  hidden — cheaper than a migration for a view convenience, and one migration away if it matters.
  **Known, not fixed here — and deliberately not attached to Duplicate.** A duplicate is placed clear
  of the original and can therefore land outside the viewport, so the copy is invisible until you
  double-click to frame the drawing. Duplicate is only where this first shows; the question is
  general — **when, if ever, should a command move the view?** Every command that creates or
  transforms geometry has it: duplicate, mirror (4.8), seam allowance (4.9), paste, and any future
  command that places something away from where the user is looking. Answering it per command as it
  comes up is how an editor ends up with a viewport that jumps unpredictably, so it wants one
  deliberate interaction design covering the lot — and the plumbing to match, since framing the
  selection needs the viewport lifted out of `CanvasHost`. Recorded in the reconciliation §10, so it
  is not attached to whichever slice next trips over it.
- **4.4** ✅ **Done.** Derived `StitchLine` — inset inward, live-linked, editable in the panel. Also
  **partial runs**, which the design added after walking the real cases: a pocket is stitched on
  three sides and open at the top, so a stitch line that could only be a closed loop could not
  express the most common seam in leatherwork.
  A run names **anchors**, not segment indices. `roundedRect` emits eight segments with 8 mm corners
  and four with none, so an index-based run would silently move to different edges the first time
  someone changed a radius — and silent wrongness on a pattern about to be cut is the worst failure
  this can produce. A rectangle has four corners whatever its radii.
- **4.5** ✅ **Done → M3.** `StitchHoleSet` — pitch, iron presets, `fit-whole` and `exact-pitch`,
  batched rendering, and the count and achieved-spacing report. Holes carry **no ids**: identity
  would create an obligation to preserve it across regeneration, which happens whenever the count
  changes, and there is no correct answer to which of the old 84 is this one of the new 86. They are
  addressed positionally, and suppression — when it comes — belongs on the set as a list of
  ordinals, because a parameter survives regeneration by definition.
  The **pitch value** is persisted rather than a preset id, so a file opens identically on a machine
  that has never heard of the author's irons.
  Gotcha worth keeping: the achieved spacing is the perimeter over the count, not the sum of each
  run's own intervals. Counting per run misses the gap that spans each corner and reads about 3%
  high — 3.96 mm where the ring is 3.83.
- **4.6** ✅ **Done.** Corner policy `hole-at-corner`: split at corners, distribute per run, per-run
  reporting. The shared hole where two runs meet is emitted once — a doubled corner hole is
  invisible until someone punches it, and a property test over 200 shapes asserts no two holes come
  closer than half the pitch.
- **4.7** ✅ **Done.** Fold lines, marking lines, hardware holes — the features that make a pattern
  something you *assemble* rather than only cut. Design in
  [2026-09-05-fold-mark-hardware-design.md](superpowers/specs/2026-09-05-fold-mark-hardware-design.md).
  **Depended on 3.3b**, which was written first: these three features *are* their position, and a
  drawn path has no numeric editor until 3.9, so without snapping every one of them would have been
  placed by eye and been uncorrectable.
  **A hardware hole carries its geometry as a `circle` shape in `source`**, not as the `centre` and
  `diameterMm` fields `domain-model.md` §3.6 sketched before `GeometrySource` existed. Those fields
  would have made it the only feature whose position is not in `source`, so every transform,
  hit-test and the 4.8 mirror would need a case for it; as a circle it inherits all of them and
  `CircleEditor` already edits it. §3.6 was corrected in the same commit.
  **The kind is a tool setting, not a tool.** A fold line can be drawn as a line, an arc or a
  polyline — kind is orthogonal to primitive, so one "Draw as" selector serves five tools where a
  tool per combination would be fifteen buttons for three ideas. Hardware is its own tool because it
  is the only one *placed* at a chosen size rather than drawn.
  **A fold or marking line joins the selected part, or is refused** with the reason in the status
  bar. Not guessed at by containment: a fold line silently attached to the wrong panel is invisible
  until the leather is cut.
  Two gotchas. **Halve before quantising** — the stored number is the radius, so quantising the
  typed diameter first puts it on a 5e-5 grid whenever the last digit is odd. And **the parts list
  is where mountain and valley are told apart**: `ROLE_STROKES` is keyed by layer role so both draw
  dash-dot green, and per-feature styling for one flag is not worth it — the default *name* carries
  it instead ("Fold (valley)", "Glue area", "Rivet 4 mm").
  Format **version 3**, with an identity `v2_to_v3` and `fixtures/format/v3.lcp`. v1 and v2 are now
  both old files and neither is ever regenerated.
  One interaction found by CI and not by the machine it was written on: **the status bar used to
  show a notice *instead of* the part and feature counts.** Harmless while every notice was a
  momentary refusal, but 4.7 brought the first one that *persists* — it stands for as long as fold
  mode is on with nothing selected, which is exactly what `Tool.notice` is specified to do — so
  "0 parts" vanished at the moment it was the point. The counts now stay and the notice sits beside
  them. The E2E test that caught it had asserted both, and passed locally only by winning the race
  before React had the notice.
  **Fold thickness is blank when not set**, not `0`: 0 mm reads as a claim that the leather has no
  thickness. `NumberField` gained an opt-in `onClear` for it — without one an empty draft still
  reverts as a typo, so no other field changed.
  Rows of holes — a belt's adjustment holes — are deliberately **not** here: a row is a set
  distributed along a path at a pitch, which is what `StitchHoleSet` already is, and building it as
  repeated single holes would be the wrong shape to fix later.
- **4.4b** ✅ **Done.** Anchors carried through derivations
  ([ADR 0010](adr/0010-anchors-address-geometry.md),
  [design](superpowers/specs/2026-09-16-anchors-through-derivations-design.md)). `offsetPathTraced`
  reports where every input segment and corner ended up, and the domain maps the source's anchors
  through that trace rather than looking for them again in the result — the search ADR 0010 rejects,
  because it lands on the wrong corner exactly when one disappears.
  Anchors now live on the **resolved** feature, as distances along its own path, so a stitch line
  knows which of its corners came from which corner of the outline, and a hole set exposes the line's
  unchanged. `runOf` reads them instead of asking about parameters, which is what makes a run on
  derived geometry work at all.
  **A missing anchor keeps its index** and comes back as `null`: dropping it would renumber the rest,
  which is a run silently moving to a different edge.
  Gotchas: a corner arc the offset swallows is a sharp corner, not a lost anchor, so its image is the
  join its neighbours meet at; the end of an **open** run has no corner after it, so its anchor maps
  to where the run now ends rather than to nothing — a test caught that as a null; and a `null`
  anchor cannot be *named* by anything yet, because only an inward offset takes a run, so that path
  waits for measurements in 4.10 rather than being faked.
- **4.8a** ✅ **Done.** Mirror, the operation
  ([design](superpowers/specs/2026-09-17-mirror-design.md), [ADR 0012](adr/0012-mirror-is-a-derivation.md)).
  A **counterpart that stays matched**: same kind, same role, geometry entirely its original's.
  *Mirror ↔* and *Mirror ↕* fold it across the edge of what is selected, and the counterpart joins
  the same part — a pair of card slots belongs to the panel they are cut in.
  **A counterpart owns its placement and nothing else.** Drag it and it moves; turn it and it turns;
  it stays linked throughout. Dragging it **with** its original moves the pair rigidly, which is the
  case that would be wrong if the counterpart merely re-parameterised. Scaling it is refused — a
  counterpart is the size of its original — and so is reshaping it. Since a glide reflection composed
  with any isometry is another glide reflection, a scale is the *only* thing that can fail: there is
  no "cannot express that" state to design around.
  **The axis is absolute and never tracks the source**, so moving the original moves the counterpart
  the opposite way. That is what makes a pair predictable, and the panel says it rather than letting
  it be discovered.
  Gotchas worth not rediscovering: the loader refused a mirrored outline until **S6 learned that a
  reflection preserves closedness** — `declaresClosed` knew only about offsets; **winding reverses**
  and that is safe only because `applyDerivation` reads the actual signed area rather than assuming
  a direction, which a property test now pins; `setShape` on a **derived** feature silently converted
  it into drawn geometry (an X3 violation, pre-existing, now refused); `transformFeatures` and
  `mapFeature` rebuilt the project even when nothing changed, pushing undo entries with nothing
  behind them; and the writer rounds every number to six decimals, **angles included**, so the format
  fixture uses an axis whose numbers survive it and a separate test pins what the rounding does.
  **Format version 6**, so a build predating mirror refuses a file holding one rather than dropping
  the counterpart.
  **Known, not fixed here:** *Mirror ↔* takes the axis from the selection's **world-aligned** bounding
  box, which is predictable but one-shot — widen the original afterwards and it crosses its own
  mirror line, overlapping its counterpart. That is correct by the fixed-axis rule and visible on the
  canvas, and the real answer for a symmetric panel is mirroring across a **fold line**, whose axis is
  a thing in the drawing rather than a measurement of it. Slice 4.8b.
- **4.8b** ✅ **Done.** Mirror across a fold
  ([design](superpowers/specs/2026-09-18-mirror-across-fold-design.md)). **Symmetry a maker keeps
  working with**: a counterpart folded about a `fold-line` **references** that fold, so moving the
  fold re-mirrors everything folded about it. 4.8a's captured axis is a placement; this is a
  relationship — a wallet's card slots stay each other's mirror while the wallet's width is still
  being decided.
  **The first two-input derivation**, and the first *references* edge: a *derives* edge to the source
  and a *references* edge to the fold, both now walked by S2 (every edge resolves) and S3 (acyclic
  across **both**). `dependentsOf` follows them too, so deleting a fold shows the counterparts that
  depend on it. Not a constraint system: one derivation reads one line at evaluation, nothing is
  bidirectional.
  **The fold is named, never inferred** — no nearest-fold heuristic, because a mirror about the wrong
  crease is not visibly wrong until the leather is cut. A **bent fold is refused** rather than having
  one of its segments picked. **Dragging a fold-tracked counterpart is refused**, naming the fold and
  the source: the general rule's first instance, that dragging a derived linked result must not
  silently break or half-alter the relationship. Deleting the fold offers to **freeze the axis**,
  capturing the line the fold was on — the deliberate way out, and no new interaction concept.
  **The symmetric outline is deliberately out of scope.** A piece of leather has one edge (S5), and
  completing a contour from half of one needs a boolean union ADR 0008 declined. Refused before the
  gesture with a message naming both real alternatives. Fold symmetry is for what is *inside* a
  piece.
  **Format version 7, and the first migration that rewrites data** rather than passing it through:
  `v6_to_v7` adds `kind: 'line'` to every stored mirror axis. A chain of identities satisfies the
  framework without proving it can carry a real change; this one does. The v7 fixture holds both arms
  of the axis union.
  Gotchas: `dependent.direct` only knows the *derives* edge, so the freeze had to be decided **before**
  that guard — a counterpart is a direct dependent of its fold through the reference and its
  `sourceId` does not say so; the evaluation cache keys on the source path, so it gained the fold's
  path too or moving the fold changed nothing; `wouldLoop` walked a chain and had to become a graph
  walk once a feature could point at two things; and three buttons do not fit the property panel, so
  *Mirror across fold* has its own row — a properties panel that scrolls sideways is a broken one.
  **Noticed, not fixed:** a fold drawn exactly onto the outline trips DR2's sampled containment and
  is reported as running off the material. A boundary case of the 4.3a rule, not this slice's.
- **4.9** ✅ **Done.** Seam allowance — dimensioning the opening, not the edge
  ([design](superpowers/specs/2026-09-18-seam-allowance-design.md)). The other direction of one
  relationship (§3.4): a pocket that has to take a card is specified by its **opening**, and the cut
  edge is whatever leaves the allowance outside the seam. *Stitch + allowance* is the sixth drawing
  mode — a new part whose drawn stitch line is the root and whose outer contour is derived outward
  from it, in one undo step, never reading the selection (X4). **Add seam allowance** does the same
  from a stitch line drawn earlier, which is the commoner order, using the identical derivation
  rather than a second model.
  **Linked, not baked**: the edge is an ordinary derived feature, so retyping the opening's width or
  the margin moves it, and the file stores the relationship rather than one coordinate of the result.
  One number serves both directions — `settings.defaultStitchInsetMm`, which the panel calls *Edge
  margin* (X8).
  **The design was mostly a check, and that is the point.** Probing first showed the outward offset,
  the compatibility row, `declaresClosed` and the anchor mapping already worked; 4.9 connects and
  exposes them rather than inventing work. Corners are **round at the allowance's radius** — what a
  wing divider traces, and what a maker would cut anyway, so a rectangular opening gives a
  rounded-rectangle edge on purpose. An allowance too large for its own shape reports
  `OFFSET_COLLAPSED` rather than guessing; Tier 2 geometry stays slice 9.11.
  **D6's limitation was checked and not hit**: the ambiguous case is an allowance grown from
  stitching round a cut-out, which `allowance-needs-outer` already forbids, so `towardsMaterial`
  stays as it is rather than being generalised speculatively.
- **4.10a** ✅ **Done.** Measurements, linear
  ([design](superpowers/specs/2026-09-18-measurements-design.md)). A dimension between two **anchors**
  — horizontal, vertical or aligned — whose number is read from the model on every evaluation and
  never stored (X6). That is the whole feature: a dimension cannot drift from the geometry the way a
  label typed once does.
  **The second and larger user of the `references` edge**, and the first source naming **two**
  features. Its refs live in a `GeometrySource` rather than the field being made optional: a
  measurement's geometry genuinely comes from its references, every feature having a source is an
  assumption the domain rests on, and the alternative was 70-odd call sites. `domain-model.md`'s older
  "features without a geometry source" wording is corrected in the same commit rather than left
  contradicting the code.
  The graph work was almost all free from 4.8b — `edgesFrom`, S2, S3 and `dependentsOf` needed the two
  refs and nothing else. The one thing generalised properly rather than bolted on: the evaluation
  cache's single `foldFrom` slot became a **reference list**, since 4.8b needed one and this needs two.
  **Never freezable**: deleting what a dimension measures offers no "keep it", because a frozen
  dimension is a number that no longer means anything.
  **Anchor picking is deliberately not in the shared snap index.** `SnapOptions` treats absent kinds as
  enabled and the priority list would put a corner above a segment end, so adding an `anchor` kind
  would change what *every* tool snaps to. The measure tool resolves its own reference instead; making
  corners a global snap target is a decision to take on its own merits.
  Gotchas: `buildDisplayList` drew text and then `continue`d — right for a label, whose path is its
  text box, and wrong for a dimension, which needs both, so the number appeared with no line under it;
  and the measure tool did its own pixels-to-millimetres arithmetic instead of using the viewport's
  `pickToleranceMm`, which accounts for device pixel ratio.
  **Deferred deliberately:** `radial` and the `centre` references it needs; `extent` references, the
  least durable kind because they follow evaluated bounds rather than a place; angular; chained and
  baseline dimensions; dimensions between parts.
  **Known, and not hidden:** an anchor on a **drawn path** survives move, rotate and scale but not
  vertex editing, which renumbers corners. That is ADR 0010 point 5's open item — a property of
  anchors, not of measurements — and slice 3.9 clears it.
- **4.11a** ✅ **Done.** Typography ([ADR 0011](adr/0011-one-vendored-typeface-outlined-on-paper.md),
  [design](superpowers/specs/2026-09-16-typography-design.md)): IBM Plex Sans vendored in
  `assets/fonts/` with its OFL licence, a pure `packages/typography` laying text out once in
  millimetres, the font on screen and outlines on paper. Helvetica left the PDF writer and **no
  font is embedded in any export**, which **fixes export failing on Polish names** — pdf-lib's
  standard fonts cannot encode `ł` or `ę`. Part captions on the canvas, in the same words and size
  the printed sheet uses.
  **Document text and overlay text are different item kinds**, sized in millimetres and pixels
  respectively, so an exporter cannot be handed a screen readout by accident.
  **Nothing parses a font at run time**: `pnpm fonts:generate` extracts 331 glyphs and 12 910
  kerning pairs at development time and the data is committed.
  Gotchas: `MatOps.compose` is chronological, so a glyph is scaled *then* translated — the other
  order scales the position too, which a placement test caught; `⌀` is not in the typeface, so a
  diameter is written `Ø`; pdf-lib gives every page an empty `/Font` dictionary of its own accord,
  so "no font embedded" means "nothing ever put in it"; and `Ł` legitimately overhangs its advance
  width, which a too-strict property test found and now pins as a fact.
- **4.11b** ✅ **Done.** Free text labels
  ([design](superpowers/specs/2026-09-16-text-labels-design.md)): the **Text** tool places one on the
  selected part, the panel types it and sizes it in millimetres, and it prints as outlines with
  everything else.
  **The words live in the source**, not on the feature — the decision §3.6 already recorded for
  hardware holes, and the reason a label moves, turns and scales through the existing transform
  paths without any of them learning what a label is. An uneven scale is refused
  (`TEXT_WOULD_DISTORT`): letters do not stretch.
  **Format version 5**, with an identity migration and `fixtures/format/v5.lcp` holding a Polish
  label — what is stored is the words, the place and the size, never the glyph outlines.
  Rotation went into `packages/typography` rather than the domain, because 4.10's aligned dimensions
  need exactly the same thing.
  Gotchas: narrowing `TextLabel['source']` makes every `{ ...feature, source }` spread a compile
  error until it says which features it means — which is the point, and it found each site; and a
  label's `path` is the box its words occupy, so the panel hides "Measured" for one, a perimeter
  nobody asked for being worse than no number.
- **4.12a** ✅ **Done.** The diagnostic channel
  ([ADR 0013](adr/0013-invariants-are-enforced-rules-are-reported.md),
  [design](superpowers/specs/2026-09-15-diagnostic-channel-design.md)): typed evaluation failures,
  `validate()` with the stitch and outline rules, `diagnose()` as the one list, a problems panel,
  and failed features marked on the canvas instead of vanishing.
  **One model, four layers** — identity (`problems/codes.ts`), information (`problems/problem.ts`),
  presentation (`problems/messages.ts`), surfaces. A problem carries **facts, never a sentence**, so
  the seven separate string channels this replaced — two refusal queries, `graphProblems`,
  `transformShape`, `refusedTransforms`, the draw-target notice, evaluation errors and
  `spacingWarning` — cannot come back one at a time. A depcruise rule allows only `problems/index.ts`
  to import the message catalogue, which is what stops a domain module writing English again.
  **Tests assert codes and facts, not wording**, with the pre-existing sentences pinned in one
  catalogue test — so the words on screen are unchanged and provably so.
  **`OFFSET_SPLIT` is unreachable today** and the slice says so rather than pretending: Tier 1
  `offsetPath` returns no piece or exactly one, so the keep-largest step is unit-tested on synthetic
  pieces and E2 holds the day Tier 2 arrives.
  Gotchas: the lint rule against float equality also catches integer counts, so counts compare with
  inequalities; `evaluate` builds a fresh `ResolvedProject` each call, so `diagnose` memoises on the
  **project**, not the resolved tree; and a tool builds a fresh problem every pointer move, so the
  canvas keeps the old one when `sameProblem` says it reads the same, or the chrome re-renders at
  60 fps.
- **4.12** Validation complete: zoom-to-problem, part and feature badges, a warning at export, and an
  audit test that every rule names a documented invariant and every structural invariant has both a
  refusal test and a loader test. The catalogue is `domain-model.md` §8.
- **4.13 Close-out.** One end-to-end scenario walked through the whole phase, a roadmap summary, and
  a final pass over the docs the phase changed.

### Checkpoint — the UI/UX audit
*Between M3 and Phase 5. A gate, not a phase.*

**Phase 5 does not begin when the last 4.X slice merges.** It begins when the application has been
looked at as one thing.

Phase 4 was built as a dozen vertical slices, each reviewed on its own terms and each leaving the app
working. That is the right way to build it and it has a known failure mode: twelve individually sound
features that together feel like twelve features rather than one tool. Several findings already point
that way — the canvas jumping when the tool changes, a property panel that outgrew its width, three
different words for a relationship between features. None was worth interrupting a slice for; all of
them are worth an afternoon together.

**Entry condition:** every planned 4.X slice merged, `main` green — `pnpm check` and `pnpm test:e2e`.

**What it is:** a review and polish pass over the whole application, walked as a leatherworker would:

> create or open a project → draw and edit geometry → organise parts and features → use derived
> features → measure → read validation → export

looking at interaction consistency between tools; selection, dragging, deletion, Escape and keyboard
behaviour; snapping and pointer feel; tool-mode clarity; the property panel's layout, overflow and
hierarchy; the parts tree; **how clearly source, derived, referenced and linked objects are told
apart**; hover, selected, active, disabled, warning and error states; the validation surfaces —
badges, diagnostics, selection, zoom-to-problem; measurement presentation and editing; discoverability
of the actions that matter; ambiguous terminology; clicks that earn nothing; layout shifts; and the
consistency of spacing, controls and labels.

The question it answers is the one no slice could: **does this feel like a leather-pattern tool, or a
collection of independently implemented features?**

**What it is not:** a feature phase. Nothing new is designed here.

**The constraint that keeps it finite.** Every finding is triaged into exactly one of three, and the
triage is part of the deliverable:

| | | When |
|---|---|---|
| 1 | **Bug or inconsistency** | Fixed before Phase 5 |
| 2 | **UX improvement, low architectural impact** | Likely fixed before Phase 5 |
| 3 | **Larger interaction or design work** | Recorded for a later phase, **not** done here |

Category 3 is what stops an audit becoming a redesign. A finding that needs a new interaction model
is a finding, not a task.

**Two rules of method**, learned from the slices:

- **Validate against the running application and the existing E2E coverage**, not against reading the
  code. The dimension drawn with no line under it, the pick tolerance that ignored device pixel ratio,
  and the canvas jump were all found by looking; none would have been found by inspection.
- **Fix systemic patterns once.** If three panels overflow, the finding is about how panels are sized,
  not about three panels.

**Deliverable**, before any 5.X work:

1. a concise audit document;
2. findings prioritised by severity and impact, each triaged 1/2/3;
3. concrete recommendations;
4. the list to implement before 5.X;
5. a separate list of larger post-1.0 UX ideas.

The audit is presented for review and **Phase 5 does not start until it is resolved.** The goal is a
coherent interaction baseline before the next architectural phase — not cosmetic perfection.

### Phase 5 — Persistence
*Ends at M4.*

- **5.1** ✅ **Done.** `.lcp` ZIP container (uncompressed `mimetype` first, so `file(1)` identifies
  it), zod schemas, save and open wired through `PlatformHost`, atomic write via `rename` in the
  main process. Stores parameters only — a saved rectangle is `width: 105`, not a list of segments.
  Byte-identical across saves of an unchanged document: keys are sorted, numbers bounded to six
  decimals, and archive entry timestamps pinned to the ZIP epoch. The real save time lives in the
  manifest, where it is readable, and comes from an injected clock.
  Load errors name the field — `parts[0].features[0].source.width: expected number` — because a
  user's project is hours of their work and "invalid file" tells them to give up.
- **5.2** 🟡 **Partly done.** `formatVersion` 1, the migration runner, and the round-trip plus
  byte-stability tests are in. A file from a newer version is refused rather than guessed at.
  Still to add before this counts as **M4**: the committed `fixtures/format/v1.lcp` corpus, and
  unknown-field preservation so a file touched by a newer build is not quietly damaged by an older
  one.
- **5.3** Autosave, crash recovery, recent files, unsaved-changes handling.
- **5.4** Sample projects shipped in `fixtures/projects/`.

### Phase 6 — Export

- **6.1** ✅ **Done.** `ExportScene`: styled geometry in millimetres, all black and distinguished
  by line style. Widths are **true millimetres** here, unlike on screen where they are constant in
  pixels — a cut line printed at 0.25 mm is 0.25 mm on the page. Black because a mono printer
  renders blue and green as indistinguishable greys, and a template exists to be photocopied.
- **6.2** SVG writer: mm units, layer groups, the single Y-flip, with the accuracy tests from
  [printing.md](printing.md) §14.
- **6.3** ✅ **Done.** PDF writer on `pdf-lib`, using raw content-stream operators rather than its
  SVG helper, which assumes a Y flip we do not want — PDF is Y-up like the model, so this is the
  one output path with no axis flip at all.
  Verified by **rasterising with poppler and measuring pixels**, which is stronger than parsing our
  own numbers back: it renders through an independent implementation and measures what a printer
  would be sent. At 254 dpi (10 px/mm) the 50 mm square measures 50.10 × 50.00 mm and the 100 mm
  ruler 100.10 mm, the excess being the 0.2 mm stroke measured outer edge to outer edge.
  Arcs go through the tolerance-driven `toCubics` from slice 1.3, since PDF has no arc primitive —
  the path that made that subdivision tolerance-driven in the first place.
- **6.4** Export dialog: preset, layers, paper, bounds.

### Phase 7 — Printing
*Ends at M5. The payoff.*

- **7.1** 🟡 **Partly done — as part packing, not tiling.** At the user's direction, overflow moves
  whole parts to the next A4 sheet rather than splitting one drawing across sheets to be taped
  together: "in leathercraft most people dont print on something bigger then a4 sometimes you need
  multiple pages". Shelf packing, tallest first. A part too large for one sheet is reported by name
  with the paper that would fit it — never scaled, never clipped.
  Tiling proper (overlap, registration marks, assembly sheet) remains future work, and is the only
  way to print a part bigger than the paper.
- **7.2** Registration marks, overlap bands, tile labels, edge arrows, assembly sheet.
- **7.3** ✅ **Done.** 50 mm verification square and 100 mm ruler on every page, plus the printed
  instruction to print at 100%. With `/PrintScaling /None` in the catalog that makes three
  independent defences, which matters because the application deliberately never drives a printer.
  A raster test caught the square overlapping the content area — it ran from 18 mm to 68 mm above
  the page bottom while patterns began at 36 mm, so a part could have been printed straight over
  the thing that proves the scale is right.
- **7.4** On-screen print preview using the same `paginate()` and the Canvas2D backend, with the
  deep-equality test binding them together.
- **7.5** Printer calibration wizard and per-printer correction factors, with the ±2 % guard.
- **7.6** ❌ **Explicitly deferred.** The user does not want the application to handle printers:
  "I dont want this app to handle the printer... for now only pdf good quality". Export opens the
  file in the system viewer and stops there. Revisit only if asked.
- **7.7** **Print the calibration target, measure it with a steel rule, record the result.** **→ M5**

### Phase 8 — v1.0
*Everything between "it works" and "someone else can use it".*

- **8.1** Part templates: save to library, insert from library.
- **8.2** Project settings, preferences, and a keyboard shortcut map.
- **8.3** Onboarding: three worked sample projects (card holder, strap, bifold) and a short getting
  started guide.
- **8.4** Error handling, empty states, and the "what do I do now" gaps.
- **8.5** Packaging: AppImage and Flatpak, icons, desktop entry, MIME registration for `.lcp`.
- **8.6** README, screenshots, contribution guide, and the v1.0.0 release.

### Phase 9 — Beyond v1

Ordered by expected value, not by difficulty:

1. **Thickness and wrap compensation** — the gusset problem. The single most requested thing in
   every leathercraft forum, and the fold-line model already carries the fields for it.
2. **Tracing from images** — import a photo or scan, set its scale from a known dimension, trace
   over it.
3. **Hardware library** — snaps, rivets, D-rings, zips, magnets, with real dimensions.
4. **DXF export** — R12 for CNC and laser users.
5. **Boolean operations** — no longer UX work on top of a dependency, since there is no Clipper.
   Shares its hard part with robust offsetting below: finding and removing the loops an operation
   creates. Build the two together.
6. **Seam pairing and hole-count parity validation** — catches a genuinely expensive mistake.
7. **Parameterised templates** — "card slot, width 95 mm".
8. **Windows and macOS** — packaging plus per-platform print verification.
9. **Nesting on a hide** — hard, and needs boolean operations first.
10. **Constraint solver** — only if real use proves the derivation graph insufficient.
11. **Robust offsetting, written here** — the general case analytic offsetting rejects: a concave
    outline whose inward offset crosses itself, where the overlapping loops have to be found and
    removed. [geometry.md](geometry.md) §6.1 explains why that is the hard part.
    Two third-party bindings were tried and rejected in slice 1.9 (ADR 0008), and the decision after
    that is to write it rather than shop for it again. It shares its machinery with boolean
    operations above; build the two together.
    Deferred this far on purpose: nothing before it needs it. Analytic offsetting handles every
    convex outline of lines and arcs, which is every shape the drawing tools produce that a
    leatherworker actually cuts.

## 5. Timeline

Steady part-time work — evenings and weekends — with Claude Code:

| Phase | Slices | Estimate |
|---|---|---|
| 0 — Foundations | 3 | 3–5 days |
| 1 — Geometry | 10 | 3–4 weeks |
| 2 — Canvas (M1) | 6 | 1.5–2 weeks |
| 3 — Editing (M2) | 10 | 3–4 weeks |
| 4 — Domain (M3) | 12 | 3–4 weeks |
| 5 — Persistence (M4) | 4 | 1 week |
| 6 — Export | 4 | 1.5 weeks |
| 7 — Printing (M5) | 7 | 2–3 weeks |
| 8 — v1.0 | 6 | 2–3 weeks |

**Roughly 4–5 months to a v1.0 worth releasing**, of which Phase 1 is a third of the effort and
produces nothing visible. That is the correct allocation, and it is worth knowing in advance so the
slow start does not read as a problem.

The estimates assume the discipline above. Skipping the property tests in Phase 1 would look faster
for about three weeks and then cost more than it saved, because offset bugs surface as "the pattern
is slightly wrong" reports that are miserable to diagnose after the fact.
