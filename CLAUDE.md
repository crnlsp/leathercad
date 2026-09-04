# LeatherCAD

Desktop application for designing leathercraft patterns that print at exact 1:1 scale.
Electron + TypeScript, Linux first, Apache-2.0.

**The product promise: a line drawn as 100 mm measures 100 mm on paper.** Every rule below exists to
protect that.

## Invariants

Violating any of these is a bug, even if tests pass.

1. **Millimetres are the source of truth.** Pixels exist only inside `packages/render` and
   `packages/editor/viewport.ts`. Nothing else converts between them.
2. **Y is up.** The screen flip is defined in exactly one place — `worldToScreen` in
   `render/view.ts` — and applied by the two screen backends, `render/canvas2d/*` and
   `render/svg/*`, which never derive a flip of their own. `export/svg/*` has its own, because a
   file has no viewport. PDF and DXF are Y-up already and need no flip.
3. **`packages/geometry` is pure.** No DOM, no canvas, no colour, no file formats, no state, no
   randomness, no clock. It may import only `packages/core`.
4. **Derived geometry is never persisted.** Files store parameters; evaluation recomputes paths and
   stitch holes on load. See `docs/file-format.md` §3.3.
5. **Only commands mutate the document.** Tools dispatch; React components read. No component and no
   tool writes to the document store directly.
6. **Never print through the webview.** No `window.print()`, no CSS `@page`. PDFs are generated as
   vector content by `packages/export/pdf`. See `docs/printing.md` §2.
7. **No float equality.** Use `approxEq` and the epsilons from `packages/core/epsilon.ts`. Never
   define a local epsilon.
8. **Quantise user input** to 1e-4 mm via `quantise()` before storing it.
9. **A shipped format migration is immutable.** Never edit one, never delete one.
10. **Geometry and domain functions need property tests**, not only examples. See `docs/testing.md`
    §3.

## Commands

```bash
pnpm dev              # run the app (electron-vite, with HMR)
pnpm check            # typecheck + lint + format:check + depcruise + test:coverage — before a slice is done
pnpm test             # unit + property + golden + export + snapshot
pnpm test:e2e         # builds, then Playwright drives the real Electron app
pnpm build
pnpm typecheck        # tsc --build
pnpm lint
pnpm format           # prettier; markdown is deliberately excluded
pnpm depcruise        # layering violations — must pass
```

Not yet implemented. Each exits with a pointer to the roadmap slice that adds it — implement it
there, don't stub it out earlier: `pnpm test:visual` (slice 2.3), `pnpm bench` (1.9).

Work lands on a slice branch through a pull request, never by pushing to `main`. `pnpm install`
installs a `pre-push` hook that enforces both halves of that. See `docs/roadmap.md` §2.4.

**pnpm is not on PATH** unless you have run `sudo pacman -S pnpm`. A bootstrap copy lives at
`~/.local/share/pnpm-bootstrap/node_modules/.bin`; prefix commands with
`export PATH="$HOME/.local/share/pnpm-bootstrap/node_modules/.bin:$PATH"` until then. pnpm 11
re-invokes itself from PATH before running scripts, so a bare path to the binary is not enough.

## Layout

Dependencies point downward only; `pnpm depcruise` enforces it.

```
core       ids, Result, epsilons, quantise
platform   PlatformHost — the OS boundary (files, dialogs, printing)          → core
geometry   PURE mm maths: Vec2, Segment, Path, offset, intersect, distribute   → core
domain     Part, Feature, derivation graph, stitching, validation              → geometry
document   Document, Command, undo/redo, selection                            → domain
persist    .lcp container, zod schemas, migrations                            → domain
render     DisplayList, canvas2d + svg backends                               → domain
editor     Viewport, tools, snapping, hit-testing, guides                     → render, document
export     ExportScene, svg/pdf/dxf writers                                   → domain, render
print      paginate, registration, calibration                                → export
ui         React panels and dialogs                                           → editor
cli        `lcad` — used by slash commands and CI                             → everything but ui
apps/desktop  Electron main/preload/renderer — the ONLY package importing Electron
```

Nothing imports `ui`, `editor`, or `apps/desktop`. `export` and `print` run headless.

## Conventions

- Tests are co-located: `src/foo.ts` beside `src/foo.test.ts`.
- Cross-package imports go through a package's `index.ts`, never into its internals.
- Clipper2 is imported in exactly one file: `geometry/internal/clipper.ts`.
- Ids are ULIDs from `core/id.ts` with an injectable entropy source. Never `Math.random()` directly.
- Nothing in a serialisation path calls `Date.now()` — take a clock as a parameter.
- Fonts are vendored in `assets/fonts/`. Never use a system font: it breaks PDF output and snapshot
  determinism.
- Stroke widths are **screen-constant** on canvas and **true millimetres** in export.
- Every new dependency needs an ADR in `docs/adr/`.

## Terminology

Use `docs/glossary.md`. Two that are routinely confused:

- **Pitch** — the nominal centre-to-centre spacing of a pricking iron (3.85 mm).
- **Spacing** — the *achieved* distance after distributing holes along a path, usually slightly
  different from pitch.

## Working here

Work proceeds in **vertical slices** from `docs/roadmap.md`. Each slice ends with the app running,
tests green, and something demonstrable. Do not build across layers without a working result.

For geometry and domain work, **write the tests first** — the test is the specification, and
plausible-but-wrong geometry is this project's characteristic failure mode.

Before starting a slice, read `docs/roadmap.md` and whichever of these applies:

| Working on | Read |
|---|---|
| `packages/geometry` | `docs/geometry.md`, especially §12 (definition of done) |
| `packages/domain` | `docs/domain-model.md`, `docs/glossary.md` |
| `packages/persist` | `docs/file-format.md` |
| `packages/export`, `packages/print` | `docs/printing.md` |
| Anything structural | `docs/architecture.md` |
| Tests | `docs/testing.md` |

Run `/geo-check` and `/arch-check` before considering a slice done. If a change invalidates
something in this file or in `docs/`, update it in the same commit.

## Do not

- Do not add a coordinate in pixels to any model type.
- Do not store computed paths, hole positions, lengths, or bounding boxes in the file.
- Do not scale content to fit a page. Add a page instead.
- Do not use `window.print()` or any browser print path.
- Do not put the document into Zustand, Redux, or React state. It has its own store.
- Do not put viewport, selection, or tool state into the persisted document.
- Do not write geometry code without a property test.
- Do not edit a shipped migration.
- Do not import Clipper outside `geometry/internal/clipper.ts`.
- Do not claim print accuracy is verified without a physical measurement recorded in
  `docs/print-verification-log.md`.
