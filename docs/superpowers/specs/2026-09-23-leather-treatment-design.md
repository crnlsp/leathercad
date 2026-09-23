# Leather-specific treatment (F.7) — design

**Date:** 2026-09-23
**Status:** Built in the slice's pull request ([#55](https://github.com/cornelisp/leathercad/pull/55)); §6 decided at review.
**Row:** [roadmap](../../roadmap.md) § *The UI Foundations checkpoint*, F.7 ·
[UI Foundations](2026-09-17-ui-foundations-design.md) §8, §9.3, §12, §13, §14 ·
[decisions](2026-09-18-ui-foundations-decisions.md) §3, §6

---

## 1. What the slice is

The last UI Foundations step. The row reads: *true-size slanted stitch slits; seam allowance as a
band; fold direction ticks; the derived link tick; the canvas legend and the part caption. Then run
the identity test and record the result.*

Everything here is **presentation of what the model already knows**. No model field, command,
schema or migration changes. The canvas learns to say what the property panel has been saying in
sentences.

## 2. Checked before designing

| Question | Answer |
|---|---|
| Does the model know a slit's size and slant? | **No.** A hole set stores `pitchMm` and a cosmetic `ironLabel`. Each hole has a `point` and a `tangent`. `domain-model.md` §3.3 lists slot and diamond shapes as *later*. |
| What slant do the docs give? | Two different ones. The glossary says a slot sits "roughly 20–30° to the stitch line". F.6's stitch-holes mark draws its slits at about 72°. |
| What do makers publish? | Tooth width about **half the pitch**: 1.6 mm at 3.0, 1.75 at 3.38, 1.9 at 3.85 ([Pro Atelier Plus](https://www.proatelierplus.com/product-page/frenchstyle-pricking-hollow-pricking-iron-3-00-3-85-mm)). A **cutting angle of 43°** (the same page) and 40° (another maker). Neither says what the angle is measured from, and 43° from either reference is within 2° of 45°. |
| What does paper print for a hole? | A 1 mm circle at its centre (`STITCH_HOLE_MARKER_DIAMETER_MM`, slice 6.1). It shows where the awl goes. It has been verified on paper. |
| Does the canvas hatch a cut-out? | **No.** §8.1 and §8.2 give it an inward hatch, and item 4 of the identity test needs one. F.6 drew the hatch on the mark only. No F row claimed it for the canvas. |
| Is a seam allowance identifiable? | Yes: an outer cut contour derived **outward** from a stitch line (`markFor` already names it). Slice 4.9 limits it to closed lines and whole runs, so both edges of the band are closed. |

## 3. Decisions

### 3.1 Slits: a nominal French iron, drawn true

A hole is drawn as a **slit centred on its point**, from a nominal French-style pricking iron
defined once in `packages/render/src/theme/`:

| | Value | Why |
|---|---|---|
| Length | **0.5 × pitch** | The makers' tooth widths: 0.53, 0.52, 0.49 × pitch |
| Slant | **45° to the stitch line**, leaning right (`/` on a line drawn left to right) | 40–43° as published; the right-leaning slant of a standard, not an inverse, iron |
| Blade thickness | **0.4 mm** | Nominal. Only drawn in the detail band |

The slant is measured from the hole's **tangent**, so it follows the line around corners as a real
iron does. It gives the same slit whichever way the line was drawn: a slit is a line through its
centre, and turning the tangent round by 180° leaves it unchanged.

"True size" means **these nominal millimetres, drawn at scale**. It does not mean the maker's own
iron, which the model does not record. That waits for the iron library, where a preset can carry
its tooth width and angle, and the renderer reads them instead of the nominal ones.

**A rendering convention, not model data.** The slit's length, slant and blade thickness are
worked out by `packages/render` while drawing, from the pitch the hole set already stores. None of
them is a field on the hole set, on a hole, or in the `.lcp` file, and no migration is involved.
Evaluation still produces the same holes: a point and a tangent each (`domain-model.md` §3.3).
Export never sees a slit. Changing the convention changes how the canvas looks, and nothing a file
or a printed sheet holds.

The zoom bands (§9.3), with thresholds that were already in the theme:

| Band | px / mm | Slit |
|---|---|---|
| Detail | ≥ 8 | True length, true slant, stroke as wide as the blade: max(0.4 mm, role width) |
| Working | 2 – 8 | Length max(true, 3 px), true slant, role width |
| Overview | < 2 | No slits; the set draws as its stitch line (F.5, unchanged) |

Butt caps, so a slit's drawn length is its length.

**The glossary is corrected** to 40–45° with its source. **F.6's mark is redrawn** from the same
constant, so the legend and the tree show the canvas's slant, not a third one.

**Paper is unchanged, by decision (§6).** It prints the 1 mm centre circles that a maker aligns an
iron to. They have been checked against a physical print, and the print contract stays stable. The
slit is how the screen shows a stitch hole, not a mark for paper.

### 3.2 The seam allowance is a band

The region between the stitch line and the edge grown from it is filled with `--ink` at 12 % (even
and odd, so the inside of the stitch line stays clear). The band goes beneath everything else in its
part: halos, lines and slits draw over it. It is screen-only. On paper the two lines already say it,
and a fill would waste toner on a template that is going to be cut.

### 3.3 Folds show which way they fold

On the canvas, the fold carries the mark's own device: a **V** for a valley and a **Λ** for a
mountain. The chevron is centred on the line, 8 × 5 px, in fold green.

The chevron is **upright on screen**, not turned to the line. A chevron turned to the line points
one way along it, and which way depends on the direction the line was drawn. A drawn-backwards
valley would then read as a mountain. An upright V or Λ reads the same whatever the line's
direction, including on a curve. On a vertical fold it is exactly the mark.

Ticks are spaced about every 96 px along the line, at the centres of equal stretches, so a short
fold gets one at its midpoint. None are drawn on a line shorter than 24 px on screen, where a tick
would be larger than the fold.

### 3.4 Derived geometry wears a link tick

Two interlocked rings, each 5 px across, in the role's colour at 60 %, filled with the ground. The
tick sits at the **middle of the path's longest segment**, turned to it. It does not sit halfway
along the whole path. Halfway round a closed rectangle is its opposite corner, where the line turns
and the rings would have no direction to follow. The first build put it there, and the screenshot
showed it. The tick is on:

- a stitch line that follows an edge;
- an edge grown from a stitch line (a seam allowance);
- a counterpart that mirrors its source, across an axis or a fold.

**Not on a hole set.** Holes are always derived, so the tick would carry no information, and the
set's path is the stitch line, which carries its own tick if it has one. **Not on a frozen feature**,
which is drawn geometry now. **Not on a dimension**, which *measures* and does not follow.

### 3.5 Cut-outs are hatched inward

§8.1: 45° lines at 18 % ink, clipped to the inside of a closed cut-out, 6 px apart on screen. The
hatch is beneath the line, and screen-only, like the band.

### 3.6 The legend

A key at the canvas's top-right, below the ruler. It sits on the drafting ground and uses the
ground's own colours. It lists **what is drawn**: one row per mark present among the visible
features, in `MARKS` order. Each row shows its `FeatureMark` on the ground plane and the maker's
word, the one the panels use:

> Outline · Cut-out · Seam allowance · Stitch line · Stitch holes · Valley fold · Mountain fold ·
> Marking line · Hardware hole · Dimension

and, when something drawn is derived, *Follows or mirrors another line* beside the link tick. The
tick is drawn from the same shape function the canvas uses.

**Collapsed by default.** Collapsed, it is a strip of the marks present plus a chevron, and its
tooltip names the marks in order. Expanded, each row gains its name. The state lasts the session. It is
never kept in `localStorage`, which stalls a second window, and a remembered choice belongs in
`preferences.json` (8.2). A legend that opened on every launch would cost an experienced maker a
click every time.

An empty document has no legend.

### 3.7 The part caption says the iron

§13: *"it also gains a canvas caption (`88 holes · 3.85 mm · KS Blade`)"*. Under the part's name,
smaller (2.2 mm against the name's 2.8) and in the same quiet ink:

- `count holes · pitch · iron`, per iron, summing the visible hole sets that share one;
- the pitch is the **nominal** one (the iron), per the glossary, through `formatMm`;
- the iron is its label with a trailing pitch removed when it repeats the pitch, so the
  `KS Blade 3.85 mm` preset reads `KS Blade`. A label that names a different number is kept whole.

The name moves up one line to make room. The iron line takes the name's old place, directly above
the piece. Paper keeps the name alone (§6).

## 4. Acceptance criteria

Each is something a person can check in the running application.

1. Zoomed in on a stitched panel, each hole is a **slanted slit**, not a dot. It leans the same way
   relative to the line on all four sides, and it is centred on the hole.
2. At a 3.85 mm iron, a slit is **1.93 mm long** at any zoom from 2 to 8 px/mm and above. Zoomed in
   past 8 px/mm it is drawn **0.4 mm wide**. Zoomed out below 2 px/mm the holes become the dashed
   stitch line, as in F.5.
3. *Stitch + allowance* shows a **tinted band** between the stitch line and the edge. The inside
   of the stitch line stays the plain ground.
4. A valley fold shows **V** ticks along it and a mountain fold **Λ**. Switching the direction in
   the panel flips them. Drawing the same fold backwards changes nothing.
5. A derived stitch line, a seam-allowance edge and a mirrored slot each show a **link tick** in
   the middle of their longest side. A drawn outline, a hole set and a dimension do not. After *Keep* (freeze) in the
   delete dialog, the frozen feature loses its tick.
6. A cut-out is **hatched** inside; the outline around it is not.
7. The canvas has a **legend** at its top-right. It is a strip of marks until opened, then names each
   one. It lists only what is drawn, gains a row when a fold is added, loses it when the fold is
   hidden, and is absent from an empty document. Opening it does not move the drawing.
8. A stitched part's caption reads, under its name, **`88 holes · 3.85 mm · KS Blade`** (with the
   part's own count). A part without holes shows its name alone. The exported PDF is unchanged.
9. The stitch-holes mark in the tree, the property header and the legend leans at the canvas's 45°.
10. §12's identity checklist is run against a screenshot of the running application with the
    wordmark removed. The result is recorded item by item in the roadmap.

## 5. Not in this slice

- **An iron's own tooth width and angle.** That is the iron library, and needs model fields.
- **Slot or diamond hole shapes** as a hole-set property (domain-model §3.3, *later*).
- **Run-boundary marks at corners**, and a **fold preview** or ghost. Both are post-1.0 in §14.
- **The draw tools wearing the *Draw as* role's colour** (decisions §4.1.1). This is still open, and
  it is not on the F.7 row.
- **Persisting the legend's state.** That is `preferences.json`, slice 8.2.

## 6. Decided at review (2026-09-23)

The user settled the open questions this design raised, before merging:

- **The iron caption stays canvas-only.** It does not print. Sheet reflow is not changed for
  drafting metadata that is not geometry. (The paginator reserves 5 mm above a piece for a single
  caption line, `LABEL_HEIGHT_MM`.)
- **Paper keeps its 1 mm centre circles.** Slits are the screen's representation of a stitch hole.
  The circles have a physical alignment purpose that has been checked on paper, and the print
  contract stays stable.
- **The legend stays collapsed by default** until preference persistence arrives in 8.2. F.7 adds
  no persistence mechanism of its own.
- **The dimension gap in the identity test is a follow-up.** Item 9 needs arrowheads and a number
  that breaks the line, neither of which is pulled into F.7.
- **The display-list cost is a recorded finding.** It went from 13 to 87 µs on the 636-hole
  benchmark strap. It is not optimised further unless an actual interactive performance problem
  is shown.
- **The slit convention stays as built**: taken from published tools, and rendering only (§3.1).

## 7. Tests

- **Render, property-tested:** a slit is centred on its hole; it lies at 45° to the tangent, the
  same for either tangent sign; its length is the nominal length, floored at 3 px only in the
  working band and never floored in the detail band; drawn true, a slit spans under half the pitch
  along the line, so neighbours never overlap. Fold ticks lie on the line and are the same set
  whichever way it runs. The link tick lies on the path, whatever its shape.
- **Render, by example:** the band's two edges are the allowance edge and its stitch line; which
  features get a link tick and which do not; the hatch sits under a cut-out and not an outline; the
  iron caption's words, grouping and label trimming; both backends draw each new item.
- **Desktop:** the legend's rows follow the document; the mark's slant is the theme's.
- **E2E:** the legend lists what is drawn and follows a hidden feature out; opening it leaves the
  canvas where it was; no tooltip opens once the pointer has left. The caption is canvas text,
  which the DOM cannot read, so the render tests and the screenshots cover it.
- **Pixel references** regenerated and every changed image inspected.
