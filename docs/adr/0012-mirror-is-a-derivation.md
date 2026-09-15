# 12. Mirror is a derivation; placement stays in feature geometry

**Status:** Accepted
**Date:** 2026-09-15

## Context

`product-spec.md` asks for mirroring about a horizontal, vertical or arbitrary axis (§5), and for
mirroring a part to make its left and right counterpart (§3). The counterpart is the valuable case:
a pair of panels that must stay matched.

The documents and the code describe two different architectures:

- `domain-model.md` §4 sketches a separate `mirror` geometry source alongside `offset`, `transform`
  and `boolean`, and §2 gives every part a placement `transform`.
- The code has one `derived` source carrying a typed `Derivation` op, adopted in the stitch
  derivation design (§2) for offsets and stitch holes. There is no part transform.

Two facts about today's transforms matter here:

- `transformFeatures` leaves a derived feature exactly where it was, without saying so.
- **Reflecting a rectangle is wrong. Verified:** a 10 × 5 rectangle at the origin with only its
  top-left corner rounded, mirrored across x = 0, should occupy x ∈ [−10, 0] with its rounded corner
  at the top right (arc centre (−2, 3)). `transformShape` keeps the origin and adds π to the
  rotation, which evaluates to x ∈ [0, 10] with the rounded corner at the bottom right (arc centre
  (8, 2)). A rotation about its own centre is not a reflection. The 3.7 round-trip property did not
  catch this, because a wrong mapping still round-trips.

## Decision

1. **Two actions, named differently.**
   - **Flip** changes the selected geometry in place: a one-off reflection through
     `transformFeatures`.
   - **Mirror** creates a counterpart that stays linked to its original.
2. **Flip requires `transformShape` to reflect correctly**, and that is fixed first:
   - a reflected rectangle's origin is recomputed from its reflected centre;
   - its corner radii are permuted to follow the corners they belonged to;
   - the fix is property-tested against transforming the evaluated path, the comparison that would
     have caught the defect.
3. **Mirror is a `Derivation`:**

   ```ts
   { type: 'mirror'; axis: { origin: Vec2; angleRad: Radians }; glideMm: Mm }
   ```

   A reflection across the axis, then a glide along it, which covers every orientation-reversing
   isometry. It preserves the feature's kind and a cut contour's role, and it maps anchors through
   the transform ([ADR 0010](0010-anchors-address-geometry.md)).
4. **Mirroring a part** creates a new part whose every feature is mirror-derived from its
   counterpart. The counterpart's holes are the original's holes reflected, so the two pieces have
   the same hole count by construction, which is the property v1.2 seam pairing needs.
5. **Gestures on a mirror-derived feature act on its parameters.**
   - Moving or rotating it updates the axis and glide.
   - Scaling it is refused, with the reason that a counterpart is the size of its original.
   - Shape edits happen on the original.
6. **Gestures on an offset-derived feature or a hole set alone are refused, with a reason**, instead
   of being silently ignored. Moving one together with its source moves the source, and it follows.
7. **No `Part.transform` in Phase 4.** A part moves by moving its root features, and its derived
   features follow. A mirrored part moves through its mirror parameters. Revisit when laying parts
   out on a hide (Phase 9) needs placement per part.

## Consequences

- A format version bump for the mirror op.
- `domain-model.md` §2 (part transform) and §4 (source kinds) are replaced by what the code does.
- Duplicating a part re-points the derivations inside it to the copies, so the copy stays
  self-consistent.
- `transformFeatures` gains refusal reasons for derived features, through the same query pattern
  as `refusedTransforms`.

## Alternatives rejected

- **A separate `mirror` source kind.** A second way of saying "derived", which every consumer of
  `GeometrySource` would have to learn.
- **Mirror as a baked copy only.** No link: editing the original does not reach the counterpart,
  and matching hole counts are not guaranteed.
- **Axis-only parameters.** They cannot express sliding a counterpart along its own axis.
- **`Part.transform` now.** It touches evaluation, hit-testing, snapping, export and the frames of
  cross-part derivations, and nothing in Phase 4 needs it once a mirror carries its own placement.
