# LeatherCAD

Desktop application for designing leathercraft patterns — wallets, card holders, cases, straps,
bags — that print at exact **1:1 scale**.

Draw parts with real millimetre dimensions, set the stitch line as a live offset from the cut edge,
generate stitch holes at your pricking iron's pitch, and print a tiled, registration-marked template
you can glue to card and cut.

Electron + TypeScript. Linux first. Apache-2.0.

> **Status: planning.** The architecture and roadmap are written; no implementation yet.
> Start at [`docs/roadmap.md`](docs/roadmap.md) §4, slice 0.1.

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

## The promise

A line drawn as 100 mm measures 100 mm on paper. Every architectural decision in the documents above
serves that, and every printed page carries a 50 mm square so you can check it with a steel rule.
