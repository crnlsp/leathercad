# 9. Explicit resolution when deleting a feature others depend on

**Status:** Accepted
**Date:** 2026-09-15

## Context

Two kinds of edge connect features. A **derivation** builds one feature's geometry from another: a
stitch line inset from an outline, holes along a stitch line, and in Phase 4 an outline offset
outward from a stitch line (seam allowance) and a mirrored counterpart. A **reference** points at
another feature's geometry without being built from it: a measurement between two corners.

Two decisions about deleting the far end of such an edge are on record, and they disagree:

- `domain-model.md` §4.5 names **bake** the default: convert dependents to drawn geometry, then
  delete.
- The stitch derivation design (`2026-09-05-stitch-derivation-design.md` §3) chose **cascade**, and
  that is what the code does. `deleteFeatures` removes every dependent transitively, then removes
  any part the deletion left empty, in one undo step.

Cascade was harmless while the only derived features were stitch lines and holes. Seam allowance
makes the outline itself derivable: deleting the stitch line it follows would delete the part's cut
line, the one feature a part exists to carry. Deleting an original would delete its mirrored
counterpart. Bake is no better. It silently turns "3.5 mm outside that stitch line" into dead
coordinates, losing the design intent with no sign that anything changed.

Both fail the same way: the user named one feature, and the document changed others without telling
them.

## Decision

**A delete never changes a feature the user did not name without first showing them, and never
leaves a reference dangling.**

1. **Nothing depends on it:** the delete happens at once, as one undo step.
2. **Something outside the requested set depends on it:** nothing happens until the user resolves
   it, shown every dependent grouped by part and by chain. There are three choices:
   - **Delete them too.** The whole downstream chain goes, in one undo step.
   - **Keep them, frozen.** Each *direct* derived dependent keeps its last resolved geometry as
     drawn geometry, and its own dependents stay linked to it. The property panel says it was
     frozen and from what.
   - **Cancel.**

   Some dependents have no drawn form to freeze into, and both resolutions list them as deleted:
   **references**, because a dimension to nothing measures nothing, and **stitch hole sets**, which
   exist only as holes placed along a line. Freezing a stitch line's holes without the line would
   be inventing a hand-placed hole set, which the model deliberately does not have.
3. **Re-pointing is how a relationship is kept.** Any derived feature can be pointed at another
   compatible source from the property panel, and the dialog says so. That is what "replace this
   outline but keep my stitching" means.
4. **Parts are removed only by deleting the part.** Deleting a part's last feature leaves an empty,
   named part. It is reported (`EMPTY_PART`), not removed.
5. **One function answers "what would this delete".** `planDelete(project, ids)` is pure. The dialog
   reads it and the command enforces it: `deleteFeatures` takes the resolution explicitly, and
   refuses, changing nothing, when dependents exist and no resolution was given.
6. **A file with a dangling reference is refused at load**, naming the feature. Dangling references
   are unrepresentable, not reported.

## Consequences

- Supersedes the cascade in `2026-09-05-stitch-derivation-design.md` §3 and the bake default in
  `domain-model.md` §4.5.
- The E2E test "deleting an outline takes its stitch line and holes with it" becomes a dialog flow,
  and the document tests of cascade become tests of each resolution.
- `BROKEN_DERIVATION` can no longer mean "its source was deleted". A source that fails to *build* is
  still possible, and is reported as `SOURCE_FAILED` ([ADR 0013](0013-invariants-are-enforced-rules-are-reported.md)).
- Deleting a chain costs one more click. That click is the point.

## Alternatives rejected

- **Silent cascade** (current behaviour). Fine for stitch lines; deletes a part's outline once
  outlines can be derived.
- **Silent bake** (`domain-model.md` §4.5). Loses intent without saying so, and leaves a document that
  looks parametric and is not.
- **Block until the dependents are deleted by hand.** Predictable, but a three-link chain becomes
  three deletes in reverse order, and the user has to work out the order.
- **Leave dependents in an error state.** Documents fill with rubble, and "every reference resolves"
  stops being something the rest of the code can rely on.
