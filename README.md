# LeatherCAD

Desktop application for designing leathercraft patterns — wallets, card holders, cases, straps,
bags — that print at exact **1:1 scale**.

Draw parts with real millimetre dimensions, set the stitch line as a live offset from the cut edge,
generate stitch holes at your pricking iron's pitch, and print a tiled, registration-marked template
you can glue to card and cut.

Electron + TypeScript. Linux first. Apache-2.0.

> **Status: early scaffolding.** The Electron shell runs and the platform boundary is wired, but
> there is nothing to draw with yet. Next up is the geometry core —
> [`docs/roadmap.md`](docs/roadmap.md) §4, slice 1.1.

## Why not a general vector editor

Geometry here carries craft meaning. A path is not "a black stroke" — it is a *cut contour* or a
*stitch line*, and its appearance, export layer, validation rules, and parametric behaviour follow
from that. Change a panel from 105 mm to 110 mm and its stitch line and 120 stitch holes update
themselves.

## Documentation

| Document | Contents |
|---|---|
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

[`CLAUDE.md`](CLAUDE.md) holds the invariants that must not be violated.

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
pnpm package        # builds the AppImage into apps/desktop/release/
```

Individual checks: `pnpm typecheck`, `pnpm lint`, `pnpm depcruise`, `pnpm knip`, `pnpm test`.
Slower ones, run weekly and nightly in CI: `pnpm bench`, `pnpm test:mutation:geometry`,
`pnpm test:mutation:domain`.

`pnpm depcruise` enforces the package layering from
[`docs/architecture.md`](docs/architecture.md) §2. A violation fails the build — that is deliberate,
and the rules are documented inline in `.dependency-cruiser.cjs`.

Releases are cut by merging the release pull request that release-please keeps open; the AppImage
and an SBOM are attached to the GitHub release. See
[ADR 0014](docs/adr/0014-electron-builder-and-release-please.md).

The app keeps a log in `~/.local/state/leathercad/logs/main.log`, and crash dumps beside it. Nothing
is uploaded. Attach the log to a bug report.

## The promise

A line drawn as 100 mm measures 100 mm on paper. Every architectural decision in the documents above
serves that, and every printed page carries a 50 mm square so you can check it with a steel rule.
