# Architecture

**Status:** Design — no implementation yet
**Last updated:** 2026-09-03

---

## 1. Stack decision

**Electron + TypeScript + React (chrome only) + Canvas2D (drawing) + pnpm workspaces.**

### 1.1 Desktop shell: Electron over Tauri

Given the constraints (Linux first, TypeScript geometry core, print accuracy is the product):

| | Electron | Tauri v2 |
|---|---|---|
| Rendering engine | Chromium, bundled and pinned | System webview — WebKitGTK on Linux, WebView2 on Windows, WKWebView on macOS |
| Canvas performance | Consistently good; Skia | WebKitGTK is measurably slower for heavy Canvas2D and has had DMA-BUF renderer bugs on Linux that need `WEBKIT_DISABLE_DMABUF_RENDERER=1` workarounds |
| Node at runtime | Yes, in the main process | No — Rust, or a bundled sidecar |
| Bundle size | ~120–180 MB | ~10 MB |
| Memory | Higher | Lower |
| Extra toolchain | None | Rust |
| E2E testing | Playwright has first-class Electron support | Weaker, WebDriver-based |

Tauri's advantages — bundle size and memory — matter little for a CAD tool users install once and
run for hours. Electron's advantages map directly onto this project's risks:

- **One pinned rendering engine.** When the app goes cross-platform, the canvas renders identically
  everywhere because Chromium ships in the bundle. With Tauri, three webview engines is three sets
  of canvas and font-metric differences to validate against a 0.1 mm accuracy bar.
- **Node in the main process** means PDF generation, ZIP handling, file I/O, and printer submission
  are ordinary npm packages, not Rust bindings.
- **Playwright drives Electron directly**, which is what makes the visual-regression and E2E layers
  in [testing.md](testing.md) cheap.

**This is a reversible decision, deliberately.** All application logic lives in platform-agnostic
packages that import nothing from Electron. The shell is reached only through a narrow
`PlatformHost` interface (§5). Swapping to Tauri later means reimplementing that interface — a few
hundred lines — not a rewrite. Record the decision as `docs/adr/0002-electron-over-tauri.md` so the
reasoning survives.

> Note on printing: the choice of shell matters *less* than it looks, because **the app never prints
> through the webview**. PDFs are generated as vector content by our own code. See
> [printing.md](printing.md) §2.

### 1.2 Geometry core: TypeScript, not Rust

Pattern-scale geometry is small: a complex bag is perhaps 40 parts, a few hundred curves, and a few
thousand stitch holes. That is three or four orders of magnitude below where JavaScript's numeric
performance becomes the limiting factor. `Float64` in V8 is IEEE-754 double, identical to Rust's
`f64`, so precision is not a reason to reach for Rust either.

What a Rust core would cost: every geometry call crosses an async IPC or WASM boundary with
serialisation. Live tool preview — recomputing an offset on every mouse move — is exactly the
workload that boundary punishes.

**If a hot spot appears later** (realistically: boolean operations on very complex nested contours,
or auto-nesting), the escape hatch is already in place: `packages/geometry` exposes pure functions
with plain-data arguments and no internal state. Any single function can be swapped for a WASM
implementation behind the identical signature, and the existing property tests become the
conformance suite for the replacement.

### 1.3 UI layer

- **React 19** for the application chrome only: toolbars, property panels, dialogs, the problems
  list, the export wizard. React is a good fit for forms and panels and a bad fit for a canvas.
- **The canvas is plain imperative TypeScript.** No React reconciliation in the draw path. React
  owns a single host `<div>`; the editor owns the `<canvas>` elements inside it.
- **Zustand for UI state only** — active tool, panel visibility, dialog state, viewport. Small,
  unopinionated, no boilerplate.
- **The document is *not* in Zustand, Redux, or any generic state library.** It has its own store
  with commands, transactions, and an undo stack (§4). This is the single most important
  state-management decision in the project; see [risks](#9-risks-this-architecture-is-designed-to-avoid).

### 1.4 Supporting tools

| Concern | Choice | Licence | Why |
|---|---|---|---|
| Package manager | pnpm workspaces | — | Strict dependency isolation between packages, which is what enforces the layering |
| Build | Vite + electron-vite | MIT | Fast, TS-native |
| Unit tests | Vitest | MIT | Same transform pipeline as the build; fast |
| Property tests | fast-check | MIT | The core of the geometry test strategy |
| E2E / visual | Playwright | Apache-2.0 | First-class Electron support |
| Offsetting / booleans | Clipper2 (WASM or JS port) | BSL-1.0 | Battle-tested polygon offsetting; do not write this yourself |
| PDF writing | pdf-lib | MIT | Direct vector PDF, full control of coordinates |
| PDF parsing (tests) | pdfjs-dist | Apache-2.0 | Read exported PDFs back to assert dimensions |
| ZIP container | fflate | MIT | Small, sync API, no native deps |
| Schema validation | zod | MIT | Runtime validation at the file-load boundary |
| Immutable updates | immer | MIT | Structural sharing for the undo stack |
| Layering enforcement | dependency-cruiser | MIT | Fails CI on an illegal import |
| Packaging | electron-builder | MIT | AppImage + Flatpak + deb |

Deliberately **not** used: Redux (wrong model for a CAD document), a CSS framework beyond a small
hand-written token set, three.js (no 3D), Storybook (high upkeep for a canvas-centric app).

**Fonts must be vendored**, not taken from the system. Text metrics affect both PDF output and
visual-regression snapshots; a system font makes both non-reproducible.

## 2. Layering

Strict, one-directional dependency graph. An arrow means "may import".

```
                     ┌──────────────┐
                     │ apps/desktop │  Electron main + preload + renderer entry
                     └──────┬───────┘
                            ▼
                     ┌──────────────┐
                     │      ui      │  React panels, dialogs, canvas host
                     └──────┬───────┘
                            ▼
                     ┌──────────────┐
                     │    editor    │  viewport, tools, snapping, hit-testing, guides
                     └──┬────────┬──┘
                        ▼        ▼
              ┌──────────────┐  ┌──────────────┐
              │    render    │  │   document   │  doc state, commands, undo, selection
              └──────┬───────┘  └──────┬───────┘
                     │                 ▼
                     │          ┌──────────────┐      ┌──────────┐
                     └─────────▶│    domain    │◀─────│ persist  │  .lcp, schemas, migrations
                                └──────┬───────┘      └──────────┘
                                       ▼
                                ┌──────────────┐
                                │   geometry   │  PURE. mm only. no pixels, no DOM.
                                └──────┬───────┘
                                       ▼
                                ┌──────────────┐
                                │     core     │  ids, result types, epsilons, assertions
                                └──────▲───────┘
                                       │
                                ┌──────┴───────┐
                                │   platform   │  PlatformHost — the OS boundary (§5).
                                └──────────────┘  Implemented by apps/desktop, faked in tests.

     export   ──depends on──▶ domain, geometry, render(display-list types only)
     print    ──depends on──▶ export
     ui, cli  ──depend on───▶ platform, for file and dialog access
     cli      ──depends on──▶ everything except ui/editor/desktop
```

### The rules, enforced by dependency-cruiser in CI

1. `geometry` may import only `core`. It must not reference the DOM, canvas, pixels, DPI, colour,
   or any file format.
2. `domain` may import `core` and `geometry`. It must not know about rendering or interaction.
3. `document` may import `core`, `geometry`, `domain`. It must not know about tools or the viewport.
4. Nothing may import `ui`, `editor`, or `apps/desktop`.
5. `export` and `print` must not import `editor` or `ui` — so both are runnable headless, from
   tests and from the CLI.
6. No package may import Electron except `apps/desktop`.
7. `platform` may import only `core`. It declares the OS boundary; it never implements it.

Rule 6 is what keeps the Tauri escape hatch open. Rule 1 is what keeps the geometry engine testable
and correct.

## 3. One-way data flow

```
   Document (stored, parameters only)
        │  evaluate()  — walks the derivation DAG, memoised
        ▼
   ResolvedDocument (concrete Paths and point sets, per-node errors)
        │  buildDisplayList()  — applies layer-role styles
        ▼
   DisplayList
        │
        ├──▶ Canvas2D backend  ──▶ screen
        └──▶ SVG backend       ──▶ snapshot tests, quick export

   ResolvedDocument
        │  buildExportScene()
        ▼
   ExportScene ──▶ Paginator ──▶ Page[] ──▶ PDF / SVG / DXF writers
                                   └──────▶ Canvas2D backend (print preview)
```

Two properties matter here:

- **Print preview and the PDF share the paginator.** They cannot drift apart, because a drift would
  be a bug in the same function.
- **The SVG backend renders the same `DisplayList` as the screen.** This makes SVG-string snapshots
  a valid proxy for "what does the canvas draw", which is the backbone of the rendering test
  strategy in [testing.md](testing.md) §5.

Mutation happens in exactly one direction and one place:

```
   user gesture ──▶ Tool (state machine) ──▶ Command ──▶ DocumentStore ──▶ new Document
                                                              │
                                                              └──▶ invalidate evaluation cache
```

Tools never mutate the document. React components never mutate the document. Only commands do.

## 4. The document store, commands, and undo

```ts
type Command = {
  readonly label: string;                     // shown in the undo menu
  apply(doc: Document): Document;             // pure
};
```

Commands are **pure functions producing a new document**, not do/undo pairs. Undo is implemented by
keeping previous document snapshots, with structural sharing via immer so that an edit to one part
does not copy the other thirty-nine.

Why snapshots rather than inverse commands: every hand-written `undo()` is an opportunity to
corrupt state, and the bugs surface hours later as a mangled document. With snapshots, undo is
correct by construction, and one property test covers every command that will ever be written:

```ts
// for all documents d and commands c:  undo(apply(c, d)) deepEquals d
```

A pattern document is a few hundred kilobytes; 200 levels of history with structural sharing is
not a memory concern. If it ever becomes one, immer's `produceWithPatches` converts the history to
patches without changing any calling code.

**Transactions** handle dragging. A drag produces hundreds of intermediate states; only the final
one belongs in history:

```ts
store.begin('Move part');
// ... many store.preview(cmd) calls during pointermove — these do not touch history
store.commit();      // pushes one entry
store.rollback();    // on Escape
```

**What is *not* in the undoable document:** active tool, viewport, panel layout, hover state,
window size. Selection is a borderline case — it is stored *alongside* each history entry so undo
restores it, but it lives outside the document proper so that selecting something does not mark the
file dirty.

## 5. Platform boundary

The only way application code touches the operating system:

```ts
interface PlatformHost {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  showOpenDialog(opts: OpenDialogOptions): Promise<string | null>;
  showSaveDialog(opts: SaveDialogOptions): Promise<string | null>;
  openInExternalViewer(path: string): Promise<void>;
  listPrinters(): Promise<PrinterInfo[]>;
  submitPrintJob(pdfPath: string, opts: PrintJobOptions): Promise<void>;
  getUserConfigDir(): string;
}
```

Implemented once in `apps/desktop` over Electron IPC, and once as an in-memory fake in the test
suite. Everything above `editor` depends on the interface, never on Electron.

Electron security posture, non-negotiable: `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`, a preload exposing only the typed `PlatformHost` channel, and a strict CSP with no
remote content loaded anywhere.

## 6. Canvas and interaction system

This is the part most likely to rot as the app grows, so it gets explicit structure.

### 6.1 Viewport

One object owns the mm ↔ px relationship, and nothing else computes it:

```ts
class Viewport {
  centreMm: Vec2;
  scale: number;              // px per mm
  sizePx: { w: number; h: number };
  dpr: number;

  toScreen(p: Vec2): Vec2;
  toWorld(p: Vec2): Vec2;
  mmToPx(len: number): number;
  pxToMm(len: number): number;
  zoomAt(anchorPx: Vec2, factor: number): void;   // zoom about the cursor, not the centre
}
```

Rules: nothing outside `editor/viewport.ts` and the renderer may convert between mm and px. Hit
testing converts its *tolerance* from px to mm and then does all comparisons in mm — never the
other way around.

### 6.2 Three stacked canvases

| Layer | Contents | Redraws when |
|---|---|---|
| `background` | Paper, page-tiling preview, grid, rulers | Viewport changes |
| `content` | The resolved document | Document or viewport changes |
| `overlay` | Selection, handles, snap glyphs, tool preview, rubber band, in-progress measurement | Every frame during interaction |

This split is what keeps dragging at 60 fps with 3 000 holes on screen: a drag repaints only the
overlay, which holds a handful of shapes.

All drawing is scheduled through a single `requestAnimationFrame` loop driven by dirty flags.
Nothing draws synchronously from an event handler.

DPR handling: back the canvas at `cssSize * dpr` and set a base transform of
`ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`. Construction lines, handles, and grid lines use
**screen-constant widths** (they should look the same at any zoom); only print and export use
mm-true stroke widths.

### 6.3 Tools as explicit state machines

```ts
interface Tool {
  readonly id: string;
  readonly cursor: string;
  onPointerDown(ctx: ToolContext, e: PointerInput): void;
  onPointerMove(ctx: ToolContext, e: PointerInput): void;
  onPointerUp(ctx: ToolContext, e: PointerInput): void;
  onKey(ctx: ToolContext, e: KeyInput): void;
  buildOverlay(ctx: ToolContext): DisplayList;
  onDeactivate(ctx: ToolContext): void;
}
```

`ToolContext` gives read access to the viewport, the resolved document, and the snap engine, plus
`dispatch(command)` and the transaction API. It gives **no** write access to the document.

Every tool carries an explicit `state` discriminant — `'idle' | 'awaiting-second-corner' | …` —
rather than a scatter of booleans. This one convention prevents most of the mess that canvas tools
accumulate. Every tool must handle Escape by rolling back its transaction and returning to `idle`.

Ephemeral drawing state (points placed so far) lives in the tool, not in the document. A half-drawn
polyline is not part of the file.

### 6.4 Snapping

A pure function, fully testable without a canvas:

```ts
function snap(
  cursorMm: Vec2,
  candidates: SnapIndex,
  toleranceMm: number,
  enabled: SnapKindSet,
): SnapResult | null;   // { point, kind, sourceId }
```

Priority order when several candidates are within tolerance: **vertex/endpoint → intersection →
midpoint → centre → on-path projection → guide → grid**. Explicit priority is what makes snapping
feel deliberate rather than random.

Tolerance is defined in *pixels* (default 10 px) and converted to mm through the viewport, so
snapping feels the same at every zoom level. Candidates come from a spatial index (a uniform grid
is sufficient at this scale) rebuilt when the resolved document changes.

The result reports *which* kind of snap fired, so the overlay can draw the matching glyph. That
feedback is most of what makes CAD snapping feel trustworthy.

Separately: **angle constraint** (Shift → 15° increments) and **numeric entry during drawing**
(type a length, Tab, type an angle). Numeric entry is cheap to build and is the difference between
"a drawing program" and "a CAD program".

### 6.5 Selection

Hierarchical, with drill-down:

```ts
type Selection = {
  parts: ReadonlySet<PartId>;
  features: ReadonlySet<FeatureId>;
  vertices: ReadonlySet<VertexRef>;   // { featureId, segmentIndex, end }
};
```

Click selects a part. Double-click enters the part and selects features. Double-click again enters
path editing and selects vertices. Escape walks back out. This is the standard model and it scales
to complex documents without new concepts.

### 6.6 Guides and alignment

Guides are **document objects** (persisted): an origin point plus an angle, so diagonal guides work,
not just horizontal and vertical. They are dragged out from the rulers and snapped to like any
other candidate.

Alignment and distribution operate on selection bounding boxes and are ordinary commands — no
special machinery.

### 6.7 Grid and rulers

Both use a shared "nice number" tick generator producing 1 / 2 / 5 × 10ⁿ mm intervals chosen so
that ticks stay at least ~8 px apart. The 1 mm grid hides itself below a px-per-mm threshold to
avoid moiré. Major gridlines every 10 mm.

## 7. Cross-platform later

The work to add Windows and macOS is confined to:

1. A second and third `PlatformHost` implementation (dialogs are already Electron's; printing
   differs — CUPS `lp` on Linux, the Win32 spooler or shelling to a viewer on Windows).
2. Packaging targets in electron-builder.
3. Re-running the visual-regression suite per platform, with vendored fonts making that mostly a
   formality.
4. Re-running the **physical** print verification on each platform. This is the real work and the
   reason to defer it until 1:1 is proven on one platform.

No geometry, domain, document, export, or print-pagination code changes.

## 8. Performance plan

Measure before optimising, but the known shapes of the problem:

- **Evaluation is memoised per node**, keyed on the node's parameter hash plus its inputs' resolved
  hashes. Editing one part does not re-evaluate the other thirty-nine.
- **Stitch holes render as a single batched path** (one `Path2D` of many small circles) rather than
  3 000 individual `arc()` + `fill()` pairs.
- **Culling**: the content layer skips features whose bounding box does not intersect the viewport.
- **Offsetting is the expensive operation.** During a live drag of a cut contour, recompute the
  derived stitch line at a coarser flatten tolerance and refine on commit.
- A benchmark suite guards against accidental O(n²): a "worst realistic case" fixture (20 parts,
  3 000 holes) with a committed timing baseline.

## 9. Risks this architecture is designed to avoid

Numbered so ADRs and code comments can reference them.

**R1 — Pixels leaking into the model.** Any coordinate stored in px, or any geometry scaled by
zoom, and 1:1 printing is dead. *Mitigation:* `geometry` cannot import anything that knows about
pixels; the viewport is the only converter; a lint rule bans `px`-suffixed identifiers in
`geometry` and `domain`.

**R2 — Persisting derived geometry.** Bloats files, locks in algorithm bugs forever, and creates
stale-data bugs. *Mitigation:* the serializer writes parameters only; a round-trip test asserts that
loading and re-evaluating reproduces the geometry.

**R3 — Building a generic vector editor and bolting semantics on later.** The retrofit never
finishes. *Mitigation:* the domain layer with features and derivations exists before the drawing
tools get rich — Phase 4 is not deferrable past Phase 5.

**R4 — Underestimating offsetting.** Naive per-segment offsetting works on a rectangle and fails on
the first real wallet, because it does not remove the self-intersections that appear at concave
corners. *Mitigation:* use Clipper2 behind our own interface, and write the property tests before
trusting the output.

**R5 — Floating-point sloppiness.** `===` on floats, ad-hoc epsilons, unquantised input. Produces
snapping and boolean failures that are not reproducible. *Mitigation:* one epsilon module, an
`approxEq` helper, quantisation of all user-entered and snapped coordinates. See
[geometry.md](geometry.md) §3.

**R6 — Y-axis ambiguity.** Mixing Y-up and Y-down produces mirrored exports that nobody notices
until something is cut. *Mitigation:* the model is **Y-up**; the flip happens in exactly two places
(the Canvas2D backend and the SVG writer) and both have tests asserting that a point at y = +10
appears *above* one at y = 0.

**R7 — Printing through the browser.** `window.print()`, CSS `@page`, and "fit to page" silently
destroy scale. *Mitigation:* generate PDFs from our own vector writer; never call the webview's
print path. See [printing.md](printing.md) §2.

**R8 — Undo built on hand-written inverses.** *Mitigation:* snapshot-based undo plus a universal
round-trip property test.

**R9 — The document in a generic state library, mutated from components.** *Mitigation:* the
document store owns it; tools dispatch commands; components read.

**R10 — No file-format versioning on day one.** Retrofitting migrations once real user files exist
is miserable. *Mitigation:* `formatVersion: 1` and a working migration runner ship with the very
first save implementation, before the first release.

**R11 — Redrawing everything every frame.** *Mitigation:* three-layer canvas; only the overlay
repaints during interaction.

**R12 — Non-deterministic tests.** System fonts, `Date.now()` in serialisation, unseeded randomness,
locale-dependent number formatting. *Mitigation:* vendored fonts, injected clock, seeded generators,
fixed locale in test config, SVG-string snapshots preferred over pixel diffs.

**R13 — Scope creep into constraints and 3D.** Both are multi-month diversions. *Mitigation:* they
are named as v3 in the product spec, and the derivation DAG is documented as the deliberate
alternative.

**R14 — Never physically verifying.** Software that says 100 mm and prints 97 mm. *Mitigation:*
every printing slice ends with a printed page measured against a steel rule, recorded in
[printing.md](printing.md) §9.
