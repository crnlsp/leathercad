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
│   ├── projects/        print-test.lcp, the 7.7 print test; sample projects are 8.3
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
- **3.12** **1.1.** "Convert to drawn path": the explicit, opt-in escape hatch for a shape the user *wants*
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
- **3.9a** ✅ **Done** (2026-09-24). **1.0. Arc segments in the polyline tool.**
  - Mid-run, **A** makes the next segment an arc and **L** a straight again, the CAD convention for
    a polyline. An arc takes two clicks, as the Arc tool does: its end, then a point it passes
    through.
  - The tool claims A and L only while a run is live (`Tool.onKey` may now return `true`), so they
    still switch to the Arc and Line tools otherwise. The options bar had no room for a toggle.
  - A scooped pocket is one closed outline. Its three sewn sides are stitched with a drawn stitch
    line and holes, and the whole thing survives save and reopen (`e2e/edge-scoop.spec.ts`).
  - **Found and fixed on the way:** the file rounded a stored path's numbers to six decimals, so an
    arc came back micrometres off its neighbour and a millionth of a radian off tangent. The offset
    then refused what it read as a concave corner at an arc, so a frozen rounded rectangle's stitch
    line built before a save and failed after one. A stored path's segments are now written exactly
    (`file-format.md` §3.2). No format version change.

  See [the design](superpowers/specs/2026-09-24-arc-segments-design.md).
  Before it was built, the entry read:

  **1.0. Arc segments in the polyline tool.** This is the smallest enabler for the product
  spec's pocket with a curved thumb scoop, and it is contained in the editor:
  - drawn paths already store arc segments, and the schema, persistence, evaluation, stitching and
    PDF export all handle them;
  - `Shapes.arcThroughPoints` already builds an arc from three points.

  **Checked before committing to it** (audit §2.1): a scooped pocket stitched along its three sewn
  sides works today, with a stitch line of 173.5 mm and 47 holes.
  **Documented limitation:** a stitch line inset *across* the scoop fails with `OFFSET_COLLAPSED`,
  because a concave line-to-arc join needs Tier 2 offsetting (Phase 9 #11). The scoop is a pocket's
  opening and is not stitched. **No general curve editor.**
- **3.9** **1.1.** Vertex editing: add, remove, move, corner ↔ smooth.
- **3.10** **1.1.** Guides, alignment, and distribution.
- **3.11** **1.1**, with no known throw left. Isolate a tool's overlay from the draw loop. `buildOverlay` runs inside the paint, so
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

✅ **Phase 4 is closed** (4.13, 2026-09-23). The audit ran before the close-out, at the user's
direction, and its F.0–F.7 work followed. F.7 completes it (§ *The UI Foundations checkpoint*).

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
- **4.12** ✅ **Done.** Validation complete
  ([design](superpowers/specs/2026-09-19-validation-complete-design.md)): zoom-to-problem, part and
  feature badges, a warning at export, and the invariant audit. X7 finally holds on every surface,
  and the slice adds **no new problem code** — it is reach, not rules.
  **Select the subject, frame the evidence.** `diagnosticTarget` is a pure function over the same
  `ResolvedProject` every surface reads, so clicking a row twice goes to the same place. The two
  differ whenever a feature failed: it has no geometry of its own, its diagnostic already points at
  what it was built *from*, and that is where the fix is — so the view goes to the outline while the
  selection stays on the stitch line the user clicked. `CanvasHost.frame(bounds)` is the canvas-owned
  way in; no panel touches a transform.
  **Badges count, colour ranks.** One fold over `severity`, nothing at zero, and a part's badge
  includes its features' — nine infos must never look like one error.
  **Export warns and never blocks**, and keeps two facts apart: how many rules are broken, and
  *which features are not on the paper*. The second is named rather than counted, because a feature
  silently missing from a template is how a pattern gets cut wrong. `exportReadiness` decides both,
  in the domain, from the same `ok` flag the scene builder filters on — pinned by a test in
  `packages/export` that asserts against the scene builder itself rather than a second copy of its
  filter.
  **The audit is static**, not order-dependent: it reads `PROBLEM_CODES`, `domain-model.md` §8 and
  every `*.test.ts` under `packages/`. It holds the registry and §8.6's two tables to each other in
  both directions, requires every invariant to have a code or a written reason it needs none
  (`INVARIANTS_WITHOUT_A_CODE`), and requires every code to be named by a test that is not the
  catalogue's own.
  Gotchas: the audit has to read the filesystem, which `domain-stays-pure` forbids — exempted by
  name, the way `problems.test.ts` already is for the message catalogue; the first thing it caught
  was that the measure tool had no unit test at all, so `MEASURE_NEEDS_ANCHOR` was produced by
  nothing any test looked at; and a degenerate frame has no scale that fits it, so zooming to a
  single hole needs a floor on the window size or the click looks like it did nothing.
- **4.13** ✅ **Done.** Close-out
  ([design](superpowers/specs/2026-09-23-phase-4-close-out-design.md)). **One card holder, drafted
  through the running application from the first outline to the printed page**:
  `e2e/phase-4-close-out.spec.ts`. The steps:
  - a 180 × 95 shell typed exactly, a derived stitch line and holes, and a fold;
  - a card slot mirrored across the fold, and a pocket drafted from its opening;
  - a dimension that keeps resolving, and a Polish label;
  - a mistake found from the problems panel and fixed by typing;
  - the fold deleted with its counterpart frozen, then undone;
  - saved, reopened in a fresh instance, and exported to A4.

  The per-behaviour tests in `shell.spec.ts` never checked that the behaviours **compose**; this
  test checks that.
  **It found two defects, both in deleting a fold, and both fixed here.** The delete dialog offered
  **Keep 0 frozen**, disabled, for a counterpart folded about the fold being deleted. `planDelete`
  decided *freezable* from the *derives* edge alone, while the command already froze the axis
  through the *references* edge. So the one way out 4.8b built was unreachable from the UI, and no
  unit test had asked the plan. A property test holding the plan to the command then found the
  second: deleting the slot **and** its fold with *freeze* **dropped** the counterpart, because it
  captured the axis of a mirror whose source was gone. Both now go through one function,
  `withCapturedAxis`, which the plan and the command share. The property test asserts that whatever
  the plan offers to keep, the command keeps, over every subset of a folded, stitched shell.
  Gotchas:
  - **The scenario reaches the canvas by millimetres, not pixels.** The canvas changes size with
    the tool (F.3), so a pixel offset carried from one tool to the next lands about 8.7 mm off.
    The scenario reads the cursor readout at two points each time it is about to click, and solves
    for the view.
  - **A dimension's value is readable only on the canvas.** No DOM element carries it, so the
    scenario asserts that the dimension resolves rather than what it reads. Recorded, not fixed:
    presenting measurements belongs to F.1.

  **Phase 4 in summary.**
  - **What the phase built.** Parts made of features that are parameters, never stored geometry.
    Derived stitch lines, holes, seam allowances and mirrors that stay linked. One reference graph,
    with deletion that asks. Anchors that survive derivation. Cut-outs, and a material-relative
    "inward". Fold, marking, hardware and text on paper as outlines in one vendored typeface.
    Dimensions that cannot drift. One diagnostic channel, reachable from every surface.
  - **Format versions.** Format went from version 2 to 8 in the phase; 5.5 then took it to 9.
    Every version has a committed fixture, and `v6_to_v7` is the first migration that rewrites data.
  - **Carried forward, deliberately:** radial and angular dimensions; Tier 2 offsetting (9.11);
    vertex ids and anchors on edited paths (3.9); whether a command should move the view; hole rows
    along a line; grain.
  - **Known and tracked, separately from any slice:** the canvas jump (F.3); an order-dependent
    `intersectSegments`; the `ticks.test.ts` float flake; and DR2 reporting an edge-to-edge fold
    as off the material.

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

---

#### ✅ The audit was done (2026-09-17/18). Its output

Performed by **building and driving the application** across eight workflows, not by reading the
code — which is what turned up most of it. Four documents, and they are the context a later slice
should start from rather than this summary:

| Document | What it settles |
|---|---|
| [The audit and a visual language](superpowers/specs/2026-09-17-ui-ux-audit-and-visual-language.md) | The findings, the visual-design audit, the product-identity argument |
| [UI Foundations](superpowers/specs/2026-09-17-ui-foundations-design.md) | The design system: tokens, type scale, four colour planes, control states, panel structure, the feature/line language, F.0–F.7 |
| [Decisions and disagreements](superpowers/specs/2026-09-18-ui-foundations-decisions.md) | The six open questions settled, four places the direction was pushed back on, the tool-palette audit |
| [Paper reference, typography, page setup](superpowers/specs/2026-09-18-paper-reference-and-typography.md) · [decisions](superpowers/specs/2026-09-18-page-setup-and-determinism-decisions.md) | The paper reference, one type family, the determinism fixes, the 5.5 recommendation |

**The one rule the whole system runs on:** the same operation has the same visual meaning
everywhere — tool rail, parts tree, property panel, diagnostics, canvas, and ink on the printed
pattern. Appearance may adapt to size and zoom; meaning may not.

**The test it has to pass:** remove the wordmark from a screenshot — is this still obviously software
for making leather patterns? Today, no. The ten-item checklist is in UI Foundations §12.

#### The UI Foundations checkpoint — F.0 to F.7

**Structure before styling**, with typography pulled ahead because it touches no container. Phase 5
features consume these; they do not extend or amend the visual language on their own.

| | Step | Contains |
|---|---|---|
| **F.0** ✅ | Typography | Apply the vendored face to the DOM (it is loaded and unused today); vendor Plex Sans 500/600; the nine-token scale; `formatMm()` / `formatAngle()` emitting the true minus |
| **F.1** ✅ | Systemic interaction | `ReasonedButton` (a disabled control that renders its refusal — the domain already produces every one, and the UI hides them in a native `title`, contradicting X1); `Tooltip`; a `Notice` near the gesture; one word per relationship — **Follows / Mirrors / Mirrors … across / Measures**; drag vs click–click made consistent and a header hint that is true; **Length** on an open line, and no area on a hole |
| **F.2** ✅ | Layout architecture | Icon rail 152/52 px in its own column; Parts full height; Problems as a drawer under the canvas; Properties with a sticky header; **the rule that no panel is ever removed at any window size** |
| **F.3** ✅ | The canvas keeps its place | Hold the world point at the canvas centre fixed across a resize, and delete the compensation arithmetic in the E2E suite |
| **F.4** ✅ | The remaining tokens | One source of truth in `packages/render/src/theme/`, projected onto CSS custom properties; spacing, radii, two elevation steps, 120 ms motion, a `--density` token; **the audit test that screen and paper agree** |
| **F.5** ✅ | Colour planes and canvas | The four planes; the drafting ground and three grid tiers; rulers with a cursor tick; **selection as a halo that keeps the role colour**; a failure marker replacing the red-over-source overlay; three zoom bands; the paper reference's *visual language only* |
| **F.6** ✅ | Icons | Tier 1 adopted for generic verbs and geometry tools; **eleven LeatherCAD marks**; `FeatureMark` used in rail, tree, property header, diagnostics and legend |
| **F.7** ✅ | Leather-specific treatment | True-size slanted stitch slits; seam allowance as a band; fold direction ticks; the derived link tick; the canvas legend and the part caption. **Then run the identity test and record the result** |

#### Triage, as the checkpoint required

**1 — Bug or inconsistency, fix before Phase 5.** ✅ *done this session:* three platform-font
fallbacks in `packages/render` (the live dimension, part captions and both rulers were **not** in the
typeface the pattern prints in); the missing U+2212 and Romanian letters; the hard-coded A4 export
(**5.5**). *Remaining:* ~~the canvas jump~~ (✅ F.2 and F.3); ~~the parts panel disappearing below ~900 px, which makes a **locked feature
unreachable**~~ (✅ F.2); ~~disabled controls hiding their reason~~ (✅ F.1);
~~Perimeter/Area shown for lines and holes~~ (✅ F.1); ~~number fields clipping their units~~ (✅ F.0);
~~terminology collisions~~ (✅ F.1); ~~a failed feature drawn in red over its healthy source~~ (✅ F.5); ~~emoji
icons~~ (✅ F.6).

**F.0 — done** (2026-09-23). The UI is set in IBM Plex Sans, the face it has vendored since 4.11a,
instead of `system-ui`. Regular, Medium and SemiBold are declared, and only Regular is ever outlined
for paper. The nine tokens from UI Foundations §4.2 are CSS custom properties on `:root`, each a
`font` shorthand, and every text rule takes one. Uppercase with letter-spacing is gone. Figures are
tabular throughout; measurements are set at 500 and counts at body weight.
Every displayed number goes through `formatNumber` / `formatMm` / `formatAngle` / `formatEditable`
in `packages/core`, which write U+2212 and never write "−0". `parseNumber` reads either minus and a
decimal comma, so a value can be retyped exactly as it reads. That covers the ruler, the cursor
readout, the tool previews, the property panel, a dimension's label, the problem messages, the
"too big for the paper" size, default hardware names and the punch sizes. The only `toFixed` left is
serialisation: `lcp.ts` and the SVG writer round numbers for files, not people.
`--t-num-lg` marks the stitch-hole panel's *Holes* and *Spacing*, the two numbers that panel is
for. Bold is pinned to the vendored 600, since a bare `<b>` asks for a 700 that does not exist. The
SVG screen backend sets overlay text at 500, as the canvas does. Property-tested:
- no output contains a hyphen;
- the output carries a minus exactly when the rounded value is negative;
- what is written reads back to within half a unit of its precision.

Gotchas:
- **Form controls never inherited the page font.** Native buttons and selects fell back to the
  system face. Worst were the *Draw as* chips: the `.chip` class had no CSS at all, so they have been
  white native buttons since 4.3a. `font: inherit` on controls fixes the face. `.chip` now looks like
  `.tool`, and selects like inputs, which is the only styling in this step.
- **A larger number showed less of itself.** Paired fields put a label, a 14 px figure and a 28 px
  unit column into about 100 px, and *Width* showed "103" for 103.38. That is worse than the clipped
  unit it replaced. In a pair the label now sits above the field.
- **The field's trailing-zero trim ate whole numbers.** At precision 0, 10 became "1" and 0 became
  a blank field, so the dimension's *Decimals* field went empty at 0. `formatEditable` trims only
  after a decimal point.
- **CI caught what the desktop hid.** Problem messages at body size in the 200 px left column made
  Problems tall enough to cover the parts list at the app's default 1280 × 840. The 4.13 scenario
  then clicked a problems panel lying on top of the row it wanted. Locally the window manager gave a
  larger window, so it passed. Problems is now capped at 30 % of the column and scrolls, and sets its
  messages at label size there. It is a stopgap until F.2 moves Problems into a drawer, and the
  scenario now pins the window to 1280 × 840 so local runs match CI.
- **`font` shorthands reset the figure style.** Every `font: var(--t-…)` resets
  `font-variant-numeric`, so `tabular-nums` set on `body` held only for body text. It is now on
  `*` with `!important`. An E2E test reads computed styles on a button, a select, an input and the
  readout, and checks all three weights have loaded; the test fails without the fix.
- **E2E helpers parsed numbers with `Number()`,** which returns `NaN` for U+2212. The rotate test
  asserted `not.toBe(0)`, which `NaN` passes, so it would have kept passing on nothing. Both spec
  files now share one `num()` helper that reads either minus.

**2 — UX improvement, low architectural impact.** The typography rollout (F.0); the layout
architecture (F.2); the colour planes (F.4/F.5); the icon system (F.6); selection as a halo; snap
feedback that names what it caught; anchors shown on hover in every tool.

**3 — Larger work, recorded not done.** The paper reference's picker and contextual suggestion (needs
5.5, then 6.4); alignment and smart guides; a fold preview; **grain direction** (see 7.2); a cut list
and hide yield; run-boundary marks at corners; a canvas legend; theming and density; screen
calibration, which would make "1:1 on screen" literal rather than a nominal-DPI approximation.


**F.1 — done** (2026-09-23).
- **`ReasonedButton`.** A control that cannot act renders the domain's own refusal beneath itself,
  from the same query the command checks (X1), tied to it with `aria-describedby`. `ReasonedRow` says
  a shared reason once for a pair, such as Flip ↔ / Flip ↕ on a label. It is used by every refusable
  action in the property panel: Flip, Mirror, Mirror across fold, Add seam allowance and Delete.
- **`Tooltip`.** Styled, delayed 400 ms on hover, immediate on focus, positioned against the window
  so a panel's overflow cannot clip it. It replaces every native `title` in the renderer.
- **The notice by the pointer.** A tool's refusal follows the pointer across the canvas for as long
  as it holds, and turns back from the edges. The status bar still carries it.
- **One word per relationship.** *Follows* and *Mirrors*, with *Mirrors … across* for a fold. A cut
  contour is headed *Outline* or *Cut-out*, the words the drawing modes use, not *Cut line (outer)*.
  Flip and Mirror sit under headings that say what each does: *Flip this piece* and *Mirror into a
  counterpart*.
- **Gestures.** Rectangle and Circle take two clicks as well as a drag, and Line takes a drag as well
  as two clicks. All three share one `isDrag` threshold with the select tool (`tools/gesture.ts`).
  Each tool has one true line of guidance, shown in the header while it is active and in its
  tooltip. The palette groups tools by how they are used: **Draw**, **Place** (Hardware, Text,
  Measure), **Modify**.
- **Measured.** *Length* on an open line and on a stitch line. *Perimeter* and *Area* only on a closed
  shape. Nothing on a hole or a hole set. A dimension shows **Reads**, the same laid-out string the
  canvas draws and the PDF prints, so the panel cannot disagree with the drawing, and **Measures**,
  naming what it measures.

Gotchas:
- **A readout probe near geometry snaps.** Tests that map millimetres to pixels by reading the cursor
  readout must probe empty canvas; the measure tool's snap onto an outline gave a view 8 mm out.
- **Wait for the canvas to settle.** A tool change resizes the canvas (F.3), so read the view only
  once `tool-options` has gone.
- **Playwright's `has:` resolves its inner locator relative to the outer one,** so it must not be
  pre-scoped to the panel.

**F.2 — done** (2026-09-23). The frame from UI Foundations §7.1:
`rail | parts | options · canvas · problems drawer | properties`.
- **The rail has a column of its own.** 152 px with labels and shortcuts, or 52 px with the shortcut
  as the face until F.6 draws icons. It collapses by itself below 1200 px and follows the maker's
  toggle above.
- **Parts runs full height.** Names wrap instead of truncating. Duplicate and Delete moved into a
  `⋯` menu on each part's heading row, which takes focus, closes on Escape or a click elsewhere, and
  gives focus back.
- **Problems is a drawer under the canvas,** collapsed by default to a 28 px handle that still says
  the verdict: *Nothing to fix*, or how many and how bad. Open, it takes at most 40 % of the column.
  F.0's stopgap cap on the left column is gone.
- **Properties is 288 px,** with a sticky header carrying the role's mark, the feature's name and
  its badges. Panel padding is 16 px and the label column 88 px.
- **The options row is always present, at a fixed height.** Changing tool no longer moves the
  canvas, which removes the tool-change half of the jump at its source. *Draw as* stays on screen.
- **Breakpoints (§7.2).** Parts is 200 px and Properties 264 px below 1280 px. Below 1024 px
  Properties becomes an overlay opened from the status bar, and below 900 px so does Parts. The rail
  always stays and no panel leaves the DOM. `minWidth` in the main process went from 940 to 860, the
  supported minimum, or the smallest breakpoint could never be reached.

Gotchas:
- **`localStorage` stalls a second window.** Both instances share one profile, so every E2E test
  launching its own app took 4.3 s instead of 1.1 s, and some failed intermittently. The rail's
  choice now lasts the session. Persisting it belongs in `preferences.json` (8.2), not browser
  storage.
- **Hidden tooltip text matched text queries.** "Actions for Shell" made `getByText('Shell')`
  ambiguous. A tooltip renders its text only while shown.
- **A mouse click showed a tooltip,** because focus shows one at once and a click focuses. Now only
  keyboard focus does (`:focus-visible`). A tooltip switched off (a menu's trigger while the menu is
  open) also came back at its old position the moment it was switched on.
- **The canvas is narrower at 1280 px:** 620 px, where it was 840. E2E tests that drew near the old
  right edge were moved inside it.
- **Synced with the engineering tooling (#49), F.2 cleared what it left to the F slices:**
  - The axe scan's three recorded violations were in the workspace markup this step rebuilt. The
    canvas column is now the `<main>` landmark and every panel is named, so `KNOWN` is empty, and a
    second scan covers the working layout: collapsed rail, open drawer, a populated tree and the
    Properties overlay.
  - The visual references were regenerated and inspected, and exposed a bug. **A snap glyph stayed
    drawn after the pointer left the canvas**, because the narrower canvas put the test's pointer
    path near a stitch line. `ToolManager.pointerLeave()` now drops it, and a unit test pins it.
  - The new `react-hooks` lint rule moved the tooltip's reset out of an effect and into render.

**F.3 — done** (2026-09-23). **The drawing moves only when the maker moves it.** `Viewport.reframe`
keeps every window point over the millimetre it was over when the canvas's box changes: the drawer
opening, the rail collapsing, a breakpoint, the window. `CanvasHost` passes how far the canvas's
top-left moved. It is property-tested over random sizes and shifts, and written through `toWorld`,
so the Y flip stays in `view.ts`.
- **§9.4's mechanism was the cause, not the cure.** "Hold the world point at the canvas centre" is
  what plain `resize` already did, and the centre moves whenever an edge does, by half the change.
  The spec states the intent — nothing moves unless the maker moves it — and that intent is what is
  built. Without the fix, opening F.2's problems drawer moved the drawing **26.7 mm**. An E2E test
  reads the same millimetre at one window point before and after the drawer opens and the rail
  collapses, and fails without the fix.
- **The E2E compensation arithmetic is deleted.** The dimension tests click the corners where they
  were drawn, and the 4.13 scenario reads the view once and again only after it deliberately
  reframes.
- A change of pixel density still resizes plainly: the old and new device pixels are not the same
  length, and it happens when a window moves between screens, not while drawing.

**F.4 — done** (2026-09-23). **One source of truth: `packages/render/src/theme/`.**
- **What it holds:** the palette (today's colours, named — F.5 replans them); the **role table**,
  with each line's screen colour and width, paper width and grey, and one dash rhythm in
  millimetres; and the type, spacing, radii, elevation, motion and density tokens.
- **Who reads it:** the canvas and SVG backends read it directly, the exporter prints from the same
  role table, and `apps/desktop` writes every token onto `:root` before the first render.
  `styles.css` now defines no colour, radius or type value of its own.
- **Screen and paper agree.** Dash rhythms are true millimetres in both: the stitch line's 2-2 mm,
  the fold's dash-dot, and the marking line's dots, which were solid on screen and dotted on paper.
  `screenDash` draws the true rhythm or none, never a stretched one, and is property-tested.
  Tool feedback keeps its own pixel dashes, since it is screen chrome and is never printed.
- **Audit tests.** `packages/export` holds every role to the very same dash array on screen and on
  paper. `apps/desktop` holds every `var(--…)` in the stylesheet to the theme, allows only the three
  layout widths as local variables, and refuses any colour literal or pixel radius.
- **Applied:**
  - three radii replace five ad-hoc values, with badges on the pill;
  - the delete dialog is raised: shadow and scrim (the audit found it "pasted on");
  - colour-only transitions at 120 ms, switched off for reduced motion;
  - the panel rhythm is 16/12/8;
  - control and row heights come from `--density`. Comfortable is the default; compact is defined
    but has no switch, since density is post-1.0.
- **The "one-sentence ADR 0011 amendment" is void.** It was for Plex Mono, which F.0's decisions
  dropped. The only change to the typeface (UI weights 500 and 600) was recorded in ADR 0011 during
  F.0.

Gotchas:
- **Vitest stubs CSS imports to an empty string**, even `?raw`, so a stylesheet audit written that
  way passes on nothing. It reads the file from disk and first asserts that it got one.
- **`apps/desktop` had no `vitest.config.ts`.** Its first unit test also ran from the compiled copy
  in `dist/`. It now includes only `src/**/*.test.ts`, like every package.
- A screenshot taken during a hover transition shows the old colour fading, which is not a
  selection bug. Playwright's pixel tests disable animations.

**F.5 — done** (2026-09-23). The canvas is a **light drafting ground inside the dark shell**, and
everything on it reads from the F.4 theme, so screen and paper keep one contract.
- **Four colour planes** (§5): shell, ground, accent (`--tan` on the shell, `--tan-ink` on the
  ground) and state, each severity with a shell value and a ground value. The stylesheet reads the
  plane names, and its audit caught every old name left behind. The role table takes §8.1's colours
  and screen widths; the paper widths are unchanged, so nothing printed moves.
- **The grid is three fixed tiers,** 1 / 10 / 100 mm plus the axes, each dropping out at its own
  zoom (§9.1). The **rulers** sit on the ground with a `--tan-ink` cursor tick on both.
- **Selection is a halo beneath, never a repaint** (§8.4). A hole set is haloed along its line, a
  dimension on its dimension line only, and a failed feature on its marker. Hovering in the Select
  tool gives the fainter halo.
- **A failure marks the failure, not its source** (§8.5). A new `marker` display item carries a
  severity glyph on a short leader, drawn by both screen backends from one shared `markerShape`.
  The healthy outline is no longer painted red.
- **Severity is a colour plus a glyph everywhere:** filled triangle, hollow triangle and dot on the
  canvas, in badges and in problem rows. `SeverityGlyph` is inline SVG, since the vendored face has
  no triangles. Warning moved to `#D9891F` (decisions §1.2).
- **Zoom bands** (§9.3). Below 2 px/mm a hole set renders as its stitch line, and below 0.6 px/mm
  every dash is solid. The true-size slits of the detail band are F.7's.
- **Tool feedback** (rubber bands, previews, selection box, snap glyph) takes its colours from
  `CANVAS.overlay`. The old yellow nearly vanished on the light ground.
- **The paper reference** is its visual language only: `CANVAS.paperReference`, in the 100 mm grid's
  value and hidden below 2 px/mm, with no toggle yet.

Found and fixed:
- **Ruler labels ran together zoomed out** ("−1200−1100−1000"): every major tick was labelled,
  whatever the spacing. `labelStepFor` thins labels onto major ticks with room to spare, using Plex
  Sans's 0.6 em tabular figures, and is property-tested. A ruler test fails without it.
- **§5.2's contrast figure was wrong.** Ink on ground is 13.97 : 1, not "above 14". The colours are
  kept (far past AAA), and the spec is corrected.
- `apps/desktop/vitest.config.ts` from F.4 was ESM loaded as CommonJS, which printed a warning on
  every run. It is now `.mts`.

**F.6 — done** (2026-09-23). Icons in two tiers
([ADR 0017](adr/0017-lucide-for-generic-icons.md)).
- **Tier 1 is Lucide** (`lucide-react`, pinned, a devDependency with no install script) for the
  generic verbs: eye, lock, more, chevrons, pointer, type, copy, trash, flip. It is used at 16 px
  with an absolute 1.5 px stroke.
- **The geometry tools are drawn here** in Lucide's language, each showing its **construction
  nodes**: the rectangle's diagonal corners, the circle's centre and rim, the arc's three points,
  the pivot of Rotate.
- **Tier 2 is the twelve LeatherCAD marks**, each a specimen of its line in its role's hue: the
  dash ratio with butt caps, so round caps cannot change it; the invariant weight order; and the
  distinguishing device — hatch, ticks, slits, arrowheads. `markFor` names a feature by what its
  line *is*, so an outline, a cut-out and a seam allowance never share a mark.
- **`FeatureMark` / `MarkOf` is the one component used wherever a feature is named:**
  - the rail: Hardware and Measure, in the current colour so the rail's state colours apply;
  - the parts tree, where marks replace the swatches, and the piece mark heads each part;
  - the sticky property header;
  - problem rows;
  - the *Draw as* chips.

  The F.7 legend will use it too.
- **Every emoji is gone.** The eye and lock toggles, the `⋯`, the chevrons and the ⇄ mirror mark are
  icons. An E2E test scans the whole interface for the pictograph planes and for
  `Emoji_Presentation`.
- **The collapsed rail** is a 20 px icon with the shortcut as a corner badge.

Found and fixed:
- **The canvas's role colours are invisible on the shell.** F.5 made them light-ground values, and
  the cut edge is near-black ink. Decisions §3 makes hue identity the invariant, not the value, so
  each role gained a **shell value**: the same hue, derived by raising lightness only. It is tested
  within 6° of the canvas hue and above 3 : 1 on both shell surfaces, the pattern severity already
  follows.
- **The *Draw as* row overflowed at 1280 px** once each chip carried its mark. The spacing is
  tighter and the label takes its natural width. An E2E test holds all six chips on screen at 1200
  and 1280 px.
- **Tree names broke mid-word** ("Stit / ch / hole / s") in the 200 px column. Names now break at
  words, the toggles are narrower, and badges never wrap.
- **The collapsed rail ran over the status bar at 860 × 600,** the smallest supported size, once its
  rows grew to fit 20 px icons, and it covered the *Parts* overlay button. Rows are now 30 px, and
  F.2's E2E test asserts that the rail fits without scrolling.
- **A cut-out mark's clip path had a fixed id,** repeated in a tree of cut-outs. It uses `useId`
  now.
- An emoji test on `Extended_Pictographic` also caught the typographic arrows in "Flip ↔", which
  the vendored face has, and `Emoji_Presentation` alone missed 👁. The test uses both the pictograph
  planes and `Emoji_Presentation`.

Still open, not built: **the draw tools taking the active *Draw as* role's colour** (decisions
§4.1.1). The decisions record lists it as still open, to be challenged before it is built, and it is
not on the F.6 row.
**F.7 — done** (2026-09-23). **The canvas says in lines what the panel said in sentences.** See
[the F.7 design](superpowers/specs/2026-09-23-leather-treatment-design.md). Nothing in the model,
the file or the paper changed.
- **Stitch holes are slits.** Each is centred on its hole and leans 45° to the line. The angle is
  measured from the hole's tangent, so the slit turns with the line round a corner, and a line
  drawn the other way gives the same slit. A slit is half the pitch long.
  - **Nominal, and said so.** The model stores only the pitch, so the slit comes from a nominal
    French-style iron defined once, in `render/theme/iron.ts`. Makers publish tooth widths of about
    half the pitch and cutting angles of 40–43°. The iron library is where an iron's own tooth
    will come from.
  - **The bands.** In the detail band a slit is drawn at its true length and with the 0.4 mm
    blade. In the working band its length is floored at 3 px, and its slant never is. The overview
    band is unchanged. Butt caps, so a slit is as long as it says.
- **The seam allowance is a band:** 12 % ink between the edge and the stitch line it grew from,
  beneath everything else in the part. Screen only.
- **Cut-outs are hatched inward:** §8.1's 45° lines at 18 % ink, clipped to the inside. This is
  not on the F.7 row. It is here because §8.2 specifies it, item 4 of the identity test needs it,
  and no F step had drawn it on the canvas.
- **Folds show which way they fold:** a V for a valley and a Λ for a mountain, about every 96 px.
  They stand upright on screen rather than turning with the line. A chevron turned to the line
  points along it, so a fold drawn the other way would read as the opposite fold.
- **Derived geometry wears a link tick:** two interlocked rings, at 60 % of the role colour, in the
  middle of the longest segment. It goes on a stitch line that follows, an allowance edge and a
  mirrored counterpart. It does not go on a hole set, which is always derived, on a frozen feature,
  or on a dimension.
- **The legend** sits top-right under the ruler, on the ground. It lists only what is drawn, in
  mark order, plus the link row. It starts collapsed to a strip of marks, and its state lasts the
  session: remembering it is 8.2's.
- **The caption says the iron:** `136 holes · 3.85 mm · KS Blade` under the part's name, at 2.2 mm.
  The name moves up a line to make room. This is on the canvas only; paper keeps the name alone.
- **One slant everywhere.** F.6's stitch-holes mark leaned at about 72°, and the glossary said
  20–30°. The mark is now computed from the same constant, and the glossary gives 40–45° with the
  makers' figures.

Found and fixed:
- **A tooltip opened after the pointer had left.** The bug was in F.1's `Tooltip`. The legend's
  toggle swaps its strip for its title on a click. The pointer-leave then went to a node that was
  no longer in the page, React never saw it, and the hover timer fired 400 ms later. `show()` now
  goes ahead only while its anchor is hovered or has keyboard focus. The legend's E2E test fails
  without the fix. It needs a strip of several marks and a pointer arriving from outside the
  toggle, so the test moves to the window corner first.
- **The link tick sat on a corner.** Halfway round a closed rectangle is its opposite corner, and
  the first screenshot showed it there. The tick now sits mid-run on the longest segment. That is
  also cheaper, because it no longer measures the whole path on every frame.
- **Per-frame cost.** The display list is rebuilt on every pointer move. On the benchmark's
  636-hole strap it took 13 µs before this slice. The first build of F.7 took 310 µs, from
  measuring every derived path and rotating each hole's tangent separately. It now takes 87 µs,
  because a slit is computed per hole where a dot only referred to its point. The SVG of the same
  scene went from 0.37 to 1.4 ms: four coordinates per slit, plus the outlines of the iron caption.
  The paper benches are unchanged. The committed baseline is not rewritten here.

**The identity test (§12), run 2026-09-23.** The subject is a 1920 × 1080 screenshot of the
running app, with the wordmark hidden. It shows the 4.13 card holder, framed, with the shell's hole
set selected. **9 of the 10 items are shown, and at least 6 are required, so it passes.** This is
the final result: the screenshot was reviewed again before #55 merged.

| | Item | Result |
|---|---|---|
| 1 | Drafting ground in a dark shell, 1/10/100 mm grid | ✅ The 1 mm tier joins at 4 px/mm, as §9.1 says |
| 2 | Tabular millimetres that do not move | ✅ Rulers, *Pitch 3.85 mm*, *Spacing 3.81 mm*, the status bar |
| 3 | Slanted slits at the iron's angle and spacing | ✅ At the nominal iron's slant (above) |
| 4 | The cut edge the heaviest line; cut-outs hatched | ✅ |
| 5 | A fold that shows which way it folds | ✅ V ticks on the valley fold |
| 6 | A seam allowance drawn as a band | ✅ The pocket |
| 7 | A tree in leathercraft marks: *Outline ▸ Stitch line ▸ Stitch holes* | ✅ |
| 8 | *Iron · Pitch · Fit · Corners · Holes · Spacing · Runs* | ✅ *Runs 24 · 45 · 23 · 45* |
| 9 | A dimension drawn like drafting: extension lines, arrowheads, the number breaking the line | ⚠ **Partly.** It has extension lines and a dimension line, but **no arrowheads**, and the number sits beside the line instead of breaking it |
| 10 | A canvas legend in the language of the drawing | ✅ |

Item 9 is recorded here, not built. A dimension's geometry comes from evaluation in `domain`, and
it prints, so arrowheads would be a measurement change with a paper consequence, not a canvas
treatment. It needs a slice of its own.

**With F.7 the UI Foundations checkpoint is complete.** Decided at review (2026-09-23), and
recorded in the F.7 design §6:
- **The iron caption stays canvas-only.** It does not print, so sheets are not reflowed for drafting
  metadata that is not geometry.
- **Paper keeps its 1 mm centre circles.** The slit is the screen's representation of a stitch hole.
  Its length and slant are a rendering convention worked out from the stored pitch, not model data.
  The circles have a physical alignment purpose that has been checked on paper, and the print
  contract stays stable.
- **The legend stays collapsed by default** until 8.2 persists preferences. F.7 adds no persistence
  of its own.
- **Follow-up: dimension arrowheads, with the number breaking the line.** This is identity item 9.
  It needs a slice of its own, because a dimension's geometry is evaluated in `domain` and prints.
- **Recorded performance finding:** the display list went from 13 to 87 µs on the 636-hole
  benchmark strap. It is not to be optimised unless an interactive performance problem is shown.
  The committed bench baseline still holds the pre-F.7 figures.
- **Draw tools in the role's colour** (decisions §4.1.1) stays open and is not built.

#### Deferred opportunities worth keeping visible

- **`3 sheets · all parts fit` in the status bar.** `paginate()` already returns `pages` and
  `oversized`, and `paperOptionsFitting` already answers which paper *would* work — a maker currently
  learns all three only after the PDF is written. Belongs with **6.4**, where the page setup becomes
  user-visible.
- **The paper reference overlay** — corner ticks around the **printable area** (A4 portrait is
  190 × 215 mm once margins and the 62 mm verification footer are out, *not* 210 × 297), anchored to
  the selection, off by default, geometry never clipped, and **never a diagnostic**: a pattern larger
  than a sheet is not wrong.
- **Diagnostics have no stable identity across edits** — fine today, since the panel keys by content,
  but it fails silently as a React key if anyone assumes otherwise.
- **Property-panel sizing**, and the parts tree truncating feature names at about ten characters.
- **A screen-calibration step**, post-1.0, which is what would make the 1:1 claim literal on screen.

### Checkpoint — engineering tooling
*Alongside UI Foundations. Not a slice: no product behaviour changes.*

The tooling review ranked what a project of this shape is expected to have. Everything ranked A or
B, and cheap or moderate to build, was built in one pull request. See
[the engineering-tooling spec](superpowers/specs/2026-09-23-engineering-tooling-design.md) and ADRs
[0014](adr/0014-electron-builder-and-release-please.md)–[0016](adr/0016-quality-tooling.md).

- **Shipping.** An AppImage with fuses set, built and smoke-tested on every pull request.
  release-please keeps a release pull request open, and merging it attaches the AppImage and an
  SBOM to a GitHub release. This takes 8.5's pipeline; icons, the desktop entry, MIME registration
  and Flatpak stay in 8.5.
- **The two test layers testing.md promised.** Pixel diffs in the pinned Playwright container
  (`pnpm test:visual`), and benchmarks with a committed baseline (`pnpm bench:compare`).
- **Tests of the tests.** Stryker mutation testing weekly, and property tests at 10 000 runs
  nightly with a printed seed.
- **Supply chain.** Every action pinned to a commit and checked by zizmor and actionlint, the
  lockfile checked by osv-scanner, and a seven-day Dependabot cooldown. CodeQL and Scorecard are
  wired for when the repository is public.
- **Evidence after a crash.** A local log and local crash dumps in `~/.local/state/leathercad/`.

What the new tools found is recorded where they found it and ratcheted, not fixed here, with one
exception: the project-name field had no accessible name, and a one-attribute fix outside the F
slices' markup gave it one. The rest, and where each belongs:

- **A robustness bug:** a `.lcp` with a tiny stitch pitch exhausts memory on load. Slice **5.6** ✅.
- **For the F slices, which own this markup:** three accessibility findings. There is no `<main>`
  (a `<main>` around `.canvas-column` fixes it and the `region` finding), and the three `<aside>`
  panels have no names. They are ratcheted in `e2e/accessibility.spec.ts`. Also in `CanvasHost.tsx`:
  ten reads of refs during render. Two may show stale state: the cursor style (`managerRef`) and the
  canvas notice's bounds (`containerRef`), which do not update until something else re-renders.
  Look at those two when F.3 is in `CanvasHost`. The other eight are the deliberate latest-value
  pattern. No broad refactor.
- **Informational:** offsetting a 500-point traced outline costs ~74 ms, over the 50 ms §7 budget
  on its own. It is a benchmark finding (`packages/geometry/bench/offset-traced.json`), not a
  target to optimise to.
- **Later architecture:** serving the renderer from a custom `app://` protocol instead of `file://`,
  so the `GrantFileProtocolExtraPrivileges` fuse can be turned off (ADR 0014). It is not a blocker.

Mutation testing and the nightly and weekly suites are **informational**: nothing gates on them
until they have produced baselines worth holding.

### Checkpoint — the 1.0 boundary
*After UI Foundations and 5.2/5.6. A scope decision, not a phase.*

**The pre-1.0 product audit** asked one question: can a new leathercrafter start with a blank
project, make a useful pattern, edit it safely, understand its problems, save it reliably, reopen
it, and print a correct 1:1 result without fighting the application? See
[the audit](superpowers/specs/2026-09-23-pre-1.0-product-audit.md), which classifies every finding
and cites the code.

**The verdict.** The pattern core is ready: `phase-4-close-out.spec.ts` builds a card holder end to
end. What is not ready is the safety net around it, and the print path beyond A4:
- **Work is lost without a word** by closing the window, opening another file, or a crash.
- **There is no *New project*.**
- **Every export is A4 portrait.**
- **A part bigger than the sheet cannot be printed.**
- **No print has ever been measured** (M5).

**This list is the definition of 1.0, and it is frozen** (confirmed by the user, 2026-09-23). It
replaces `product-spec.md` §5's longer MVP list. **The scope-freeze rule:** an idea that is not
required for document safety, the core leathercraft workflow, pattern correctness, print correctness,
or basic cross-platform release usability goes to 1.1 or later. That holds even when it turns up
during implementation.

**The working sequence:**

| # | Slice | 1.0 item |
|---|---|---|
| 1 | **5.3a** ✅ | Never lose work silently: *New project*, a correct dirty state, and *Save / Don't save / Cancel* before closing, reloading, opening or starting a new project |
| 2 | **5.3b** ✅ | Crash recovery: a recovery copy while dirty, and a restore offer after an unclean exit that never overwrites a project (robustness requirements in the 5.3b entry) |
| 3 | **6.4a** ✅ | Choose the paper and its orientation, written to the project's page setup (5.5) |
| 4 | **3.9a** ✅ | **Arc segments in the polyline tool**, the smallest enabler for the product spec's pocket with a curved thumb scoop. No general curve editor |
| 5 | **7.2a** ✅ | Tile a part larger than the sheet: overlap, registration marks, row/column tile labels, verification marks on every sheet, at 1:1. No print preview unless tiling proves otherwise hard to follow |
| 6 | **7.7** | A print measured with a steel rule and recorded, **on each of Linux, Windows and macOS**. A person does this, not code |
| 7 | **8.5a** ✅ | Production desktop integration: an app icon, a desktop entry, and a production menu, on all three platforms |
| 8 | **8.6** | Release: **Linux, Windows and macOS builds**, signing and notarisation, a current README with getting started, third-party notices, the newer-version message telling the maker to update, and v1.0.0. The checklist is in the 8.6 entry |

**1.1 and later**, in rough order of value:
- recent files and persistent preferences (8.2);
- SVG export (6.2) and DXF;
- the full export dialog (6.4);
- a worked sample project (8.3, which absorbs 5.4);
- the sheet preview (7.4) and calibration factors (7.5);
- vertex editing and an edge scoop (3.9);
- guides and alignment (3.10), overlay isolation (3.11), convert to path (3.12);
- dimension arrowheads and the hole-count budget;
- seam pairing;
- thickness compensation and the hardware library (Phase 9);
- templates (8.1);
- Flatpak and `.lcp` association;
- a general curve editor (vertex editing, Béziers), and stitching *across* a concave arc join, which
  needs Tier 2 offsetting (Phase 9 #11). The 3.9a scoop's opening is not stitched, so it does not
  need it.

**Out:**
- auto-update;
- material, cost or BOM metadata;
- a notes field separate from labels;
- nesting (v2);
- a constraint solver;
- 3D;
- an onboarding wizard;
- handles for values that are already typed.

**The `.lcp` compatibility policy** is explicit and accepted (`file-format.md` §4.5):
- older files always open in later versions, with no window;
- a change to what is drawn, cut or printed bumps the version, and an older build refuses it with a
  sentence;
- a metadata-only addition keeps the version, and an older build preserves it (#57);
- **unknown data is never silently discarded during load, save or an ordinary in-place edit.** An
  edit that replaces an object with a new one does not carry the old object's unknown fields. Two
  such edits exist: freezing a derived feature into drawn geometry, and the segments recomputed when
  a drawn path moves. This is documented and tested, not implied.

**Resolved at review (2026-09-23, audit §6):**
- tiling is in 1.0;
- the compatibility policy is accepted, with the precise wording above;
- the edge scoop is in, as 3.9a, after a feasibility check (audit §2.1);
- this list replaces `product-spec.md` §5;
- **Windows and macOS are 1.0 targets**, in 8.6, with their credential-dependent steps recorded as
  release tasks.

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
- **5.2** ✅ **Done** (2026-09-23). `formatVersion`, the migration runner, and the round-trip and
  byte-stability tests are in. A file from a newer version is refused rather than guessed at.
  - **The corpus** was already in place when this entry still listed it as missing. It is
    `fixtures/format/v1.lcp` through `v9.lcp`, one real file per version, and each opens through the
    chain in `fixture.test.ts`.
  - **Unknown-field preservation**, the last piece
    ([design](superpowers/specs/2026-09-23-unknown-field-preservation-design.md)). The schema
    used to strip every key it did not know. Opening a newer build's file and saving it deleted, for
    example, a grain direction on a part, and the maker did not even have to edit anything.
    - Every object in `ProjectSchema` is now a zod 4 `looseObject`. Unknown keys stay where they
      were found, and `stableJson` writes them back. An unedited round trip is byte-identical.
    - Edits keep them wherever a command copies the object, which every command does for the
      project, its settings, parts and features. An object an edit rebuilds, such as a retyped
      shape, keeps nothing it does not know.
    - Known keys are validated as before. zod neither keeps nor honours a `__proto__` key.
    - The manifest is still written fresh on every save.
    - This is not a format version.
  - **Mechanism, changed from the plan.** `file-format.md` §4.3 had sketched an `_ext` bag. Loose
    objects behave identically, including under edits. The bag would have needed a tree walk in each
    direction and an `_ext` field on dozens of domain types that no domain code reads. §4.3 now
    describes what is built.
  - Tests:
    - a property test adds a generated key to any object in the current fixture, and it
      survives byte for byte;
    - one example at each level;
    - geometry unchanged by unknown keys;
    - the `__proto__` case;
    - an invalid known field still refused;
    - a desktop test that opens a file, renames, hides, locks and moves, saves, and finds the
      fields still there. It fails without the fix.
  **M4** is now 5.3 (autosave, recovery, recent files, unsaved changes) and 5.4 (sample projects)
  away.
- **5.5** ✅ **Done.** **Minimal project page setup** — `paper` + `orientation` in `ProjectSettings`,
  format version 9, and `exportPdfFile` passing it. Before it there was none: `DEFAULT_PAGE_SETUP`
  applied and **every export in the product was A4 portrait**.
  **One conversion point**, `pageSetupFor(settings)`, so there is nowhere for a second paper setting
  to appear — the export dialog (6.4) will edit the project, not its own state. The paper vocabulary
  moved down to `packages/domain/src/paper.ts`, because `ProjectSettings` has to name it and `domain`
  cannot import `export`; the derived half — margins, the footer, `contentAreaMm`,
  `paperOptionsFitting` — stays where it was.
  **The name is stored, not the dimensions**: a stored 210 × 297 would be a second definition of A4.
  `v8_to_v9` writes A4 portrait, and the whole fixture corpus v1–v8 is asserted to load that way,
  because a migration may describe what a document already meant and may not decide something new
  for a file someone has cut from. The writer test exports the same project on A5, A4, A4 landscape,
  A3 and Letter and measures the MediaBox — the only place the choice is visible.
  **No UI yet**: choosing the paper is 6.4. What this buys today is that the plumbing has one source
  of truth before four things start reading it.
  It lands here rather than in 6.4 because four things need to agree on it — the export dialog
  (6.4), pagination (7.1), the print preview (7.4) and the paper reference — and four consumers with
  no source of truth is how two paper settings get invented and then disagree. The migration is the
  whole cost of the slice.
  Deliberately minimal: margins and the 62 mm verification footer stay constants, because they are
  already correct and changing them has print-accuracy consequences.
  See [page setup and determinism](superpowers/specs/2026-09-18-page-setup-and-determinism-decisions.md).
- **5.3** Re-scoped by the pre-1.0 audit (§5). The one line mixed four things of very different
  value.
  - **5.3a** ✅ **Done** (2026-09-23). **1.0. Never lose work silently.**
    See [the design](superpowers/specs/2026-09-23-unsaved-changes-design.md).
    - *New project*: a button and Ctrl+N.
    - A dirty state that is false for an untouched document, and after undo back to what was
      saved. Until now a blank project read "Save •".
    - One question, *Save changes to "Name"?*, with *Save / Don't save / Cancel*. It is asked
      before closing the window, reloading, opening a file, and *New*. Focus starts on *Save*,
      which loses nothing. *Save* on an untitled project goes through *Save as*, and backing out of
      that cancels the whole action.
    - Closing is guarded by the page's `beforeunload` rather than the main process's `close`, so
      a **reload** asks too. Electron's default menu offers View › Reload, which used to discard
      work just as silently.
    Gotchas:
    - **Every E2E teardown now uses `closeApp()`.** It destroys the window, which skips unload
      and so skips the question. Without it, each test that ended with unsaved work sat out
      Playwright's 60 s teardown.
    - **A refused unload makes Chromium report a "leave page?" dialog** over the debugging
      protocol. Electron never shows it, and Playwright's automatic dismissal then throws "No
      dialog is showing". The unsaved-changes tests dismiss it themselves.
    - Two existing tests throw work away and reopen it from disk. They now answer *Don't save*,
      which is exactly their intent.
    - Still open for release hygiene (8.5a): Electron's default menu, with Reload and Toggle
      Developer Tools, ships in the production app.
  - **5.3b** ✅ **Done** (2026-09-23) as designed in
    [the crash-recovery design](superpowers/specs/2026-09-23-crash-recovery-design.md).
    - **Main process: `RecoveryStore`.** It takes a directory, a session and a liveness check, and
      no Electron, so it is unit-tested on real files. It keeps one copy per session, named
      `<pid>-<start>.lcp`, so two running copies of the app never touch each other's. Writes go
      through the shared `writeFileAtomic`. A dead session's temporary scraps are swept, and a
      live session's are left alone. A clean quit deletes this session's copy and any it took
      over. A renderer crash sets `keepOnQuit`.
    - **Renderer: `useRecovery`.** It writes a copy at most once an interval: only while dirty,
      never during a transaction (`StoreState.inTransaction`, new), and only when the document
      changed. It clears the copy whenever the project is clean again. At startup it offers the
      newest copy that loads. One that does not is set aside as `.corrupt` and logged. *Recover*
      opens the copy untitled and unsaved, writes this session's own copy, and only then takes the
      old one over. *Not now* takes it over too: it stays on disk until the next clean exit.
    - **Tests:**
      - 14 unit tests on real files, covering atomic writes, a crash mid-write, live versus dead
        sessions, newest first, *Not now*, corrupt copies, and ids that are not session ids;
      - five E2E tests on a killed app (SIGKILL): recover (the project file byte for byte
        unchanged, and *Save* asks where), *Not now* then a clean exit, a save clears the copy, a
        damaged copy at startup, and a renderer crash followed by a normal quit.
    Gotcha:
    - **A renderer crash reaches the main process as an event**, after `forcefullyCrashRenderer`
      returns. The E2E test waits for `isCrashed()` before quitting. Without the wait, the quit
      won the race and deleted the copy, which is not how a maker's crash unfolds.

    The original scope: a `.lcp` recovery copy in the app's state
    directory (`stateDirectory()/recovery/`: XDG state on Linux, the user-data folder on Windows and
    macOS). It is written at most every 60 s, only while dirty, and never during a drag transaction.
    At startup a leftover copy means the last session did not end cleanly, and the app offers to
    restore it as an **untitled, dirty** document. Declining does not delete the copy at once. Its
    design must also cover:
    - **atomic writes**: a temporary file, then a rename over the copy;
    - a corrupt or incomplete recovery file: named, ignored, and never fatal at startup;
    - startup with no valid recovery file: nothing is asked;
    - cleanup after a clean save or a clean close;
    - a crash during the recovery write itself, which the temporary file and rename absorb;
    - the original project can never be overwritten: the recovery path is never a project path,
      and restoring opens untitled.
    It is not a backup or version-history system.
  - **5.3c** **1.1.** Recent files, with the preferences file of 8.2. The OS dialog already reopens
    the last folder.
- **5.4** Merged into **8.3**: both asked for sample projects. 1.1.
- **5.6** ✅ **Done** (2026-09-23). **Loader hardening: refuse what the editor cannot produce.**
  See [the 5.6 design](superpowers/specs/2026-09-23-loader-hardening-design.md).
  **The defect.** A file whose stitch-hole `pitchMm` was tiny passed `ProjectSchema`, which only
  asked for a non-negative pitch; `1e-300` reproduces it. `evaluate` then tried to place about
  10³⁰² holes, and the process ran out of memory. It was found by the `.lcp` fuzz test of the
  engineering-tooling checkpoint (F1). On `main` at `ad39f26`, `LEATHERCAD_FC_RUNS=20000` killed
  the fuzz worker with `SIGABRT`. The editor could not make that file, because its pitch field
  stops at 0.5 mm.
  **The decision left to the slice: a floor in `evaluate`, not a schema refusal.** A pitch of 0
  already opened and was reported as `PARAMETER_INVALID` on its one hole set, so `1e-300` now
  behaves the same way.
  - The file opens, and the maker fixes one hole set rather than losing the project.
  - It also guards the other way a pitch reaches the domain: the command that adds holes takes the
    project's `defaultIronPitchMm`, which comes from the file.
  - **`MIN_PITCH_MM = 0.5`** lives in `domain`, and the panel's pitch field reads it, so the editor
    and evaluation refuse the same pitches.
  - `PARAMETER_INVALID` gained an `at-least` requirement with a `minimum`. Its message states the
    floor. It never prints the value, because the catalogue would round `1e-300` to "0".
  - A pitch of 0 now fails as `at-least` rather than `positive`.
  - This is a validation change, **not a format version**, and there is no schema change.
  - **One invariant, checked where holes are made.** `distributeHoles` has a precondition that
    throws before generating anything, so a raw `1e-300` cannot reach hole generation from any
    caller. The paths that produce a pitch are listed in the design §3, each with its test: the
    loader, the panel field, the iron presets, and the command that takes the project default.
  - **Accepted at review:** opening the file and refusing only the hole set is preferred to
    rejecting the whole project.
  **The acceptance criterion changed with the decision.** It had expected `InvalidProjectFileError`
  naming the feature. Now the named regression test in `lcp.test.ts` saves and loads the file,
  evaluates it within a second, and finds the hole set refused by name while the rest resolves.
  `lcp.fuzz.test.ts` passes at `LEATHERCAD_FC_RUNS=20000`.
  **The audit** (design §4): only the pitch divides a length by a number the file controls. Every
  other generated quantity is bounded by the file's size, a fixed tolerance, the ±100 000 mm
  coordinate limit, or the viewport.
  Gotchas:
  - **The floor is compared with `approxGte` and `EPS_LENGTH`** (invariant 7). The first property
    test ran its "below" range right up to the floor, and fast-check shrank to
    `0.49999990000000005`, which is the floor up to float noise and is accepted. That value is
    now an explicit example, and the "below" range stops `EPS_LENGTH` short of the floor.
  - **The domain test reproduces the out-of-memory crash itself.** Before the fix, running
    `derive.test.ts` aborted its worker, so the defect is pinned below the loader as well as in
    it.
  - **The app cannot even save the hostile file.** The serialiser rounds to six decimals, so
    saving `1e-300` writes 0. The first version of the persist regression test saved through
    `saveProject`, which made it test a pitch of 0 and pass for the wrong reason. It now writes
    the raw `1e-300` into the archive by hand and asserts that it is there. Without the floor, that
    test runs the heap out of memory.
  **Recorded, not fixed:** with the floor in place, the hole count is linear in the geometry's
  size, and the editor can still draw a lot of it. A 100 m circle at 0.5 mm is about 1.26 million
  holes. That is a performance question, with a hole-count budget if one is ever wanted, not a
  question about refusing what the editor cannot make.

### Phase 6 — Export

- **6.1** ✅ **Done.** `ExportScene`: styled geometry in millimetres, all black and distinguished
  by line style. Widths are **true millimetres** here, unlike on screen where they are constant in
  pixels — a cut line printed at 0.25 mm is 0.25 mm on the page. Black because a mono printer
  renders blue and green as indistinguishable greys, and a template exists to be photocopied.
- **6.2** **1.1.** SVG writer: mm units, layer groups, the single Y-flip, with the accuracy tests from
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
- **6.4a** ✅ **Done** (2026-09-24). **1.0. Choose the paper.** Paper and orientation, written to
  the project's page setup (5.5 built the plumbing and had no UI). Before it, every export was A4
  portrait, and an A4 sheet sent to a Letter printer is where a print dialog offers "fit to page".
  - `setPaper` and `setOrientation` commands: undoable and unsaved like any edit. Choosing what is
    already chosen earns no history. Unknown settings are kept.
  - A paper control in the header beside *Export PDF*, whose tooltip names the paper.
  - The oversized message names the chosen paper and suggests that paper turned before any other.
  - **Found and fixed on the way:** the PDF's 50 mm square was skipped on A5 portrait, on a page that
    still said to measure it. `verificationLayout` is now the block's one layout, drawn by the writer
    and reserved by `contentAreaMm`. On a sheet too narrow for the square beside the ruler, it stacks
    above it. It is checked on every sheet: inside the margins, never overlapping, never under the
    pattern, and 50 mm through poppler.

  No format change. See [the design](superpowers/specs/2026-09-24-paper-and-orientation-design.md).
- **6.4** **1.1**, the rest. Export dialog: preset, layers, paper, bounds. **Depends on 5.5** — the paper control needs
  a page setup in the project to write to, or it becomes a second setting that disagrees with the
  one pagination uses. `paperOptionsFitting` already answers "what would fit", so the dialog reports
  rather than computes.

### Phase 7 — Printing
*Ends at M5. The payoff.*

- **7.1** 🟡 **Partly done — as part packing, not tiling.** At the user's direction, overflow moves
  whole parts to the next A4 sheet rather than splitting one drawing across sheets to be taped
  together: "in leathercraft most people dont print on something bigger then a4 sometimes you need
  multiple pages". Shelf packing, tallest first. A part too large for one sheet is reported by name
  with the paper that would fit it — never scaled, never clipped.
  Tiling proper — a part bigger than the paper — is 7.2a, done; the assembly sheet and edge arrows
  are 7.2, 1.1.
- **7.2a** ✅ **Done** (2026-09-24). **1.0. Tile a part larger than the sheet.** Without it, a
  notebook cover, a tote panel or a strap could not be printed at all.
  - A part too large for the chosen sheet is printed across `rows × columns` sheets at 1:1, after the
    packed parts. Each sheet is a window the size of the printable area, placed by a translation
    alone and clipped. The grid is centred, and tiles overlap by 10 mm. Nothing rotates.
  - On each sheet:
    - **join lines** down the middle of every shared overlap band, in light grey 6-3 dashes, which no
      pattern role uses;
    - **registration crosses** on them, at the same model coordinates on every sheet that shows them;
    - a **tile label** (`Strap · R1 C2 · 1 × 3 sheets`);
    - the assembly note;
    - the whole verification block.

    The label and note belong to `verificationLayout`, so the all-sheets layout property checks them.
  - The export notice names each tiled part, with its grid and the paper that would hold it whole.
    It is no longer an error in the status bar.
  - Checked through poppler: a 250 mm strap on A4 portrait is two sheets whose halves, measured to
    their shared join line, add up to 250 mm. Physical verification is still 7.7.

  See [the design](superpowers/specs/2026-09-24-tiling-design.md).
- **7.2** **1.1**, the rest: edge arrows and an assembly sheet. Registration marks, overlap bands,
  tile labels, edge arrows, assembly sheet.
  **Constraint, recorded before it is needed: pagination must never rotate a part to make it fit
  until the model knows which way the part's grain runs.** Packing already orders parts to fill the
  sheet, and rotating an oversized one is the obvious next step — but leather stretches across the
  grain, so a rotated piece instructs someone to cut in a direction that will stretch wrong, and the
  printed pattern would be confidently incorrect. A one-line constraint now; an expensive retrofit
  after someone has cut from it. Grain direction itself is post-1.0.
- **7.3** ✅ **Done.** 50 mm verification square and 100 mm ruler on every page, plus the printed
  instruction to print at 100%. With `/PrintScaling /None` in the catalog that makes three
  independent defences, which matters because the application deliberately never drives a printer.
  A raster test caught the square overlapping the content area — it ran from 18 mm to 68 mm above
  the page bottom while patterns began at 36 mm, so a part could have been printed straight over
  the thing that proves the scale is right.
- **7.4** **1.1.** Export already opens the PDF in the system viewer, which is an exact preview of
  every sheet. On-screen print preview using the same `paginate()` and the Canvas2D backend, with the
  deep-equality test binding them together.
- **7.5** **1.1.** Printer calibration wizard and per-printer correction factors, with the ±2 %
  guard. The verification square and ruler already show when a printer is off.
- **7.6** ❌ **Explicitly deferred.** The user does not want the application to handle printers:
  "I dont want this app to handle the printer... for now only pdf good quality". Export opens the
  file in the system viewer and stops there. Revisit only if asked.
- **7.7** **1.0.** **Print the print test, measure it with a steel rule, record the result**,
  once on each of Linux, Windows and macOS, from each platform's default PDF viewer. A viewer that
  defaults to "scale to fit" is exactly what this catches. **→ M5.** A person does this, not code.
  - ✅ **The automated half** (2026-09-24). `fixtures/projects/print-test.lcp` is built by the app's
    own commands (`apps/desktop/src/renderer/src/printTest.test.ts`): a panel with a 100.0 mm
    dimension and a stitch line all round, a card pocket with a thumb scoop stitched on three
    sides, and a 250 mm strap tiled over two sheets. `e2e/print-verification.spec.ts` exports it
    with the Export PDF button and measures poppler's rendering of the file: the square and ruler
    on every sheet, the panel's edge and its dimension line, the spacing of its straight run of
    holes from the first and last centres, and the strap's halves and registration crosses across
    the join. The packaged smoke test repeats it against the binary, on all three platforms.
  - Preparing it found a real print bug, fixed in #69: a dimension printed its number with no
    line. It also found the old log's procedure wrong twice — it compared ten holes with the
    property panel's *Spacing*, which averages every run, and ten holes are nine gaps.
  - [ ] **The physical half.** `print-verification-log.md` still reads "pending" on all three
    platforms. The procedure is in that file.

### Phase 8 — v1.0
*Everything between "it works" and "someone else can use it".*

- **8.1** **1.1.** Part templates: save to library, insert from library.
- **8.2** **1.1.** Project settings, preferences, and a keyboard shortcut map, plus recent files
  (5.3c) and the legend and rail state that F.2 and F.7 could not keep.
- **8.3** **1.1.** Onboarding: one worked sample project first (the card holder), absorbing 5.4.
  The empty states already carry a first-time maker to a stitched panel. Originally: three worked
  sample projects (card holder, strap, bifold) and a short getting started guide.
- **8.4** **Largely done** by F.1 and F.2: every refusal says why, every empty panel says what to
  do, and the drawer states the verdict. The one gap the audit found, the newer-version message not
  saying *update*, moved into 8.6. Error handling, empty states, and the "what do I do now" gaps.
- **8.5a** ✅ **Done** (2026-09-24). **1.0. Production desktop integration, on all three
  platforms.**
  - **An app icon**: the product spec's own card pocket, a tan piece with a thumb scoop stitched on
    its three sewn sides, on the shell's ground. It is drawn once in `build/icon.svg`, and
    `pnpm icons:generate` renders `icon.png`, a 16–512 px Linux set, `.ico` and `.icns`, which are
    committed. On Linux the window takes its icon at run time.
  - **A Linux desktop entry** with GenericName, Keywords, Comment and Graphics.
    - `desktopName` is set, with `syncDesktopName`, so the window's app ID matches the entry's
      `StartupWMClass`. Without it a desktop cannot tell which entry a running window belongs to.
    - Checked inside the built AppImage.
  - **A production menu**: File, Edit, View, Help, plus the app and Window menus on macOS.
    - Each item runs the renderer's own handler, through `PlatformHost.onMenuAction`, so a menu
      choice and a key press cannot drift apart.
    - Accelerators are shown but not registered, so a key runs once.
    - Reload and the developer tools exist only in a development build. The packaged smoke test
      checks that.
    - Edit keeps cut, copy and paste, which text fields need on macOS.
  - **Found on the way:** document undo took only Ctrl+Z, so Cmd+Z did nothing on macOS.

  See [the design](superpowers/specs/2026-09-24-desktop-integration-design.md).
  Before it was built, the entry read: an app icon (`.png`, `.ico`, `.icns`), a Linux desktop entry,
  and a production menu. Electron's default still offered Reload and Toggle Developer Tools, which
  5.3a found.
- **8.5** **1.1**, the rest. Packaging: Flatpak, icons, desktop entry, MIME registration for `.lcp`. The AppImage, its
  fuses, the packaged smoke test and the release pipeline landed with the engineering-tooling
  checkpoint.
- **8.6** **1.0. Release readiness, on Linux, Windows and macOS.** README, screenshots, contribution
  guide, and the v1.0.0 release. Split into two slices:
  - **8.6a**: builds on every platform (2026-09-24, open for review).
    - electron-builder targets: an NSIS installer (per user, no administrator) on Windows, and a
      universal dmg on macOS, beside the AppImage. `pnpm package` builds the current platform's
      installer.
    - On macOS the app is signed ad hoc until the Developer ID exists. Flipping the fuses
      invalidates Electron's own signature, and an arm64 app with none will not start.
    - `.github/workflows/package.yml` runs the packaged smoke test and builds the installer on
      `windows-latest` and `macos-latest`. It runs when packaging could have changed, weekly and on
      demand, not on every PR: the repository is private, where a macOS minute costs ten.
    - The release workflow builds and attaches all three installers.
    - Asar integrity is enforced by the fuse already on. The smoke test starting the packaged app is
      its check.
    - `shellEmulator` makes package scripts mean the same in Windows's `cmd.exe`.
  - **8.6b**: the rest of the code list below, after the open 1.0 PRs merge, so the README
    describes `main`.

  **Code:**
  - ~~electron-builder targets for Windows (NSIS installer) and macOS (dmg, universal) beside the
    AppImage;~~ 8.6a
  - ~~a CI build and packaged smoke test on `windows-latest` and `macos-latest`;~~ 8.6a
  - ~~the release workflow attaching all three artefacts;~~ 8.6a
  - ~~asar integrity, which Electron enforces on Windows and macOS;~~ 8.6a
  - a README rewrite. It still says "early scaffolding" and promises tiling the app does not yet
    do;
  - a getting-started page;
  - third-party notices for the bundled runtime dependencies, in the app and the release;
  - the newer-version message telling the maker to update.

  **Release tasks that need credentials or settings outside the repository.** Each is recorded here
  rather than pushed to 1.1; the release waits on them:
  - [ ] **Windows code signing.** An OV or EV certificate, or Azure Trusted Signing, and its secrets
        in the repository.
  - [ ] **macOS signing and notarisation.** An Apple Developer Program membership, a Developer ID
        Application certificate, and an App Store Connect API key for `notarytool`, as repository
        secrets. Unsigned macOS builds are blocked by Gatekeeper, so this is a prerequisite, not
        polish.
  - [ ] **Linux.** The AppImage needs no signing authority. An optional GPG signature can come with
        the release checksums.
  - [ ] **The Release workflow's permission.** It has failed on every push to `main` since #49 with
        *"GitHub Actions is not permitted to create or approve pull requests"*. Fix it in Settings →
        Actions → General → Workflow permissions → *Allow GitHub Actions to create and approve pull
        requests*.
  - [ ] **The physical print on each platform** (7.7).

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
8. ~~**Windows and macOS**~~ **Moved into 1.0** (8.6 and 7.7) at the 1.0 boundary review.
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
| 4 — Domain (M3) | 19 | 3–4 weeks |
| 5 — Persistence (M4) | 5 | 1 week |
| 6 — Export | 4 | 1.5 weeks |
| 7 — Printing (M5) | 7 | 2–3 weeks |
| 8 — v1.0 | 6 | 2–3 weeks |

**Roughly 4–5 months to a v1.0 worth releasing**, of which Phase 1 is a third of the effort and
produces nothing visible. That is the correct allocation, and it is worth knowing in advance so the
slow start does not read as a problem.

The estimates assume the discipline above. Skipping the property tests in Phase 1 would look faster
for about three weeks and then cost more than it saved, because offset bugs surface as "the pattern
is slightly wrong" reports that are miserable to diagnose after the fact.
