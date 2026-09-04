# 8. No Clipper binding yet

**Status:** Rejected — both candidates, for now
**Date:** 2026-09-04

## Context

[geometry.md](../geometry.md) §6.2 plans two tiers of offsetting. Tier 1 is analytic and exact but
handles only convex paths of lines and arcs. Tier 2 flattens and clips, handles everything, and was
to be bought from Clipper2 rather than written — §6.1 explains that correct self-intersection
pruning at concave corners is a research problem, not a slice.

Slice 1.9 built Tier 2 first, as planned, and could not finish it. This records why, so that the
investigation is not repeated.

Two constraints narrow the field. **`packages/geometry` is pure** (CLAUDE.md invariant 3): no DOM,
no filesystem, no Node built-ins, and `offsetPath` is called during evaluation on every document
revision, so it must stay synchronous. **Determinism is load-bearing** ([testing.md](../testing.md)
§8): golden tests, SVG snapshots and byte-stable saves all assume identical output everywhere.

## Decision

**Neither binding is adopted.** Tier 2 is deferred to slice 3.11, to be built immediately before
the polyline tool (3.5) — the first slice that lets a user draw a shape Tier 1 cannot offset.

Nothing the application can currently draw needs Tier 2. The rectangle tool is the only drawing
tool that exists, and Tier 1 offsets every shape it produces exactly, keeping arcs as arcs.

## Alternatives rejected

### clipper2-js 1.2.4 — computes offsets wrongly

The only pure-JavaScript Clipper2 port, and therefore the only candidate that preserved both purity
and synchronicity. Its offsetting is incorrect.

Given a correctly closed ring it returns a *pinwheel*: the output visits each source vertex between
successive offset corners, producing a self-intersecting ring whose bounding box looks right and
whose area is quietly under the truth. Offsetting outward by 10 mm:

| Shape and join | Returned | Correct |
|---|---|---|
| 100 mm square, miter | 12150 mm² | 14400 mm² |
| 100 mm square, round | 12000 mm² | 14314 mm² |
| Hexagon, R = 50 mm, miter | 8837 mm² | 9841 mm² |
| Hexagon, R = 50 mm, round | 7995 mm² | 9809 mm² |

Not join-specific, not shape-specific, and not a tolerance setting: `ArcTolerance` from its default
down to 0.005 produces byte-identical output. The bounding box is right in every case, which is
what makes it dangerous — a check on bounds passes while the geometry is wrong.

One trap found on the way, worth keeping whoever revisits this: **the ring must be closed
explicitly, with the first vertex repeated, even under `EndType.Polygon`.** Given an unclosed ring
the library does not fail. It offsets as though there were a spike at the last vertex.

### clipper2-wasm 0.4.0 — blocked by the renderer's CSP

The faithful Clipper2 build, actively maintained. It cannot run in this application at all.

`apps/desktop/src/renderer/index.html` sets `script-src 'self'` with no `'wasm-unsafe-eval'`, so
Chromium refuses to compile any WebAssembly in the renderer: a 100-byte test module fails with the
same CSP error as a 220 KB one. Adopting it would mean weakening the script policy of an
application that opens user files.

Synchronous instantiation would not rescue it even then. The module is 213 KB, far past the 4 KB
ceiling on main-thread `WebAssembly.Module`, so an async initialisation would have to be threaded
through `geometry`, `domain`, `document` and every caller — and the memoisation in slice 4.1
assumes synchronous evaluation.

### Writing our own pruning

[geometry.md](../geometry.md) §6.1. Detecting and removing the loops a concave inward offset creates
is the hard part of the problem, and the reason to buy rather than build.

## Consequences

- Tier 1 is what `offsetPath` does: convex closed paths of lines and arcs, exactly, with no
  tolerance parameter because nothing is approximated. Open paths, cubics and non-convex paths are
  rejected with an error naming Tier 2.
- The abandoned Tier 2 work — the wrapper, the property suite, and the original form of this ADR
  proposing clipper2-js — is on the branch `slice/1.9-clipper-offset`. It is unmerged and its tests
  do not pass.
- The `clipper-isolated` rule in `.dependency-cruiser.cjs` stays. It costs nothing while no Clipper
  exists and is the reason a binding can be swapped in later by touching one file.
- Revisit at slice 3.11, when the shapes that need it are known. That is a better position to judge
  the trade-off from than guessing now.
