# Glossary

Craft vocabulary used throughout the code and docs. Use these terms exactly; do not invent
synonyms. Where a term has a specific meaning in this codebase that differs from casual usage, that
is called out.

## Leatherwork terms

**Pricking iron** — A toothed chisel struck with a mallet to mark (or punch) evenly spaced stitch
holes. Its defining property is its **pitch**.

**Pitch** — The centre-to-centre distance between adjacent teeth on a pricking iron, in mm. Common
values: 2.7, 3.0, 3.38, 3.85, 4.0, 5.0 mm. Some makers label irons in **SPI** (stitches per inch);
3.38 mm ≈ 7.5 SPI, 3.85 mm ≈ 6.6 SPI. The app stores pitch in mm. *Do not call this "spacing"
without qualification* — see below. A **row of holes** has a pitch too, in the same sense: the
nominal centre-to-centre distance asked for, chosen by the maker rather than read off an iron.

**Stitch spacing** — Used in this codebase to mean the *actual achieved* centre-to-centre distance
after distributing holes along a path, which usually differs slightly from the nominal iron pitch
because the path length is rarely an exact multiple. Nominal value = pitch; achieved value =
spacing.

**Stitch line** — The path along which stitching runs. Normally set in from the edge by 3–4 mm.
Sometimes called the "stitch groove" line when it is physically grooved into the leather.

**Stitch hole** — One hole in the leather through which thread passes. Round for an awl or round
punch; for a pricking iron or diamond chisel, a narrow slot slanted at roughly 40–45° to the stitch
line and about half the pitch long (makers publish cutting angles of 40–43°, and tooth widths of
1.6 mm at 3.0, 1.9 mm at 3.85). The canvas draws a hole this way, from a nominal iron: the model
records the pitch but not the tooth.

**Saddle stitch** — The hand stitch used in most leatherwork: two needles, one thread, passing
through the same hole from both sides. Relevant because both mating pieces must have *the same
number of holes* in the same positions.

**Seam** — Two runs of stitching that are sewn to each other: on two pieces, or on one piece folded
over itself. Saddle-stitched, both runs must have the same number of holes. Not the same as a *seam
allowance*. Designed in [domain-model.md](domain-model.md) §7, not modelled yet (roadmap 9.6).

**Seam allowance** — The margin of material outside the stitch line, between the stitching and the
cut edge. In this codebase it is modelled as a *derivation direction*: a cut contour derived
outward from a stitch line by the allowance distance. (The inverse derivation — stitch line inward
from cut contour — is called a **stitch inset** and is the more common workflow.)

**Stitch margin** — The distance between the stitch line and the cut edge, whichever of the two the
maker dimensions. The same number is the stitch inset seen from the edge and the seam allowance seen
from the stitching. One project default serves both (`settings.defaultStitchInsetMm`).

**Cut line / cut contour** — The outline actually cut from the leather. A part has at most one outer
cut contour, and should have exactly one, plus any number of inner ones.

**Cut-out** — An inner cut contour: a card-slot window, a hardware cut-out. The part's material lies
*outside* it, so "inward" from a cut-out points away from the hole.

**Fold line** — Where the leather bends rather than being cut. Carries a fold direction (mountain
or valley) and, later, a bend allowance, because leather with thickness does not fold on a
zero-radius line.

**Marking line** — A non-cut, non-stitch guide printed on the template: glue-area boundaries, logo
placement, alignment references.

**Row of holes** — Holes punched along a marking line at a **pitch**, for a belt's adjustment holes,
rivets along a strap, lacing or decoration: placed as a stitch hole set's are, and each one a round
hole of a true diameter, like a hardware hole. Not a stitch hole set, whose holes are on a stitch
line and pricked by an iron. Its pitch is the maker's, not an iron's; what it achieves is its
**spacing**.

**Alignment mark** — A mark at the same place on two pieces that are sewn together — at a hole, a
corner or a point along the seam — so they line up when glued and stitched. Printed on the template
and transferred to the leather, never cut: a notch in an edge that will be finished is a flaw. About
leather pieces; compare **registration mark**, which is about paper. Drawn by hand today, as a
marking line whose purpose is *Alignment*; marks derived from a seam are roadmap 9.13.

**Gusset** — A side panel that gives a bag or case its depth. The classic source of thickness-math
errors, because its length must account for the material thickness it wraps around.

**Grain direction** — Leather is anisotropic; it stretches more across the backbone than along it.
Parts will carry a grain direction — an arrow printed on the template, which turns with the piece
on paper — so it can be oriented correctly on the hide. Not modelled yet (roadmap 9.22).

**Skiving** — Thinning leather at an edge or fold. Marked today with a marking line whose purpose is
*Skive*; a band that follows the edge at a width is roadmap 9.21. Never geometry to cut.

**Burnishing / edge finishing** — Not modelled geometrically. Mentioned only because "edge
allowance" sometimes means the burnishing margin rather than the seam allowance; the app uses
"seam allowance" only in the stitch-line sense above.

## Application terms

**Project** — The whole document. One `.lcp` file. Contains parts, settings, and assets.

**Part** (or **pattern part**) — One physical piece of leather to be cut out. The unit of naming,
quantity, mirroring, and placement.

**Feature** — Any semantic piece of a part: a cut contour, stitch line, fold line, marking line,
hardware hole, stitch hole set or row of holes — or an **annotation**. The discriminated union at the centre of the
domain model.

**Annotation** — A feature with no geometry source of its own: a measurement or a text label. It
belongs to a part and resolves after the geometry it refers to.

**Layer role** — The semantic category of a feature (`cut`, `stitch`, `fold`, `mark`, `hardware`,
`annotation`). Drives screen style, export layer name, and validation rules. Not a user-managed
layer stack — the roles are fixed by the domain.

**Derivation** — A one-way dependency in which one feature's geometry is *built* from another's
(stitch line derived from cut contour; holes derived from stitch line; a mirrored counterpart). See
[domain-model.md](domain-model.md) §4.

**Reference** — A dependency in which a feature *points at* another's geometry without being built
from it: the ends of a measurement.

**Reference graph** — Derivations and references together. Always acyclic, and every edge always
resolves ([ADR 0009](adr/0009-explicit-resolution-when-deleting-a-source.md)).

**Freeze** — On deleting a source, keeping a derived dependent as drawn geometry, from its last
resolved shape, instead of deleting it. For a counterpart whose fold is deleted, freezing captures the
line the fold was on instead, so the counterpart still mirrors its source. Only ever the user's
explicit choice.

**Convert to drawn path** — Replacing a shape's parameters — a circle's radius, a rectangle's
width and corners — with the path they drew, keeping the feature and everything that follows it.
Nothing moves; what can be typed does. The way past a transform a shape refuses (3.12).

**Re-point** — Changing which feature a derived feature follows, keeping the relationship's
parameters. How an outline is replaced without losing its stitching.

**Anchor** — A durable landmark on a feature, such as a rectangle's corner, addressed as
`(featureId, index)`. Carried through derivations. Never a segment index
([ADR 0010](adr/0010-anchors-address-geometry.md)).

**Flip** — Reflecting selected geometry in place. Leaves no relationship behind. Flipping a piece's
outline flips the whole piece; its labels move with it and still read forwards.

**Mirror** (linked mirror) — A counterpart derived from its original by a reflection. It follows the
original, and has the same kind, role and hole count ([ADR 0012](adr/0012-mirror-is-a-derivation.md)).

**Structural invariant** — Something the document never violates, in memory or on disk. Commands
refuse to break it, giving a reason; the loader refuses files that break it.

**Design rule** — A condition that is legal but probably wrong for leather. Reported as a diagnostic,
never enforced ([ADR 0013](adr/0013-invariants-are-enforced-rules-are-reported.md)).

**Diagnostic** — One entry in the single list of problems: an evaluation failure or a broken design
rule, with a stable code. Every surface that shows problems reads that list.

**Document text / overlay text** — Text that can reach paper (measurement values, labels, captions),
sized in millimetres and set in the vendored typeface; versus a tool's on-screen readout, sized in
pixels and never exported ([ADR 0011](adr/0011-one-vendored-typeface-outlined-on-paper.md)).

**Evaluation** — Walking the derivation DAG to turn the stored, parameter-only document into a
`ResolvedDocument` with concrete geometry. Derived geometry is *never persisted*.

**Source geometry** — Geometry the user drew directly, stored in the file. As opposed to derived
geometry, which is recomputed.

**Path** — The geometry-layer representation: an ordered list of segments (line, arc, cubic) with
shared endpoints, optionally closed. Has no style, no meaning, and no pixels.

**Display list** — The renderer's flat, style-resolved intermediate form. Produced from a
`ResolvedDocument`, consumed by the Canvas2D and SVG backends.

**Export scene** — The export pipeline's equivalent intermediate: styled geometry in mm, page
independent. Consumed by the SVG, PDF, and DXF writers, and by the paginator.

**Paginator** — The pure function that slices an export scene into printed pages given a paper
size, margins, and overlap. Its result, in a sheet plan, is shared by the PDF writer and the Sheets
view, so that they cannot disagree.

**Sheet** — One physical piece of paper of the chosen size and orientation, and the PDF page that
prints it: "Sheet 2 of 3" on screen is page 2 of the PDF and says so in its verification strip. Use
*sheet* in the UI and on paper; *page* only for the PDF file format itself. A sheet has its paper
edge, 10 mm margins, the verification strip, and the **printable area** left over.

**Printable area** — The part of a sheet a pattern may occupy: the paper less margins and the
verification strip (`contentAreaMm`). A4 portrait prints up to 190 × 268.5 mm, not 210 × 297.

**Verification strip** — The foot of every sheet's printable area: a 100 × 5 mm gauge with the
instruction to print at 100 % in it, what the sheet is beside it, and LeatherCAD's mark (7.8).

**Turned** — Printed a quarter turn from how it was drawn, words and all, because that took fewer
sheets (7.8). Parts says *Sheet 1, turned* on the Sheets view.

**Taped piece** — A part too large for the printable area, printed as tiles across several sheets
that overlap by 10 mm and are taped together on their join lines. Its sheets are "Sheets 2–3,
taped".

**Sheet plan** — The derived result of paginating the export scene for the chosen paper: which
sheets exist and what each carries. Recomputed from the document, never stored. The PDF writes it;
the sheet count, Parts labels and Sheets view read it.

**Design view / Sheets view** — The two views of one pattern. *Design* is the board where the maker
arranges and relates pieces, freely. *Sheets* shows the same pieces as the sheet plan puts them on
paper. Board positions never affect the sheets, and nothing in the Sheets view is edited.

**Registration mark** — The join lines and crosses printed on the sheets of a taped piece, at the
same place in the pattern on each sheet, so the maker can line the sheets up and tape them together
(7.2a, [printing.md](printing.md) §7). About paper only; compare **alignment mark**, which is about
the leather.

**Calibration** — Two distinct things, kept separate in the docs:
1. *Verification*: a 100 × 5 mm gauge printed on every sheet so the user can check scale with a
   steel rule.
2. *Correction*: a stored per-printer scale factor applied to output to compensate for a printer
   that is measurably off. Correction is a last resort; wrong print settings are the usual cause.
