# Move, rotate and scale (slice 3.7) — design

Date: 2026-09-05
Status: implemented (slice 3.7)
Governs: `geometry.md` §4.2 rule 1, applied to parametric shapes for the first time

## The rule this slice establishes

> **A transformation that cannot preserve a parametric shape's semantic representation must not
> silently demote it to another representation.**

Rule 1 of `geometry.md` §4.2 says parametric shapes are resized through their parameters rather than
by transforming their geometry. It does not say what happens when the parameters cannot express the
result. This slice answers that: the transform is **refused**, with a reason the user can read, and
the record is left exactly as it was.

Rule 2 — free-form paths convert their arcs to cubics — is unchanged and still applies to drawn
geometry, which has no parameters to protect.

## What each transform does to each shape

Derived from `ArcOps.transform`, which already implements this at the segment level. The parametric
arc mirrors `ArcSegment` field for field, so the parametric rule **delegates** to it rather than
restating it — §4.2 requires the decision to live in one place.

| | Translation | Rotation θ | Uniform scale *s* | Mirror | Non-uniform scale |
|---|---|---|---|---|---|
| **rect** | `origin` moves | `rotation += θ` | `origin`, `width`, `height`, `radii` scale | `rotation` reflects | `width`/`height` scale independently; radii stay circular |
| **circle** | `centre` moves | `centre` rotates only — a circle has no orientation | `radius × \|s\|` | `centre` mirrors | **refused** |
| **arc** | `centre` moves | `centre` rotates, `startAngle += θ` | `centre` scales, `radius × \|s\|` | `startAngle` from the transformed start direction, `sweepAngle` negates | **refused** |

> **Defect in the rect mirror row, found 2026-09-15.** As implemented, a reflection keeps the
> rectangle's origin and changes its rotation, which is a rotation about the rectangle's own centre,
> not a reflection: a panel mirrored across x = 0 stays where it was, with its rounded corners
> diagonally opposite. The round-trip property below could not catch it, because a wrong mapping
> still inverts. Fixed in slice 3.7b; see [ADR 0012](../../adr/0012-mirror-is-a-derivation.md).

Two details that are easy to get wrong and are already right in `ArcOps.transform`:

- The new start angle comes from **applying the matrix to the start direction**, not from pulling a
  rotation out of the matrix. That makes mirrors fall out for free instead of needing a special case.
- A mirror **negates the sweep**. An arc that bent one way bends the other in a mirror, and a sweep
  that kept its sign would silently draw the long way round.

A singular matrix — a zero scale on either axis — is refused for every shape, parametric or not: it
collapses the shape to nothing, and a zero-size part cannot be selected to delete.

## The rectangle gains a rotation

`rect` is `{ origin, width, height, radii }` — axis-aligned by construction, with nowhere to record
an angle. A rotated rectangle is therefore exactly as unrepresentable as a non-uniformly scaled arc,
and rotating a strap is not an exotic thing to want.

`domain-model.md` already gives `ellipse` and `polygon` a `rotationRad` and never gives one to
`rect`, which reads as an oversight rather than a decision. So `rect` gains
`rotation: Radians`, defaulting to zero.

**No geometry changes.** The evaluator builds the axis-aligned rounded rectangle exactly as it does
today and then applies a rotation about the rectangle's own centre. Rotation is a similarity, so the
corner arcs stay arcs through `PathOps.transform` — the corners of a rotated panel are still round,
not elliptical, which is rule 1's own worked example holding under a second transform.

**Not `Part.transform`.** `domain-model.md:38` documents a placement transform on the part, and that
remains the right long-term home for placement. It touches the part schema, `evaluate`, hit-testing
and snapping, so it is its own slice, not a sub-task of this one. A rotation on the shape is what
3.7 needs and no more.

## The format

Stays at version 1, with `rotation` added to the rect schema **defaulting to zero**, so the existing
`fixtures/format/v1.lcp` — written before this field existed — still opens and reads as unrotated.

That fixture now earns its keep twice: it is the format baseline, and it is a real backward
compatibility test for a field added after it was written. It is **not** regenerated for this slice;
regenerating it would destroy exactly the property that makes it useful here.

The one-time latitude recorded in the 3.6b design still applies and still expires at the first
release. This is the last field that gets added this way.

## Refusing, visibly

`transformShape` returns a `Result`, so a refusal carries a reason rather than a boolean. The reason
is written for the person holding the mouse, not the developer:

> A circular arc cannot survive a non-uniform scale — it would become an elliptical arc, which this
> editor cannot represent. Scale it evenly, or convert it to a drawn path first.

Both the tool and the property panel call the same function: the tool to decide whether to apply,
the panel to explain why nothing moved. One implementation, two callers, no second opinion.

Features whose shapes refuse are **left untouched** while the rest of the selection transforms. A
mixed selection of rectangles and arcs under a non-uniform scale moves the rectangles and reports
the arcs, rather than failing wholesale — but nothing is converted behind the user's back either way.

## What this slice does not build

- **`Part.transform`.** Placement stays where `domain-model.md` puts it, in its own slice.
- **"Convert to drawn path".** The explicit, opt-in escape hatch for a shape the user *wants*
  flattened. Recorded as slice 3.12; it must state plainly that the shape stops being editable as a
  circle or arc.
- **A modal numeric transform dialog.** Exact entry already exists in the property panel, which is
  where the numbers for a single selection live. A dialog for multi-selection transforms is worth
  having, and is not worth blocking this slice on.
- **Overlay isolation.** Slice 3.11, deliberately kept separate.

## Testing

- Property tests in `domain` for every row of the table, including reflex sweeps and mirrors, and a
  round trip: transform by `m`, then by `invert(m)`, recovers the original parameters.
- A test that a non-uniform scale leaves an arc's record **byte-identical**, not merely close.
- A test that the committed v1 fixture — which has no `rotation` field — still opens.
- Tool tests for the three gestures, and that a refused transform leaves the document unchanged.
- Playwright: rotate a rectangle, scale a circle evenly, and watch a non-uniform scale on an arc
  refuse with its reason on screen.
