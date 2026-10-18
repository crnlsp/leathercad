# Product Specification

**Status:** Implemented in 1.0. Where the code and this document disagree, one of them is a bug:
fix it in the same change. §9 is the exception: it describes the direction, and claims nothing as
built that the roadmap does not.
**Last updated:** 2026-10-17

---

## 1. What this is

A desktop application for designing leathercraft patterns that print at exact 1:1 scale.

The user draws the *parts* of a leather good — a wallet body, a card slot, a gusset, a strap — with
real millimetre dimensions, marks where the stitching goes, generates the stitch holes at the pitch
of their pricking iron, and prints the result on A4 or A3 paper. They glue the printout to card
stock, cut it out, and use it as a physical template on leather.

The whole product succeeds or fails on one thing: **a line drawn as 100 mm must measure 100 mm on
the printed page.** Every architectural decision in these documents serves that.

### The north star

**LeatherCAD should become the tool a leatherworker reaches for to design anything made of
leather.** Three things make it that together, and none of them alone:

- **Leathercraft first, and 2D.** Pieces, stitching, folds and hardware are what it draws — flat
  and to the millimetre, as a pattern is.
- **Easy on the first day, deep after years.** Someone who has never used design software makes a
  stitched, printable piece in their first session. A maker who uses it for years keeps finding a
  faster way to work, and nothing the expert uses stands in the beginner's way.
- **It understands what it draws.** Because a line is an edge to cut or a seam to stitch, the app
  can say whether the pieces will go together and hold what they are for, and explain what is wrong
  before the leather is cut. §9 says how far that goes.

IntelliJ IDEA is the model for the second and third, not for the look: one coherent environment,
easy to start in and powerful enough for complex professional work.

## 2. What this is not

- Not a generic vector editor, and not a general CAD program. Geometry carries craft meaning (see
  [domain-model.md](domain-model.md)). If a feature can be described as "like Inkscape but…", it is
  probably the wrong feature. That includes illustration: carving and tooling artwork is drawn
  elsewhere, and a logo is placed as a marking.
- **Not a 3D modeller: no 3D view, no folding simulation, no material draping.** This is a
  boundary, not a deferral. A leather good is made from flat pieces, and the flat pattern is where
  its mistakes can be caught (§9). Leather's thickness is a number the pattern uses, not a solid.
- Not a parametric constraint solver (no "make these two edges equal and let the solver figure it
  out"). It has *one-way parametric derivation*, which covers ~90% of real leatherwork and costs
  ~5% of the effort. See §6. A solver is weighed only if real use proves the derivation graph
  insufficient (roadmap 9.10, *Exploring*).
- Not collaborative, not cloud-backed, not a web app. It works offline, and a project is shared as a
  file that opens the same on any machine. No accounts, servers or marketplace inside the app.
- Not an AI assistant. Where it helps, it helps from rules a maker can read, which give the same
  answer every time (§9.3).

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
Illustrator, Inkscape, Fusion 360, or on graph paper — all of which fight them. They range from
someone who has never used design software to a maker with years of patterns behind them, and the
app serves both without a mode for each (§4, principle 7).

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
   know whether the two mating pieces have the same hole count. A mirrored counterpart has the same
   count by construction; two pieces that are not mirrors are paired as a seam in roadmap 9.6, and
   the thread a seam takes is 9.12.)*
6. "Print it at 1:1 on A4."
7. "Measure the printed 100 mm gauge with a steel rule. It reads 100 mm. Good."

Steps 3, 4 and 7 are the ones no general-purpose tool does well. They are the product.

### Secondary workflows

- Mirror a part to make its left/right counterpart. *(Built: 4.8a, 4.8b.)*
- Start a project from a worked one rather than a blank page. *(The sample wallet is built, 8.3;
  templates are roadmap 9.18.)*
- Trace an existing pattern from a photo or scan. *(Roadmap 9.2.)*
- Bring in a pattern already drawn in another program. *(Roadmap 9.20, SVG.)*
- Drop in a reference outline for a snap, rivet, D-ring, or zipper. *(Roadmap 9.3.)*
- Reuse a saved part ("my standard card slot") in a new project. *(Roadmap 8.8b, 9.7.)*

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
7. **Easy to start, deep with use.** The next step is offered where the maker is already looking —
   on the board, under the selection, in the empty panel — with their own defaults (*My tools*).
   Depth comes from keys, typed sums and the actions that appear with what is selected, never from
   a mode, a wizard or a setting a beginner must understand first.
8. **Explain; never overrule.** A design rule says what is probably wrong for leather and why, and
   where one correction is plainly safe it offers it, to preview and to undo. It never changes the
   pattern by itself and never blocks a print
   ([ADR 0013](adr/0013-invariants-are-enforced-rules-are-reported.md)). The maker decides.

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
- A 100 × 5 mm verification gauge on every printed sheet
- On-screen print preview driven by the same pagination code as the PDF (the Sheets view, 7.4c)

### Explicitly out of the MVP

Deferred because they are expensive, not because they are unimportant. Rough ordering by value.
The version targets this table first gave (v1.1 to v3) were overtaken by the releases; the right
column says where each item stands in the roadmap, which is where its status lives.

| Feature | Why deferred | In the roadmap |
|---|---|---|
| Thickness / wrap compensation (gusset math) | High value, needs the fold-line model to mature first | 9.1, *Leather has thickness* |
| Hardware library (snaps, rivets, zips, D-rings) | Mostly data entry; needs a reference-geometry model | 9.3, *Hardware that fits* |
| Tracing from a scanned image | Needs image import, scale calibration, and a trace UX | 9.2, *Bring patterns in* |
| DXF export | Second export backend; SVG covers most of the need | Shipped in 1.3.5 (6.5) |
| Part templates with exposed parameters | Needs a stable domain model first | A part library is 9.7; parameters are *Exploring* |
| Boolean operations (union / subtract / intersect) | Shares its hard part with robust offsetting, which is written here rather than bought (ADR 0008), and a big UX surface | 9.5 with 9.11, *Robust shapes* |
| Seam pairing and hole-count parity validation | Needs an assembly model | 9.6, *Pieces that fit* |
| Stitch appearance simulation | Cosmetic | *Not planned* |
| Nesting / hide-yield optimisation | Genuinely hard; needs boolean ops | *Not planned* (9.9); the leather a project takes is 9.12 |
| Full constraint solver | Months of work; the derivation graph covers most real cases | *Exploring*, only on evidence (9.10) |
| 3D preview / fold simulation | Different product | *Not planned*: a boundary (§2) |
| ~~Windows / macOS builds~~ | **Moved into 1.0** at the boundary review: 1.0 is a public release on all three, with a measured print on each (roadmap 8.6, 7.7) | Shipped in 1.0 |

### The four features that make v1 worth using

If schedule pressure forces cuts, cut anything *except* these:

1. **Exact numeric input everywhere.** Without it, this is a worse Inkscape.
2. **Live-derived stitch line from cut line.** This is the single biggest daily time saver.
3. **Automatic stitch holes with correct corner behaviour.** This is the feature people buy
   Leathercraft CAD for.
4. **Verified 1:1 tiled printing.** Without it, nothing else matters. *(Tiling is built, as 7.2a, and
   measured through poppler. "Verified" means a steel rule on paper: done on Linux and recorded in
   [print-verification-log.md](print-verification-log.md) (R1, 2026-10-09); the other platforms
   are roadmap R8.)*

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

- **Linux, Windows and macOS for 1.0.** Linux was built first, as an AppImage; a Flatpak since 1.1.
  Windows and macOS are a packaging and print-path problem, not an architecture problem. The
  builds are not code-signed, by decision (roadmap 8.6).
  See [architecture.md](architecture.md) §7 and roadmap 8.6.
- **Open source.** Recommended licence: **Apache-2.0** (permissive plus an explicit patent grant).
  All dependencies must be permissively licensed — MIT, Apache-2.0, BSD, or BSL-1.0. No GPL
  dependencies, so that the licence choice stays open.
- Units are **millimetres**: in the model, in the file and in every readout. Since 1.5 (U.15) a size
  may be *typed* in centimetres or inches, or as a sum, and is stored in millimetres. An inch display
  would be a formatting change confined to the UI, not a model change.

## 9. Where it is going

The direction, not a schedule. What is built is described above; the order of what comes next,
and why, is [product-roadmap.md](product-roadmap.md), and each item's scope and status is
[roadmap.md](roadmap.md). A sentence here becomes a commitment only through the roadmap.

### 9.1 The workflow it is built for

1. Open LeatherCAD and choose *New project*.
2. Start from a template, or from nothing. *(Today: from nothing, or the sample wallet.)*
3. Design the pieces in a precise 2D workspace, with tools that know leather.
4. Be told, while designing, whether the pieces go together and do their job.
5. Print a pattern that measures true, with what is needed to cut, stitch and assemble it.

### 9.2 Understanding what it draws

What sets LeatherCAD apart. The app knows more about a leather good in layers, and each layer makes
new checks possible:

| The app knows | So it can check |
|---|---|
| What each line is: an edge, a stitch line, a fold, a hole | Holes off the leather or near its edge; stitching too uneven to sew; an outline that crosses itself |
| How pieces go together: which edges are sewn to which | Mating seams with different hole counts or lengths; where alignment marks go; the thread a seam takes |
| What the leather does: its thickness, skiving, grain | The extra length a fold or a wrap needs; a gusset that matches its panel |
| What the maker wants: what a pocket must hold | A pocket too small for its card or notes; a strap too wide for its ring |

The first layer is built (domain-model.md §8); the others are candidates, ordered in
product-roadmap.md. Every check is a design rule: deterministic, run again on every change, never
stored, and never a guarantee (domain-model.md §8.4). Some questions no flat outline can answer —
whether a post is long enough for the layers it passes through, how much a pocket gives for six
cards rather than one — and those wait for the knowledge they need rather than being guessed.

### 9.3 Help, and who decides

A problem says why it matters to the leather and what to do. Where one correction is plainly safe it
offers it — previewed first, applied as one undo step, never by itself (principle 8). There is no AI
subsystem: rules a maker can read come first, and anything later would offer the same fixes.

### 9.4 Functional requirements

A maker will be able to say what a part must do — hold an ID-1 card, take a 25 mm D-ring — and the
app will check it on every change. A requirement is the maker's statement, stored as metadata, since
it changes nothing drawn, cut or printed (file-format.md §4.5, rule 3), and checked by an ordinary
design rule. The first is a pocket that holds what it must (roadmap 9.14). A general requirements
engine waits until several kinds of requirement have shown what one would need.

### 9.5 Firm boundaries

§2 is the boundary, and it holds as the product grows: no 3D, no constraint solver without evidence,
no cloud or accounts, no AI for its own sake, no general CAD or illustration. Each protects the
product promise — a few things done exactly right for leather.
