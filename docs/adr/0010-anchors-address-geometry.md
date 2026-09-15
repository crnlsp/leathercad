# 10. Anchors are the only way to address a place on a feature

**Status:** Accepted
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

- Measurements (4.10), runs on derived features, validation locations and v1.2 seams share one
  addressing scheme.
- `anchorsOf` resolves through the derivation chain instead of reading one source.
- `offsetPath` has to report which input corner produced which output corner. It is still pure, and
  it returns more.
- The "known hole" in `2026-09-05-stitch-derivation-design.md` §4 becomes a hard prerequisite of
  slice 3.9, not a note.

## Alternatives rejected

- **Segment indices** (`domain-model.md` §3.7). They move silently when a radius changes.
- **Nearest-point lookup on derived geometry.** It attaches to the wrong corner when a derivation
  removes one, and clamps to the ends of partial runs.
- **Coordinates stored in the measurement.** They go stale silently, and a dimension that silently
  goes stale is worse than no dimension.
