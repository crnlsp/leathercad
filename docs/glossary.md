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
without qualification* — see below.

**Stitch spacing** — Used in this codebase to mean the *actual achieved* centre-to-centre distance
after distributing holes along a path, which usually differs slightly from the nominal iron pitch
because the path length is rarely an exact multiple. Nominal value = pitch; achieved value =
spacing.

**Stitch line** — The path along which stitching runs. Normally set in from the edge by 3–4 mm.
Sometimes called the "stitch groove" line when it is physically grooved into the leather.

**Stitch hole** — One hole in the leather through which thread passes. Round for an awl or round
punch; a narrow slot at roughly 20–30° to the stitch line for a diamond chisel.

**Saddle stitch** — The hand stitch used in most leatherwork: two needles, one thread, passing
through the same hole from both sides. Relevant because both mating pieces must have *the same
number of holes* in the same positions.

**Seam allowance** — The margin of material outside the stitch line, between the stitching and the
cut edge. In this codebase it is modelled as a *derivation direction*: a cut contour derived
outward from a stitch line by the allowance distance. (The inverse derivation — stitch line inward
from cut contour — is called a **stitch inset** and is the more common workflow.)

**Cut line / cut contour** — The outline actually cut from the leather. A part has exactly one
outer cut contour and any number of inner ones (windows, card slots, cut-outs).

**Fold line** — Where the leather bends rather than being cut. Carries a fold direction (mountain
or valley) and, later, a bend allowance, because leather with thickness does not fold on a
zero-radius line.

**Marking line** — A non-cut, non-stitch guide printed on the template: glue-area boundaries, logo
placement, alignment references.

**Gusset** — A side panel that gives a bag or case its depth. The classic source of thickness-math
errors, because its length must account for the material thickness it wraps around.

**Grain direction** — Leather is anisotropic; it stretches more across the backbone than along it.
Parts carry a grain direction annotation so the template can be oriented correctly on the hide.

**Skiving** — Thinning leather at an edge or fold. Represented (later) as a marking region, not
geometry.

**Burnishing / edge finishing** — Not modelled geometrically. Mentioned only because "edge
allowance" sometimes means the burnishing margin rather than the seam allowance; the app uses
"seam allowance" only in the stitch-line sense above.

## Application terms

**Project** — The whole document. One `.lcp` file. Contains parts, settings, and assets.

**Part** (or **pattern part**) — One physical piece of leather to be cut out. The unit of naming,
quantity, mirroring, and placement.

**Feature** — Any semantic piece of geometry belonging to a part: a cut contour, stitch line, fold
line, marking line, hardware hole, stitch hole set, or measurement. The discriminated union at the
centre of the domain model.

**Layer role** — The semantic category of a feature (`cut`, `stitch`, `fold`, `mark`, `hardware`,
`annotation`). Drives screen style, export layer name, and validation rules. Not a user-managed
layer stack — the roles are fixed by the domain.

**Derivation** — A one-way dependency from one feature to another (stitch line derived from cut
contour; holes derived from stitch line). Forms a DAG. See [domain-model.md](domain-model.md) §4.

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
size, margins, and overlap. Shared by the PDF writer and the on-screen print preview, so that they
cannot disagree.

**Registration mark** — Crosshairs, corner marks, and tile labels printed on tiled pages so the
user can align and tape them together accurately.

**Calibration** — Two distinct things, kept separate in the docs:
1. *Verification*: a 50 mm square and 100 mm ruler printed on every page so the user can check
   scale with a steel rule.
2. *Correction*: a stored per-printer scale factor applied to output to compensate for a printer
   that is measurably off. Correction is a last resort; wrong print settings are the usual cause.
