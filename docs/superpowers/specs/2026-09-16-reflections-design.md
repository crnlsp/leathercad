# Reflections through `transformShape` (slice 3.7b) — design

**Date:** 2026-09-16
**Status:** Accepted with the [Phase 4 reconciliation](2026-09-15-phase-4-reconciliation-design.md)
**Decisions:** [ADR 0012](../../adr/0012-mirror-is-a-derivation.md) (prerequisite of), `geometry.md` §4.2 rule 1
**Defect fixed:** D2

---

## The defect

Reflecting a rectangle transformed its `origin` and added the transform's rotation to its
`rotation`. Both are wrong for a mirror, and wrong in a way that still looks plausible:

- `pathForShape` builds an axis-aligned box from `origin` and **then turns it about its own centre**,
  so transforming `origin` on its own moves the box somewhere the rotation immediately swings away
  from;
- a reflection is not a rotation. Adding one turns the rectangle half round instead of mirroring it,
  which for a rectangle looks almost right — the outline is identical — until the rounded corners
  are seen to be **diagonally opposite** rather than swapped across the axis.

Measured: a 10 × 5 panel mirrored across x = 0 landed at x ∈ [0, 10] instead of x ∈ [−10, 0].

The 3.7 round-trip test could not catch it, because a wrong mapping still inverts: applying the
mirror twice returned the original either way.

## Acceptance criteria

1. A panel mirrored across a vertical axis lands on the other side of it.
2. Its rounded corners swap **across** the axis — adjacent, not diagonal.
3. A flipped panel stays lying the way it was, rather than reporting a half turn.
4. Flipping twice returns exactly the original parameters.
5. A label refuses to flip, saying it would read backwards, instead of coming out rotated.
6. A *Flip* command, in the panel, mirroring the selection about its own centre.

## What the fix is

Everything is computed from the rectangle's **centre** and its own two axes, which is what the
parameters mean:

- `width` and `height` scale by the length of the image of each of the rectangle's own axes, so a
  turned rectangle scales correctly without the matrix having to be inspected. For a similarity both
  come from the determinant instead, which keeps a plain rotation exact rather than leaving a 105 mm
  panel 104.99999999999999 mm wide.
- `origin` is read back out of the transformed centre, never transformed on its own.
- A mirror flips the rectangle's frame from right- to left-handed, which no `rotation` can express,
  so **one of its two axes is flipped** to restore handedness and the corner radii travel with it.
  Either axis works; the one chosen is whichever leaves the rectangle closest to the way it was
  lying, so a mirrored panel comes back the same way up instead of reporting a half turn. The
  resulting angle is normalised into (−π, π] — for mirrors only, so ordinary rotations still
  accumulate as the panel's stepper implies.

## Judged against the path, not against itself

Every reflection test compares `pathForShape(transformShape(shape, m))` with
`PathOps.transform(pathForShape(shape), m)` — the shape transformed through its parameters against
the drawn path transformed directly. That is the one comparison a wrong mapping cannot satisfy in
the same direction, which is exactly how the round-trip test was fooled. `pathForShape` is exported
for it.

Sampled as point sets rather than compared structurally: a reflection reverses a path's direction,
so the same curve legitimately comes back with its winding flipped and its start elsewhere.

## The Flip command

`flipFeatures(ids, 'horizontal' | 'vertical')` mirrors the selection about **its own centre** — the
flip a person means when they flip one piece: it stays where it is and faces the other way. Named
for what the user sees, as every drawing tool names it.

Mirroring a feature *to* somewhere — a linked counterpart across a fold — is a derivation, and that
is slice 4.8. Nothing of it is pulled forward here.

Refusals come through the paths that already exist: a derived feature refuses because it follows its
source (`DERIVED_MOVED_ALONE`), and a label refuses with a new code. `flipRefusal(project, ids, axis)`
asks the same check the command makes, so the panel disables a Flip button that would do nothing and
shows the reason as its title, rather than offering a gesture that quietly fails (X1). A flip
everything refused returns the document **by identity**, so it earns no undo entry.

### A label would read backwards

`transformTextSource` accepted mirrors, because a mirror **is** a similarity — so a flipped label
would have come out rotated: the words the right way round, in the wrong place. That is the same
silent wrongness as D2 itself, and this slice creates the gesture that reaches it, so it is refused
here with `TEXT_WOULD_READ_BACKWARDS` rather than left for 4.8 to discover.

## Deliberately not here

- **The mirror derivation**, its axis-and-glide placement, and mirrored anchors. Slice 4.8.
- **Duplicate part**, which shares the reflection maths but needs the parts panel. Slice 4.3.
- **Flipping a drawn path's vertices**: already correct, since `PathOps.transform` reflects points
  and `SegmentOps.ArcOps.transform` negates an arc's sweep.

## Tests

- The measured defect, as a test: the mirrored panel's bounding box.
- Corners swap across the axis, not diagonally; the panel keeps its rotation; twice is identity.
- Path-equality for horizontal, vertical and already-turned rectangles, for circles and for arcs,
  plus a property over random rectangles and random axes.
- Command tests: flipping twice restores every parameter exactly, on both axes; width, height and
  the four radii survive a flip as a set; a panel turned 30° comes back turned 30° the other way and
  never acquires a half turn; flip about the group's centre; one undoable step.
- Refusals: a label and a derived feature, through `refusedTransforms` **and** through
  `flipRefusal`, each leaving the document unchanged by identity and the undo history untouched.
- **Structure as well as position.** Sampling proves two curves lie on top of each other; it cannot
  prove the result is still a rectangle. Every reflection case also checks the path comes back with
  the same alternation of straights and corner arcs, closed, with the same four radii — moved to
  different corners, not resized or lost — and the property test asserts both oracles on every
  case.
- E2E: set a corner radius, flip, watch it cross the panel and come back with one Undo.
