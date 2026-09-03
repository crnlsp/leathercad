# Roadmap

**Status:** Design — no implementation yet
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

- **0.1** Monorepo skeleton: pnpm workspaces, strict TS, Vitest, ESLint, Prettier,
  dependency-cruiser with the layering rules from [architecture.md](architecture.md) §2, CI
  workflow. Ends with `pnpm test` green on one trivial test and `pnpm depcruise` passing.
- **0.2** Electron shell: window opens, React renders, a DPR-aware canvas is mounted and sized,
  `PlatformHost` is defined with its Electron implementation and its in-memory fake. Playwright
  launches the app and asserts the window title.
- **0.3** ADR 0001 (record decisions), 0002 (Electron over Tauri), 0003 (TypeScript geometry core).

### Phase 1 — Geometry core
*Pure, headless, heavily tested. The foundation everything else stands on.*

- **1.1** `core`: ids (ULID with injectable entropy), `Result`, epsilon module, `approxEq`,
  `quantise`, assertions.
- **1.2** `Vec2`, `Mat2x3`, `Rect`. Property tests for transform invertibility and composition.
- **1.3** `Segment` union: line, arc, cubic. `pointAt`, `tangentAt`, `length`, `split`, `reverse`,
  `transform`, and **exact** `bbox`.
- **1.4** `Path`: construction, the shared-endpoint invariant, `validatePath`, length, area,
  winding, `containsPoint`.
- **1.5** Flattening with tolerance; determinism tests.
- **1.6** `PathMeasure`: arc-length LUT, `pointAtDistance`, `tangentAtDistance`.
- **1.7** `shapes`: line, polyline, rect, rounded rect with four independent radii, circle, ellipse,
  arc through three points.
- **1.8** `distributeAlongPath`: `exact-pitch` and `fit-whole`, with the full property set from
  [testing.md](testing.md) §3.2.
- **1.9** Clipper2 integration behind `internal/clipper.ts`; `offsetPath` Tier 2 (flatten and clip).
  The heaviest property-test slice in the project.
- **1.10** `intersectSegments` / `intersectPaths`: analytic for line and arc, flatten-and-refine for
  cubics.

### Phase 2 — Document and first working canvas
*Ends at M1.*

- **2.1** `Document` type, `Command`, `DocumentStore`, undo/redo with transactions, selection model.
  Includes the universal `undo(apply(c, d)) === d` property test.
- **2.2** `Viewport`: mm ↔ px, zoom-to-cursor, pan, DPR, fit-to-content.
- **2.3** `DisplayList` and the Canvas2D backend; three stacked canvases; the rAF scheduler.
- **2.4** Render a hard-coded 100 mm square from document data. **→ M1**
- **2.5** Adaptive grid and mm rulers with the shared nice-number tick generator.
- **2.6** SVG backend for the same `DisplayList`, which unlocks SVG-snapshot testing for everything
  after this point.

### Phase 3 — Editing
*Ends at M2.*

- **3.1** Tool framework: the `Tool` interface, tool manager, `ToolContext`, cursors, Escape
  semantics, keyboard routing.
- **3.2** Select tool: click, shift-click, rubber band, mm-space hit testing, selection overlay,
  delete.
- **3.3** Snap engine: spatial index, priority order, px-derived tolerance, overlay glyphs.
- **3.4** Rectangle tool with per-corner radii and numeric entry. **→ M2**
- **3.5** Line and polyline tools; angle constraint on Shift.
- **3.6** Circle and arc tools.
- **3.7** Move, rotate, scale: handles plus an exact numeric transform dialog. Includes the
  arc-under-non-uniform-scale rule from [geometry.md](geometry.md) §4.2.
- **3.8** Property panel with exact mm fields, driven by the selection.
- **3.9** Vertex editing: add, remove, move, corner ↔ smooth.
- **3.10** Guides, alignment, and distribution.

### Phase 4 — The leathercraft domain
*Ends at M3. The phase that makes this a leathercraft application rather than a drawing program.*

- **4.1** `Part` and `Feature` types; layer roles and their style table; the resolved-document
  shape.
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

- **5.1** The `.lcp` ZIP container, zod schemas, save and open, atomic write via `rename`.
- **5.2** `formatVersion` 1, the migration runner, `fixtures/format/v1.lcp`, and the round-trip and
  byte-stability property tests. **→ M4**
- **5.3** Autosave, crash recovery, recent files, unsaved-changes handling.
- **5.4** Sample projects shipped in `fixtures/projects/`.

### Phase 6 — Export

- **6.1** `ExportScene` and the export presets built on layer roles.
- **6.2** SVG writer: mm units, layer groups, the single Y-flip, with the accuracy tests from
  [printing.md](printing.md) §14.
- **6.3** PDF writer with `pdf-lib`: exact points, no scaling transform, verified by parsing the
  output back with `pdfjs-dist`.
- **6.4** Export dialog: preset, layers, paper, bounds.

### Phase 7 — Printing
*Ends at M5. The payoff.*

- **7.1** `paginate()`: paper sizes, margins, overlap, centred tile grid. Pure and exhaustively
  tested before anything renders.
- **7.2** Registration marks, overlap bands, tile labels, edge arrows, assembly sheet.
- **7.3** The calibration block: 50 mm verification square and 100 mm ruler on every page.
- **7.4** On-screen print preview using the same `paginate()` and the Canvas2D backend, with the
  deep-equality test binding them together.
- **7.5** Printer calibration wizard and per-printer correction factors, with the ±2 % guard.
- **7.6** Linux print submission via CUPS with scaling disabled, and the `xdg-open` fallback.
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
