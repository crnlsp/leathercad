# LeatherCAD

Desktop application for designing leathercraft patterns — wallets, card holders, cases, straps,
bags — that print at exact **1:1 scale**.

Draw parts in real millimetres, set the stitch line as a live offset from the cut edge, put holes
along it at your pricking iron's pitch, and print a template you can glue to card and cut. A part
bigger than the paper prints across several sheets, with join lines and registration crosses.

Linux, Windows and macOS. Electron + TypeScript. Apache-2.0.

**[Download](https://github.com/crnlsp/leathercad/releases/latest)** ·
**[Getting started](docs/getting-started.md)**

The installers are not code-signed, so Windows and macOS warn the first time you open LeatherCAD.
[Getting started](docs/getting-started.md) says how to open it anyway, and how to check a download.

## What it does

- **Parts** from rectangles, circles, arcs, lines and polylines with arc segments — a pocket with a
  thumb scoop is one outline. Cut-outs, fold lines, marking lines, hardware holes, text labels and
  dimensions join the part they are drawn on.
- **Stitching that follows the edge.** A stitch line is an inset of its outline, holes are placed
  along it at the iron's pitch, and a seam allowance can grow outward from the stitching instead.
  Change a panel from 105 mm to 110 mm and its stitch line and holes update themselves.
- **Problems stated, not hidden.** Holes too close to an edge, spacing far from the iron's pitch, a
  stitch line whose outline is gone: each is listed, and shown where it is.
- **See the paper before you print.** The paper list says what each choice prints — *3 sheets of
  A4, portrait*, *1 sheet of A4, landscape* — Parts says which sheet each part is on, and the
  Sheets view shows the pieces on the paper exactly as the PDF will, taped joins included.
- **Print at 1:1.** Export writes a vector PDF on A5, A4, A3, Letter or Legal, portrait or
  landscape. Nothing is ever scaled to fit: a part too big for the sheet is tiled across several.
  Every sheet carries a 50 mm square and a 100 mm ruler to check the print with.
- **Your work is kept.** Closing with unsaved changes asks first, and after a crash the app offers
  the unsaved work back.

## Why not a general vector editor

Geometry here carries craft meaning. A path is not "a black stroke" — it is a *cut contour* or a
*stitch line*, and its appearance, export layer, validation rules, and parametric behaviour follow
from that.

## Documentation

| Document | Contents |
|---|---|
| [getting-started.md](docs/getting-started.md) | Install, draw, stitch, print — for makers |
| [product-spec.md](docs/product-spec.md) | Scope, MVP boundary, deferred features |
| [architecture.md](docs/architecture.md) | Stack, layering, data flow, canvas system, risks |
| [domain-model.md](docs/domain-model.md) | Features, derivation graph, stitching, validation |
| [geometry.md](docs/geometry.md) | Representation, numerics, offsetting, algorithms |
| [file-format.md](docs/file-format.md) | The `.lcp` format, versioning, migrations |
| [printing.md](docs/printing.md) | Export and print pipeline, 1:1 accuracy budget |
| [testing.md](docs/testing.md) | Test layers, property catalogue, edge cases |
| [roadmap.md](docs/roadmap.md) | Repo structure, workflow, slices, milestones |
| [glossary.md](docs/glossary.md) | Leathercraft vocabulary used throughout |
| [claude-code-setup.md](docs/claude-code-setup.md) | Skills, commands, hooks, and what to skip |

[`CLAUDE.md`](CLAUDE.md) holds the invariants that must not be violated. To report a security
problem, see [`SECURITY.md`](SECURITY.md): privately, never in a public issue.

## Development

Requires **Node 22** and **pnpm 11**. The exact versions are pinned in `.node-version` and in
`package.json`'s `packageManager`; any installed pnpm switches itself to the pinned one, and CI
reads the same pins.

pnpm is not bundled with Node, and Arch's `nodejs-lts-jod` package does not ship corepack. Install
it system-wide:

```bash
sudo pacman -S pnpm
```

Then:

```bash
pnpm install
pnpm dev        # launches the app
```

```bash
pnpm check          # typecheck + lint + layering + dead code + tests
pnpm test:e2e       # builds, then Playwright drives the real Electron app
pnpm test:visual    # pixel diffs in the pinned Playwright container (needs Docker)
pnpm test:packaged  # packages the app and smoke-tests the packaged binary
pnpm package        # this platform's installer, in apps/desktop/release/
```

Individual checks: `pnpm typecheck`, `pnpm lint`, `pnpm depcruise`, `pnpm knip`, `pnpm test`.
Slower ones, run weekly and nightly in CI: `pnpm bench`, `pnpm test:mutation:geometry`,
`pnpm test:mutation:domain`.

`pnpm depcruise` enforces the package layering from
[`docs/architecture.md`](docs/architecture.md) §2. A violation fails the build — that is deliberate,
and the rules are documented inline in `.dependency-cruiser.cjs`.

Releases are cut by merging the release pull request that release-please keeps open; the Linux
AppImage, the Windows installer, the macOS dmg and an SBOM are attached to the GitHub release. See
[ADR 0014](docs/adr/0014-electron-builder-and-release-please.md).

The app keeps a log, and crash dumps beside it: *Help → Show Log Folder* opens the folder
(`~/.local/state/leathercad/logs/` on Linux). Nothing is uploaded. Attach the log to a bug report.

The licences of everything the app ships are in *Help → Third-Party Notices*, written at build time
from what the bundles actually contain, and in `THIRD_PARTY_NOTICES.txt` beside the installed app.

## The promise

A line drawn as 100 mm measures 100 mm on paper. Every architectural decision in the documents above
serves that, and every printed page carries a 50 mm square so you can check it with a steel rule.

The PDF is measured automatically on every change, on all three platforms
(`e2e/print-verification.spec.ts`). Paper is measured by a person, and recorded in
[`docs/print-verification-log.md`](docs/print-verification-log.md).
