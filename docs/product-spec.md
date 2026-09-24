# Product Specification

**Project codename:** LeatherCAD (working title)
**Status:** Design — no implementation yet
**Last updated:** 2026-09-03

---

## 1. What this is

A desktop application for designing leathercraft patterns that print at exact 1:1 scale.

The user draws the *parts* of a leather good — a wallet body, a card slot, a gusset, a strap — with
real millimetre dimensions, marks where the stitching goes, generates the stitch holes at the pitch
of their pricking iron, and prints the result on A4 or A3 paper. They glue the printout to card
stock, cut it out, and use it as a physical template on leather.

The whole product succeeds or fails on one thing: **a line drawn as 100 mm must measure 100 mm on
the printed page.** Every architectural decision in these documents serves that.

## 2. What this is not

- Not a generic vector editor. Geometry carries craft meaning (see [domain-model.md](domain-model.md)).
  If a feature can be described as "like Inkscape but…", it is probably the wrong feature.
- Not a 3D modeller. No folding simulation, no material draping, at least not before v3.
- Not a parametric constraint solver (no "make these two edges equal and let the solver figure it
  out"). It has *one-way parametric derivation*, which covers ~90% of real leatherwork and costs
  ~5% of the effort. See §6.
- Not collaborative, not cloud-backed, not a web app.

## 2a. Relationship to Leathercrafto

[Leathercrafto](https://github.com/crnlsp/Leathercrafto) is a separate application by the same
author: a keyboard-driven browser for a folder of existing pattern PDFs, which prints them at 1:1.

**LeatherCAD is a separate application, not a successor and not a component of it.** The two are not
merged and share no code. Where their concerns overlap — 1:1 PDF output, calibration, tiled
printing — LeatherCAD reimplements them rather than depending on the other project, because
LeatherCAD generates its own vector geometry while Leathercrafto re-lays-out someone else's PDF.
Those turn out to be different problems.

Two things carry over as *technique* rather than code:

- The approach to defeating "fit to page" and generating exact-scale output, already proven there.
- Its `calibrationScale` test, which rasterises the output PDF with `pdftoppm` and verifies scale in
  pixels. Adopt this in `packages/print` — it is a stronger check than parsing the PDF's own
  numbers, because it measures what a renderer actually produces.

A deliberate difference in emphasis: **LeatherCAD's UI must be clearer and more responsive.** The
editor is a direct-manipulation canvas that users will sit in front of for hours, not a browser they
dip into. Where the two projects would diverge on interface decisions, LeatherCAD favours clarity
and immediate feedback over keyboard density.

## 3. Users and their actual workflow

The target user is a hobbyist or small-shop leatherworker who currently designs patterns in
Illustrator, Inkscape, Fusion 360, or on graph paper — all of which fight them.

A representative session, which the MVP must support end to end:

1. "I want a card holder. Outer piece 105 × 75 mm, corners radiused 8 mm."
2. "The card pockets are 95 × 60 mm with a curved thumb scoop." *(1.0 draws the scoop with arc
   segments in the polyline tool (roadmap 3.9a): mid-run, **A** makes the next segment an arc, taken
   as its end and then a point it passes through, and **L** goes straight again. The pocket's three
   sewn sides are stitched with a stitch line drawn along them, and holes on it. A stitch line inset
   across the scoop itself is a documented 1.0 limitation.)*
3. "Stitch line runs 3.5 mm in from the edge, all the way around."
4. "My iron is 3.85 mm pitch. Put holes on that line, with a hole exactly on each corner."
5. "How long is that stitch line? How many holes did that give me?" *(They need to buy thread and
   know whether the two mating pieces have the same hole count.)*
6. "Print it at 1:1 on A4."
7. "Measure the printed 50 mm square with a steel rule. It reads 50 mm. Good."

Steps 3, 4 and 7 are the ones no general-purpose tool does well. They are the product.

### Secondary workflows (v1.x)

- Mirror a part to make its left/right counterpart.
- Trace an existing pattern from a photo or scan.
- Drop in a reference outline for a snap, rivet, D-ring, or zipper.
- Reuse a saved part ("my standard card slot") in a new project.

## 4. Design principles

1. **Millimetres are the truth.** Pixels exist only inside the renderer. Nothing else in the
   codebase knows what a pixel is.
2. **Semantics before pixels.** A path is not "a black stroke"; it is a *cut contour* or a
   *stitch line*, and its appearance, export layer, and validation rules follow from that.
3. **Derive, don't duplicate.** A stitch line inset 3.5 mm from a cut line is *a relationship*, not
   a copy. Change the cut line and the stitch line follows. Change the pitch and the holes
   redistribute.
4. **Exact numbers beat mouse precision.** Every dimension is typeable. Drawing with the mouse is a
   convenience; the keyboard is how you get 3.85 mm.
5. **Nothing between the model and the paper.** The app generates print-ready PDFs itself. It never
   asks a browser, a print dialog, or a driver to scale anything.
6. **Correct beats featureful.** A wrong offset that looks plausible wastes the user's leather.
   Leather costs money and is not undoable.

## 5. MVP scope

> **Superseded as the definition of 1.0** by the roadmap's *Checkpoint — the 1.0 boundary*
> (pre-1.0 product audit, accepted and frozen 2026-09-23). That list is shorter than the one below,
> and it names every item's slice. Several items here are 1.1: SVG export, a general Bézier and
> vertex editor, guides and alignment, recent files, and sample projects. The rationale below still
> stands. **Windows, macOS and the on-screen print preview moved the other way**: they are 1.0 —
> the preview as the Sheets view, at the 2026-09-24 boundary revision.

The MVP is defined as: **the smallest version that a leatherworker would choose over Inkscape.**

### In scope

**Document & parts**
- Project containing multiple *pattern parts*, each with a name, quantity, and notes
- Parts placed on an unbounded mm workspace

**Drawing**
- Rectangle with independent per-corner radii
- Line, polyline, closed polygon
- Circle, arc
- Cubic Bézier path with corner/smooth vertex handling
- Numeric entry while drawing (type a length and angle rather than clicking)

**Editing**
- Select (click, shift-click, rubber band), delete
- Move / rotate / scale, by handle and by exact numeric dialog
- Vertex editing: add, remove, move, convert corner ↔ smooth
- Property panel with exact mm fields for everything selected
- Align and distribute
- Mirror (horizontal / vertical / about an arbitrary axis)

**Leathercraft semantics**
- Feature kinds: cut contour, stitch line, fold line, marking line, hardware hole
- Derived stitch line: offset inward from a cut contour by a distance, live-linked
- Derived cut contour: offset outward from a stitch line by a seam allowance, live-linked
- Stitch hole generation: pitch, iron presets, `fit-whole` and `exact-pitch` distribution,
  corner policy (`hole-at-corner` / `continuous`), start/end insets
- Measurements: linear, aligned, and radial dimension annotations
- Validation: unclosed cut contour, self-intersecting contour, holes outside their part,
  hole spacing below a minimum, offset that collapsed the shape

**Canvas**
- Zoom to cursor, pan, fit-to-content
- Adaptive grid and rulers in mm
- Snapping: endpoint, midpoint, centre, intersection, on-path, grid, guide, angle constraint
- Draggable guides
- Undo / redo with transaction grouping

**Files**
- Native `.lcp` project format, versioned, with a migration runner from day one
- Save, open, autosave, crash recovery, recent files

**Output**
- SVG export with mm units and semantic layer groups
- PDF export at exact 1:1
- Tiled printing across A4 / A3 / Letter with margins, overlap, registration marks, tile labels
- A 50 mm verification square and a 100 mm calibration ruler on every printed page
- On-screen print preview driven by the same pagination code as the PDF (the Sheets view, 7.4c)

### Explicitly out of the MVP

Deferred because they are expensive, not because they are unimportant. Rough ordering by value:

| Feature | Why deferred | Target |
|---|---|---|
| Thickness / wrap compensation (gusset math) | High value, needs the fold-line model to mature first | v1.1 |
| Hardware library (snaps, rivets, zips, D-rings) | Mostly data entry; needs a reference-geometry model | v1.1 |
| Tracing from a scanned image | Needs image import, scale calibration, and a trace UX | v1.1 |
| DXF export | Second export backend; SVG covers most of the need | v1.1 |
| Part templates with exposed parameters | Needs a stable domain model first | v1.2 |
| Boolean operations (union / subtract / intersect) | Shares the Clipper dependency with offsetting, but a big UX surface | v1.2 |
| Seam pairing and hole-count parity validation | Needs an assembly model | v1.2 |
| Stitch appearance simulation | Cosmetic | v2 |
| Nesting / hide-yield optimisation | Genuinely hard; needs boolean ops | v2 |
| Full constraint solver | Months of work; the derivation graph covers most real cases | v3 |
| 3D preview / fold simulation | Different product | v3 |
| ~~Windows / macOS builds~~ | **Moved into 1.0** at the boundary review: 1.0 is a public release on all three, with a measured print on each (roadmap 8.6, 7.7) | v1 |

### The four features that make v1 worth using

If schedule pressure forces cuts, cut anything *except* these:

1. **Exact numeric input everywhere.** Without it, this is a worse Inkscape.
2. **Live-derived stitch line from cut line.** This is the single biggest daily time saver.
3. **Automatic stitch holes with correct corner behaviour.** This is the feature people buy
   Leathercraft CAD for.
4. **Verified 1:1 tiled printing.** Without it, nothing else matters. *(Tiling is built, as 7.2a, and
   measured through poppler. "Verified" means a steel rule on paper, which is 7.7.)*

## 6. Why one-way derivation instead of constraints

A real constraint solver (coincident, parallel, tangent, equal-length, dimension-driven) is what
Fusion 360 and SolidWorks have. It is also several months of work and a permanent source of
"over-constrained sketch" frustration.

Leatherwork geometry is overwhelmingly *hierarchical*, not *mutually constrained*:

```
cut contour  →  stitch line (inset 3.5 mm)  →  stitch holes (3.85 mm pitch)
```

Information flows one way. A directed acyclic graph of derivations gives the user the thing they
actually want — "change the outline, everything downstream updates" — with none of the solver's
complexity. If a genuine two-way constraint need appears later, the graph is a fine substrate to
add one on top of.

See [domain-model.md](domain-model.md) §4.

## 7. Non-functional requirements

- **Print accuracy:** ≤ 0.1 mm error over a 200 mm span in exported PDF geometry, measured by
  parsing the PDF. Physical error is then limited by the printer, which the calibration feature
  exists to expose.
- **Geometry tolerance:** curve flattening ≤ 0.005 mm for export, ≤ 0.05 mm for screen rendering.
  (600 dpi is 42 µm, so 5 µm is comfortably below anything printable.)
- **Responsiveness:** dragging a selection in a document with 3 000 stitch holes stays at 60 fps.
  Regenerating a derived stitch line and its holes after an edit completes in < 50 ms.
- **Working range:** 0.1 mm to 2 000 mm in a single document, without precision artefacts.
- **Startup:** cold start to usable canvas in under 3 s.
- **Data safety:** a recovery copy at most every 60 s while there is unsaved work, in the app's
  state directory rather than beside the project ([file-format.md](file-format.md) §7). Opening a
  file written by a newer format version must refuse rather than corrupt.

## 8. Platform and licensing

- **Linux, Windows and macOS for 1.0.** Linux was built first, as an AppImage; a Flatpak is 1.1.
  Windows and macOS are a packaging, signing and print-path problem, not an architecture problem.
  See [architecture.md](architecture.md) §7 and roadmap 8.6.
- **Open source.** Recommended licence: **Apache-2.0** (permissive plus an explicit patent grant).
  All dependencies must be permissively licensed — MIT, Apache-2.0, BSD, or BSL-1.0. No GPL
  dependencies, so that the licence choice stays open.
- Units are **millimetres only** in v1. The internal model is mm regardless; adding an inch display
  layer later is a formatting change confined to the UI, not a model change.
