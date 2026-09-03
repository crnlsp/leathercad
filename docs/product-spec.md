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

## 3. Users and their actual workflow

The target user is a hobbyist or small-shop leatherworker who currently designs patterns in
Illustrator, Inkscape, Fusion 360, or on graph paper — all of which fight them.

A representative session, which the MVP must support end to end:

1. "I want a card holder. Outer piece 105 × 75 mm, corners radiused 8 mm."
2. "The card pockets are 95 × 60 mm with a curved thumb scoop."
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
- On-screen print preview driven by the same pagination code as the PDF

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
| Windows / macOS builds | Deliberate: one platform, one print engine, until 1:1 is proven | post-v1 |

### The four features that make v1 worth using

If schedule pressure forces cuts, cut anything *except* these:

1. **Exact numeric input everywhere.** Without it, this is a worse Inkscape.
2. **Live-derived stitch line from cut line.** This is the single biggest daily time saver.
3. **Automatic stitch holes with correct corner behaviour.** This is the feature people buy
   Leathercraft CAD for.
4. **Verified 1:1 tiled printing.** Without it, nothing else matters.

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
- **Data safety:** autosave every 60 s to a recovery sidecar; opening a file written by a newer
  format version must refuse rather than corrupt.

## 8. Platform and licensing

- **Linux first**, as an AppImage and a Flatpak. Windows and macOS are post-v1 and are a packaging
  and print-path problem, not an architecture problem — see [architecture.md](architecture.md) §7.
- **Open source.** Recommended licence: **Apache-2.0** (permissive plus an explicit patent grant).
  All dependencies must be permissively licensed — MIT, Apache-2.0, BSD, or BSL-1.0. No GPL
  dependencies, so that the licence choice stays open.
- Units are **millimetres only** in v1. The internal model is mm regardless; adding an inch display
  layer later is a formatting change confined to the UI, not a model change.
