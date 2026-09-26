# 10. Anchors are the only way to address a place on a feature

**Status:** Accepted; point 5 amended 2026-09-26
**Date:** 2026-09-15

## Context

Slice 4.4 addresses a partial stitch run by **anchors**, a feature's durable landmarks such as a
rectangle's four corners, rather than by segment indices. The reason is concrete: `roundedRect`
emits eight segments with 8 mm corners and four with none, so an index would silently move a run to
a different edge the first time a radius changed. `packages/domain/src/anchors.ts` implements
anchors for drawn paths and parametric shapes, and returns **none for a derived feature**.

Phase 4 adds three more things that must name a place on geometry, and all of them meet derived
features:

- **Measurements between corners.** `domain-model.md` §3.7 specifies these with `segmentIndex`, the
  representation 4.4 rejected.
- **A seam-allowance outline**, which is derived. Its corners are exactly what a measurement or a
  later stitch run needs to name.
- **A mirrored counterpart**, also derived.

Validation needs locations as well, and v1.2 seam pairing will address runs on two parts.

## Decision

1. **Nothing addresses geometry by segment index.** A place on a feature is an anchor:
   `(featureId, anchor index)`.
2. **Root features define their anchors** from their parameters where they have them (a
   rectangle's four corners, whatever its radii) and from their corners otherwise (drawn paths),
   as `anchors.ts` does today.
3. **Derived features carry their source's anchors, under the same indices.** Each derivation
   defines the mapping, because only it knows the correspondence:
   - a mirror maps each anchor through its transform;
   - an offset maps each source corner to the corner it produced;
   - a stitch hole set exposes its stitch line's anchors.

   The mapping comes from the code that built the geometry. It is never recovered by looking for
   the nearest point, which lands on the wrong corner when a derivation removes one, and at the
   ends of a partial run.
4. **An anchor with no image is missing, not moved.** An inset deep enough to swallow a corner
   removes that anchor. Anything that names it fails with `ANCHOR_MISSING` rather than attaching to
   a neighbour.
5. **Drawn paths gain vertex ids before vertex editing ships (slice 3.9).** Their anchors follow
   corner order today, and inserting a vertex would renumber them.

## Consequences

Built in slice 4.4b
([design](../superpowers/specs/2026-09-16-anchors-through-derivations-design.md)), except the mirror
mapping of point 3, which arrives with the op in 4.8. `offsetPathTraced` returns the correspondence;
`ResolvedFeature.anchors` carries it; a missing anchor is `null` and keeps its index.

- Measurements (4.10), runs on derived features, validation locations and v1.2 seams share one
  addressing scheme.
- Anchors are resolved with the geometry rather than recomputed from parameters: `anchorsOf` still
  answers for roots, and evaluation carries the result through the chain.
- `offsetPath` has to report which input corner produced which output corner. It is still pure, and
  `offsetPathTraced` returns more; `offsetPath` is a wrapper over it.
- The "known hole" in `2026-09-05-stitch-derivation-design.md` §4 becomes a hard prerequisite of
  slice 3.9, not a note.

## Amendment — point 5, 2026-09-26 (slice 3.9b)

Point 5 is met **without vertex ids**. By the time vertex editing was built, 1.0 and 1.1 had
shipped, so ids stored per point meant a format version, a migration of every existing reference
from a corner index to an id, and files older builds refuse. The same guarantee is had without
touching the file:

- Only commands mutate the document (invariant 5), so every point edit passes through one place:
  `editPathPoint` in `packages/document`.
- The geometry op that makes the edit reports which old point and segment became which new one
  (`PathEdit`). `cornerSites` says which point or arc each corner sits on, in anchor order, and
  `cornersThroughEdit` follows each corner through the edit to its new index.
- The command renumbers, in the same step, every run and dimension that names a corner of the path
  **or of anything derived from it** — which carries the path's corners under the path's own
  numbers (point 3).
- An edit that takes an attached corner away is refused (`CORNER_IN_USE`), never resolved by
  attaching to a neighbour. An index that was already missing stays exactly as missing.

A property test plays random point edits against random outlines and dimensions and holds each
accepted edit to leaving every dimension end on the same place of the drawing.

**What would bring vertex ids back:** a reference that outlives a single command — a seam pair
across two parts edited in separate steps (v1.2), or a reference from outside the document. Neither
exists yet.

## Alternatives rejected

- **Segment indices** (`domain-model.md` §3.7). They move silently when a radius changes.
- **Nearest-point lookup on derived geometry.** It attaches to the wrong corner when a derivation
  removes one, and clamps to the ends of partial runs.
- **Coordinates stored in the measurement.** They go stale silently, and a dimension that silently
  goes stale is worse than no dimension.
