# Circle and arc tools (slice 3.6) — design

Date: 2026-09-04
Status: implemented (3.6 circle, 3.6b arc)
Follows: slice 3.5a (tool palette), which reserved C and A in the Draw group

## Goal

Draw a circle by dragging from its centre, and an arc through three points. Both stay editable
afterwards as exact numbers, because that is the reason this application exists rather than a vector
editor.

## Two slices, and the seam between them

The work splits along the file format, which is the only irreversible part of it.

| Slice | Owns | Touches the format |
|---|---|---|
| **3.6 — Circle** | The panel refactor, the circle tool, the circle editor | No |
| **3.6b — Arc** | The `arc` shape variant, the arc tool, the arc editor, the schema and its fixture | Yes |

The seam is real rather than administrative: `circle` is **already** a `ParametricShape`, already in
the zod schema and already evaluated, so the circle slice cannot touch `packages/persist` at all.
The arc slice owns every persistence change in one place, where it can be reviewed as one decision.

3.6b depends on 3.6 only for the panel seam, and is otherwise independent.

## Acceptance criteria

Things a person can check by using the app.

**Slice 3.6 — Circle**

- Dragging from a point creates a circle centred there, as a **cut contour** on a new part named
  `Panel`; the drag shows a live diameter
- A click without a drag creates nothing
- Escape mid-drag abandons, leaving the document unchanged
- Undo removes it in one step
- The property panel shows the circle's centre and **Diameter**
- Typing 40 into Diameter makes it exactly 40 mm across
- C selects the tool, from the keyboard and from the Draw group in the rail
- Rectangles keep every field and behaviour they have today

**Slice 3.6b — Arc**

- Click start, click end, move, click creates an arc as a **marking-line** on a new part named
  `Line` — an open run, per slice 3.5's rule that a line with two ends is not an outline and must
  not be filed as something to cut out
- The arc passes through the point that was hovered when the third click landed
- **Shift constrains the placement of each arc point to 15° from the previous one**, matching the
  polyline tool. One constraint, one meaning, across every tool that places points
- Three collinear clicks create nothing — not a zero-radius part, not a straight line
- Escape abandons at any stage; Backspace drops back one point
- Undo removes it in one step
- The property panel shows the arc's centre, radius, start angle and sweep, in degrees
- A selects the tool, from the keyboard and from the Draw group in the rail
- A project containing an arc saves and reopens with its parameters intact

## The model

`ArcSegment` is already `{ centre, radius, startAngle, sweepAngle }`. The new `arc` variant of
`ParametricShape` mirrors it field for field:

```ts
| { readonly type: 'arc';
    readonly centre: Vec2;
    readonly radius: Mm;
    readonly startAngle: Radians;
    readonly sweepAngle: Radians }
```

**Sweep, not an end angle.** An end angle alone does not say which way round the circle the arc
travelled, and the whole point of the three-point gesture is that the middle point decides. Storing
the sweep keeps that decision in the record instead of re-deriving it — wrongly — on every
evaluation.

**Parametric, not a path.** An arc stored as coordinates could never be retyped as "exactly 40 mm
radius", which is the product promise. It also keeps invariant 4 intact and lets slice 3.7 resize it
through `geometry.md` §4.2 rule 1, where parametric shapes are resized through their parameters and
stay circular, rather than rule 2, where free-form arcs are converted to cubics.

Drawn polylines remain the only geometry persisted as coordinates. That was slice 3.5's decision and
this slice does not widen it.

## Why this needs no new geometry code

`arcThroughPoints(a, b, c)` already solves the circumcentre, radius, start angle and sweep, and
returns a path whose single segment carries exactly those four numbers. The arc tool calls it with
the three clicked points and reads the parameters straight off the segment it gets back.

It also already guards both degenerate cases: coincident points throw `RangeError`, and collinear
points return a path holding a **line** segment rather than an arc. The tool therefore inspects the
returned segment's `kind` and declines anything that is not `'arc'` — which is precisely the
"three collinear clicks create nothing" criterion, met by reading what the engine already says
rather than by re-testing for collinearity at the tool.

The evaluator case is one line: `PathOps.open([arc(centre, radius, startAngle, sweepAngle)])`.

Nothing under `packages/geometry` changes in either slice.

## The file format

A circle needs no format change at all.

For the arc, the format **stays at version 1** and the `arc` variant is added to the existing v1
schema. Nothing has been released — no git tag, no GitHub release, `version` is `0.0.0` — so there
is no external backward-compatibility commitment to preserve, and spending a version number to
protect files that exist only on one developer's disk would buy nothing while permanently adding a
link to a chain that may never be edited or deleted.

**This is a one-time latitude, not a precedent.** File-format §4.2 rule 1 binds from the first
release onward: after that, a new persisted variant means a version bump, a fixture, and a migration
where one is needed. The rule exists so this judgement is never made under pressure with real user
files at stake, and the migration runner, `NewerFormatError` and the whole machinery stay exactly as
they are, ready for the first bump.

**The fixture.** `fixtures/format/` does not exist yet. This slice creates it and commits
`fixtures/format/v1.lcp`, **generated by the current writer** and containing a rectangle, a circle
and an arc — the baseline for the current format, and the file every future migration chain must
still be able to open. It is a baseline, not an archaeological artifact: it records what version 1
means as of today, which is exactly what the corpus rule needs from it.

## The property panel

### Structure

The panel is refactored **before** circle and arc land, not after. It is 242 lines today with a
single `rect` conditional; adding two more shapes to that conditional is how it becomes the file
nobody wants to open, and this platform is going to grow leathercraft-specific geometry — gussets,
strap ends, buckle tongues — each with parameters of its own.

The seam is deliberately small:

```
PropertyPanel.tsx          part fields, feature name, measured readouts, delete
shapeEditors/index.tsx     one switch: shape.type → the editor for it
shapeEditors/RectEditor.tsx
shapeEditors/CircleEditor.tsx
shapeEditors/ArcEditor.tsx
```

`PropertyPanel` stops knowing what a rectangle is. Each editor takes its own narrowed shape type and
an `onChange` for that type, so a rectangle editor cannot be handed a circle.

**Why a switch rather than a registry.** A `Record<shape.type, Component>` cannot narrow the shape it
passes without a cast, and a cast is exactly the thing that goes wrong quietly when a tenth shape
arrives. A single `switch` in one small file narrows for free and, with an exhaustiveness check on
the default branch, **fails to compile** when a new `ParametricShape` variant has no editor. That is
the property worth having: the compiler, not a code review, is what remembers.

No new abstraction beyond that. No plugin registry, no schema-driven field generation, no shared
"field descriptor" type. Those pay off at twenty shapes and cost more than they save at three.

### Fields

**Circle: store radius, show diameter.** The stored parameter stays `radius`, so neither the domain
type nor the schema moves. The panel offers Diameter, matching how `domain-model.md` already
presents round hardware holes — "a natural parametric UI (diameter, not a path)" — and how punches,
rivets and gussets are sized in the workshop. The panel halves the entered value and quantises after
halving, so an odd diameter lands on the storage grid once rather than twice.

**Arc: degrees in, radians stored.** Angles are shown and entered in degrees, because nobody
describes a strap end as 3.14 radians. `quantise()` is a millimetre grid and does not apply to
angles; the conversion is a plain multiply and the field commits the same way every other field
does.

## Snapping needs no work

`buildSnapIndex` walks evaluated segments and already emits `centre` for any arc segment, plus
endpoints and midpoints for every segment. Circles and arcs become snap targets the moment they
evaluate, with no change to the snap engine. This is the dividend of deriving geometry rather than
storing it, and it is worth stating so nobody goes looking for the work.

## What changes, in order

**Slice 3.6 — Circle**

| # | Package | Change |
|---|---|---|
| 1 | `apps/desktop` | Panel refactor: `shapeEditors/` with the dispatch switch and `RectEditor`, behaviour unchanged. |
| 2 | `document` | `circleShape` and `circlePart`, beside the existing `rectShape` / `rectanglePart`. |
| 3 | `editor` | `createCircleTool`, with the same explicit state discriminant the rectangle tool uses. |
| 4 | `apps/desktop` | `CircleEditor`; the C entry in the Draw group of `tools.ts`. |

**Slice 3.6b — Arc**

| # | Package | Change |
|---|---|---|
| 1 | `domain` | The `arc` variant and its evaluator case. Tests first — pure layer. |
| 2 | `persist` | Schema variant, `fixtures/format/v1.lcp`, and the test that opens it. |
| 3 | `document` | `arcShape` and `arcPart`. |
| 4 | `editor` | `createArcTool`, including the 15° Shift constraint shared with the polyline tool. |
| 5 | `apps/desktop` | `ArcEditor`; the A entry in the Draw group. |

No new edge in the layer graph, so no ADR. No new dependency.

## Testing

- **Property tests** in `domain` for the arc round trip: parameters → evaluated path → measured
  radius and swept angle, for arbitrary centres, radii and sweeps including reflex ones.
- **Persist**: round trip through the container, plus opening the committed fixture.
- **Tool tests** at the boundary the user can now reach: coincident clicks, collinear clicks, a click
  without a drag on the circle tool, and the 15° constraint. `arcThroughPoints` already has its own
  tests; these prove the tool honours what it returns.
- **Playwright**: both gestures, Escape, Backspace, undo, typing a diameter, and that rectangles
  still behave exactly as they did before the panel moved.
- The app is launched and looked at. Slice 3.5a is the standing reminder that assertions missed a
  collapsed canvas and an off-screen panel that one screenshot showed immediately.

## Out of scope, recorded so it is not relitigated

- **Dragging an arc's endpoints.** Vertex editing is 3.9.
- **Move, rotate, scale.** 3.7, which is where §4.2 rule 1 gets exercised.
- **Ellipse and polygon tools.** Their constructors exist from 1.7, but the palette design puts them
  under Rectangle as nested variants, and nesting is itself out of scope there.
- **Offsetting a circle or arc.** Analytic offsetting already handles arcs; deriving a stitch line
  from one needs nothing from this slice.
- **A full circle drawn as an arc.** The arc tool makes open runs. A circle is the circle tool's job.
- **Shift on the circle tool.** A circle is already uniform; there is nothing for it to constrain.
- **A generalised field-descriptor system for shape editors.** See the panel section — three shapes
  do not pay for it.
