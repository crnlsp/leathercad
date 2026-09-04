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
- **1.9** ✅ **Done — analytic offsetting. Tier 2 moved to 3.11.** `offsetPath` offsets convex closed paths
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
  **Tier 2 is now slice 3.11**, placed where it is first needed rather than left open here. Nothing
  the application can draw today requires it: the rectangle tool is the only drawing tool that
  exists, and Tier 1 offsets every shape it produces exactly. The polyline tool (3.5) is the first
  way to draw an outline Tier 1 cannot handle.
  Two routes to Tier 2 were investigated and both are closed for now, which is why it is deferred
  rather than merely unfinished. `clipper2-js` computes offsets wrongly across joins and shapes:
  with a correctly closed ring it returns a pinwheel that visits each source vertex between offset
  corners, so the area comes out under the truth every time — square/miter 12150 against 14400,
  square/round 12000 against 14314, hexagon/miter 8837 against 9841, hexagon/round 7995 against
  9809. Identical output from `ArcTolerance` default down to 0.005, so it is not a tolerance
  setting. `clipper2-wasm` is the faithful build, but the renderer's CSP is `script-src 'self'`
  with no `'wasm-unsafe-eval'`, so Chromium refuses to compile *any* WebAssembly there — a
  100-byte module fails exactly as a 220 KB one does. See ADR 0008.
- **1.10** `intersectSegments` / `intersectPaths`: analytic for line and arc, flatten-and-refine for
  cubics.

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
- **2.6** SVG backend for the same `DisplayList`, which unlocks SVG-snapshot testing for everything
  after this point.

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
- **3.3** Snap engine: spatial index, priority order, px-derived tolerance, overlay glyphs.
- **3.4** ✅ **Done → M2.** Drag to draw, shift constrains to a square, live millimetre
  dimensions in the overlay, Escape abandons. Creates a real `cut-contour` on a new part, not a
  generic path. Per-corner radii and exact numeric entry arrived with the property panel (3.8).
- **3.11** **Robust offsetting (Tier 2).** Build this *before* 3.5. The number is high because
  slice numbers are identifiers used in commit messages, and Phase 3's finished work sits at 3.1,
  3.2, 3.4 and 3.8 — renumbering to insert one would rewrite history that already refers to them.
  Tier 1 (1.9) offsets convex paths of lines and arcs exactly, which covers every shape the
  rectangle tool can make. A polyline tool is the first way to draw a concave outline, where an
  inward offset can cross itself and the overlapping loops have to be found and removed. Seam
  allowance (4.9) needs the same machinery outward.
  Decide the route when the shapes are known: revisit `clipper2-js` (broken as of 1.2.4, see ADR
  0008), take `clipper2-wasm` and pay for it with a CSP relaxation plus async initialisation
  through the pure layer, or extend the analytic tier with self-intersection pruning —
  [geometry.md](geometry.md) §6.1 explains why that last one is a project rather than a slice.
- **3.5** Line and polyline tools; angle constraint on Shift. **Needs 3.11 first**: this is the
  slice that lets a user draw a shape Tier 1 offsetting cannot handle.
- **3.6** Circle and arc tools.
- **3.7** Move, rotate, scale: handles plus an exact numeric transform dialog. Includes the
  arc-under-non-uniform-scale rule from [geometry.md](geometry.md) §4.2.
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

### Phase 4 — The leathercraft domain
*Ends at M3. The phase that makes this a leathercraft application rather than a drawing program.*

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
- **4.2** The derivation graph: topological evaluation, per-node memoisation, per-node errors, cycle
  rejection at command time.
- **4.3** `CutContour` from shapes; part creation and the parts panel.
- **4.4** **Derived `StitchLine`** — offset inward, live-linked, with the inset editable in the
  property panel.
- **4.5** **`StitchHoleSet`** — pitch, iron presets, `fit-whole` and `exact-pitch`, batched
  rendering, and the count/pitch report. **→ M3**
- **4.6** Corner policy `hole-at-corner`: split at corners, distribute per run, per-run reporting.
- **4.7** Fold lines, marking lines, hardware holes.
- **4.8** Mirror, at feature and part level.
- **4.9** Seam allowance: derive a cut contour outward from a stitch line (the reverse direction).
- **4.10** Measurements: linear, aligned, radial, with anchors that follow their geometry.
- **4.11** Text labels with the vendored font.
- **4.12** Validation engine and the problems panel, with zoom-to-problem.

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
5. **Boolean operations** — the Clipper dependency is already there; this is UX work.
6. **Seam pairing and hole-count parity validation** — catches a genuinely expensive mistake.
7. **Parameterised templates** — "card slot, width 95 mm".
8. **Windows and macOS** — packaging plus per-platform print verification.
9. **Nesting on a hide** — hard, and needs boolean operations first.
10. **Constraint solver** — only if real use proves the derivation graph insufficient.

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
