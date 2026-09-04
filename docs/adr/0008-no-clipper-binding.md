# 8. No Clipper binding

**Status:** Accepted — no Clipper binding, and no further search
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

**No Clipper binding, and no further search for one.** Both candidates were tried and both failed,
for unrelated reasons — one computes wrong answers, the other cannot run in this application at
all. A third would be a third investigation, and the cost of those has already exceeded what the
capability is worth today.

**Robust offsetting will be written here instead**, as slice 9.11, alongside boolean operations,
which share its hard part. `pnpm depcruise` now refuses a Clipper import from anywhere rather than
merely confining it to one file.

Nothing before it needs it. Analytic offsetting (Tier 1, slice 1.9) handles every convex outline of
lines and arcs, which is every shape the drawing tools produce that a leatherworker actually cuts. A
concave outline can be drawn, measured, saved and printed; only deriving an offset from one is
refused, and refused with a validation error naming the shape rather than a wrong answer.

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
- The `.dependency-cruiser.cjs` rule is now `no-clipper` and forbids the import from anywhere, so
  this decision is enforced rather than remembered.
- **A correct bounding box proves nothing.** Every wrong result here had the right bounds and the
  wrong area: a self-intersecting ring loses area to the shoelace sum while still spanning the same
  extent. Whatever eventually implements this, its tests measure area. That mistake was made twice
  in one session — once by the library, once by me reading its output.
- The branch `slice/1.9-clipper-offset` can be deleted whenever convenient. Nothing on it is worth
  keeping now that this decision is final; what mattered is recorded above.
