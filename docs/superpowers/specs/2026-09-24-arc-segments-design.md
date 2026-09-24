# Arc segments in the polyline tool (slice 3.9a) — design

**Date:** 2026-09-24
**Status:** Proposed with the slice's pull request.
**Row:** [the 1.0 boundary](../../roadmap.md), item 4 ·
[pre-1.0 audit](2026-09-23-pre-1.0-product-audit.md) §2.1, the edge-scoop feasibility check

---

## 1. The gap, checked again before building

The product spec's own example has a card pocket "95 × 60 mm with a curved thumb scoop". On
2026-09-24 the editor still could not draw it:
- The polyline made only straights.
- The Arc tool makes an open arc, which is a marking line and is refused as an outline.
- There is no vertex editing and no Boolean subtraction.

So no closed outline could have a curve in it. Everything below the editor already handled arcs in
a drawn path (audit §2.1), which made this the minimal 1.0 capability.

## 2. What is built

- **Mid-run, A makes the next segment an arc, and L makes it straight again.** That is the CAD
  convention for a polyline (AutoCAD's PLINE uses the same letters).
  - An arc takes two clicks, as the Arc tool does: its **end**, then **a point it passes through**.
  - The preview shows the arc through the pointer, reading its radius (`R 15.4 mm`). While the end
    is being placed, it reads `Arc to · <run> <angle>`.
  - An arc can close the shape: end it on the first point, then place its bulge. A "D", a straight
    and a curve back, is a closed outline of two segments.
  - Backspace takes back an arc's placed end first, then the point before it. Enter finishes an open
    run without an arc that has no bulge yet.
  - A bulge on either end of the arc describes no circle, so it is not taken. A bulge on the chord
    gives the straight, as `Shapes.arcThroughPoints` does for the Arc tool.
  - Every run starts straight.
- **A and L are the Arc and Line tools' shortcuts**, and switching tools mid-run would throw the run
  away. So the polyline **claims** them only while a run is live.
  - `Tool.onKey` may now return `true` to claim a key.
  - The canvas listens on `document`, which a key reaches before the window, where the app's
    shortcuts listen. It calls `preventDefault` on a claimed key, and the shortcut handler skips a
    prevented event.
  - A dialog that stops a key still stops it before either. That is why the listener isn't a
    capture listener.
  - The Line tool, which finishes at two points, never claims them. Ctrl+A is never claimed.
- **Why keys and not a toggle in the options bar:** at 1280 px the six *Draw as* chips already fill
  the canvas column. The Polyline tool's how-to line, in the header and its tooltip, names both keys.

## 3. A finding fixed on the way: a stored path was rounded

The file wrote every number to six decimals, stored paths included. A path stores an arc as a
centre, a radius and two angles. Rounded, the arc came back:
- a few micrometres off the line beside it, which stores its end exactly;
- a millionth of a radian off tangent.

The Tier 1 offset reads that as a concave corner at an arc and refuses it. **A frozen rounded
rectangle whose stitch line built before a save failed with `OFFSET_COLLAPSED` after one.** Every
scooped pocket would have gone the same way.

**Fix:** a stored path's segments are written exactly, in JavaScript's shortest round-trip form, so
the same doubles come back (`file-format.md` §3.2).
- Parameters keep their six decimals.
- An unchanged document still saves byte-identically.
- Older builds read longer numbers as they read any number, so there's no format version change.

Healing the joins at evaluation was tried first and rejected. It closes the gap but not the kink,
so the stitch line still collapsed.

## 4. Not in this slice

- **A stitch line inset across the scoop**: the documented 1.0 limitation. A concave line-to-arc
  join is Tier 2 offsetting (Phase 9 #11).
- **Stitching part of an outline from the panel.** The model has runs between anchors, but no UI
  chooses one. The three sewn sides are a stitch line drawn along them.
- Vertex editing, tangent arcs, and editing a drawn arc afterwards: 3.9, 1.1.
- Quantising drawn points (invariant 8). No draw tool does it today, and this slice follows the
  polyline as it was.

## 5. Acceptance criteria

1. A pocket with a thumb scoop is drawn as one closed outline with an arc in it, and the arc passes
   through the clicked point, dipping into the pocket.
2. A and L switch the next segment only mid-run. With no run live, they are the Arc and Line tools.
3. The three sewn sides take a stitch line and holes.
4. Saved and reopened, the outline, the hole count and the problems are unchanged.
5. A frozen rounded rectangle's stitch line still builds after a save and reopen.

## 6. Tests

- `packages/editor/src/tools/polylineTool.test.ts`, 12 new tests:
  - the pocket, whose arc passes through the bulge and starts and ends where it was clicked;
  - key claiming mid-run only, and not by the Line tool;
  - closing with an arc;
  - the preview and its reading;
  - Backspace;
  - degenerate bulges;
  - the chord;
  - a preview that never throws;
  - Enter with an arc pending;
  - every run starting straight.
- `packages/persist/src/lcp.test.ts`:
  - a frozen rounded rectangle still stitches after a reopen (it failed before the fix);
  - a stored path comes back exactly;
  - the second save after a reopen is byte-identical.
- `e2e/edge-scoop.spec.ts`: the whole session in the real app.
  - The pocket, drawn with A and L, keeps the Polyline tool active.
  - Its perimeter shows the arc: 323.5 mm, not a straight top's 312.0.
  - A with no run live is the Arc tool.
  - A stitch line on three sides, with holes.
  - Save, *New*, reopen: the same perimeter, hole count and problems.
