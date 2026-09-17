# Phase 4 reconciliation — design

**Date:** 2026-09-15
**Status:** Accepted, 2026-09-15
**Scope:** everything left in Phase 4 (4.3, 4.8, 4.9, 4.10, 4.11, 4.12) and the foundations they share
**Decisions recorded as:** ADRs [0009](../../adr/0009-explicit-resolution-when-deleting-a-source.md),
[0010](../../adr/0010-anchors-address-geometry.md), [0011](../../adr/0011-one-vendored-typeface-outlined-on-paper.md),
[0012](../../adr/0012-mirror-is-a-derivation.md), [0013](../../adr/0013-invariants-are-enforced-rules-are-reported.md)
**Invariants and diagnostics live in:** [`domain-model.md`](../../domain-model.md) §8, the enduring home. This document refers to them by id.

---

## Why this exists

Six slices that are each reasonable on their own can add up to a system that is not. A decision in
4.3 about selection, or in 4.8 about what a mirror is, can quietly force 4.9–4.12 to be redesigned.

So before building the rest of Phase 4, this document does four things:

- establishes how its features relate to each other;
- resolves where the design documents and the code disagree;
- fixes the invariants every slice has to keep;
- derives the build order from the dependencies, not from the slice numbers.

The test for every decision below is what a leatherworker meets when Phase 4 is finished: one
consistent set of answers to the same questions. What depends on what. What a delete does. Where
text comes from. How a problem is shown. Not six features that each answer them differently.

## 1. What is true today

Verified against `main` at `43c7bbc`, by probe or by reading the code. Not inferred from the docs.

### 1.1 Defects this pass found

| # | Defect | Evidence |
|---|---|---|
| D1 | **PDF export fails for Polish names.** pdf-lib's standard Helvetica is WinAnsi-encoded. `page.drawText` throws on `ł`, `ę` and `Ł`, and `exportPdf` draws the part name and the project name with it. | Probe; `export/src/pdf/writer.ts` (`drawPage`, `drawFooter`) |
| D2 ✅ | **Flipping a rectangle is wrong.** A reflection keeps the origin and changes the rotation, so the rectangle stays in place with its rounded corners diagonally opposite. | Probe: expected x ∈ [−10, 0], arc centre (−2, 3); got x ∈ [0, 10], arc centre (8, 2). **Fixed in 3.7b**, judged against transforming the evaluated path |
| D3 | **An offset that splits drops pieces silently.** | `evaluate.ts`: `const [result] = offsetPath(...)` |
| D4 | **A failed feature vanishes from the canvas.** | `buildDisplayList` skips `!entry.ok` |
| D5 | **Two refusals are silent.** Creating a derivation that would close a cycle, and moving a derived feature. | `addDerived` returns the document unchanged; `transformFeature` returns a derived feature unchanged |
| D6 ✅ | **"Inward" is decided by winding, not by material.** Right for an outer contour, wrong for a cut-out, whose material is outside the path. **Fixed in 4.3a**, where cut-outs first become creatable | `applyDerivation` reads the signed area |
| D7 ✅ | **Project defaults are ignored.** The panel adds stitch lines at a hard-coded 3.5 mm; `settings.defaultStitchInsetMm` is never read. **Fixed in 4.3a**: the commands read the project | `PropertyPanel.tsx`: `DEFAULT_STITCH_INSET_MM` |
| D8 ✅ | **`locked` is only a pick lock.** Hit-testing and snapping skip locked features; every command still edits and deletes them. **Fixed in 4.3b**, with the parts panel that is the only way to unlock one | `hitTest.ts`, `snap.ts`; no command reads it |

### 1.2 What already exists to build on

- One `derived` source with typed `Derivation` ops, recursive evaluation memoised on object identity,
  per-feature errors, command-time cycle refusal, and derivations across parts.
- Anchors (`anchors.ts`): corner positions by arc length, indexed, for root features. None for
  derived ones.
- `refusedTransforms`: a pure query that shares a command's check. The pattern ADR 0013 generalises.
- `offsetPath` returning `Path[]`, `MatOps.fromMirror`, `PathOps.containsPoint`, `selfIntersections`.
- A stitch report with per-run counts and a `spacingWarning` above 25 % deviation.
- Display-list text in device pixels. `ExportScene` carries no text; the PDF writer draws its own.

## 2. Where the documents and the code disagree

| Topic | The documents say | The code does | Resolution |
|---|---|---|---|
| Geometry sources | `domain-model.md` §4: separate `offset`, `mirror`, `transform`, `boolean` kinds with `fromId` | One `derived` kind with a typed op | **The code.** Mirror becomes an op (ADR 0012) |
| Parametric shapes | `rect {w, h, radii: [4]}`, `ellipse`, `polygon` | `rect {width, height, radii: named, rotation}`, `circle`, `arc` | The code. Ellipse and polygon listed as not built |
| Stitch hole set | Fields on the feature, `stitchLineId`, a hole shape | Parameters in the op; no hole shape | The code. Hole shape later |
| Corner policy | An object with angle thresholds and a radius-aware variant | `'continuous' \| 'hole-at-corner'` | The code. Thresholds and radius-aware later |
| Deleting a source | §4.5: bake | Cascade, and remove parts left empty | **Neither.** Explicit resolution (ADR 0009) |
| Measurement anchors | §3.7: `segmentIndex` | Not built | Anchors (ADR 0010) |
| Evaluation | Typed errors, topological order, hash memo | String errors, recursion, identity memo | Recursion and identity memo stay; errors become typed (ADR 0013) |
| Failed features | §4.4: draw as a warning outline | Invisible (D4) | Draw as warnings (ADR 0013) |
| Winding | §3.1: normalised on evaluation, outer CCW, inner CW | Not normalised; inward read from signed area | **No normalisation.** Reversing a path would renumber its anchors. "Inward" means into material, resolved per role (§3.4) |
| Part | `materialId`, `grainDirection`, `notes`, `transform` | `name`, `quantity`, `features` | Not built in Phase 4. `transform` dropped for now (ADR 0012) |
| Selection | `architecture.md` §6.5: parts, features, vertices; click a part, double-click to drill down | Features only | Features and parts (§3.1). Vertices wait for 3.9 |
| Validation | §8: twelve codes as one list | Nothing; string errors | Invariants versus rules (ADR 0013) |
| Spacing warning | §6.3: warn above 5 % | Warn above 25 %, with a written reason | **Both, as two levels.** Info above 5 % (visibly uneven); warning above 25 % (crowding, tear-out) |
| File example | `file-format.md` §3.1 shows the old model | Format version 3 | Example rewritten to version 3 |
| Export text | `printing.md` §4: `ExportScene` text items | None; the writer uses Helvetica | Typography (ADR 0011) |
| Export scene | `printing.md` §4: one flat list of items, with point items for holes | Whole parts with their paths and bounds, placed by the paginator; holes as true-size circles | The code. `printing.md` §4 rewritten, with text planned for 4.11 |
| Status | `domain-model.md`: "Design — no implementation yet" | Built through 4.7 | Status and per-section markers |

## 3. The system

### 3.1 Parts and cut-outs

A **part** is one piece of leather. It has at most one outer cut contour, and any number of inner
contours, called **cut-outs**: card-slot windows, hardware cut-outs.

- **At most one outer contour** is structural (S5). No command creates a second.
- **Exactly one** is a design rule (`PART_HAS_NO_OUTER_CONTOUR`, DR1). A part being redrawn
  legitimately has none for a while.
- **Everything in a part lies on its material**: inside the outer contour and outside every cut-out
  (DR2). One rule family with per-kind allowances, not a separate check per kind. A hole needs edge
  clearance; a marking line may touch the edge.
- **Parts are removed only by deleting the part** (ADR 0009). An emptied part stays, named, and is
  reported as `EMPTY_PART`.
- **Selection gains parts.** `Selection` becomes `{ parts, features }`.
  - Clicking a part's heading in the parts panel selects the part.
  - Canvas clicks still select features.
  - The **target part** for anything that joins a part is the selected part, or the one part the
    selected features belong to. That is the 4.7 rule, unchanged.
- **The parts panel shows the dependency tree.** Derived features nest under what they follow:
  *Outline ▸ Stitch line ▸ Holes*. This is where the reference graph becomes visible, which is what
  keeps the delete dialog unsurprising.
- **Lock means locked** (S7). No command changes or deletes a locked feature until it is unlocked,
  and each refusal says why. Its dependents still follow it; it simply cannot change. Visibility
  and lock toggles live in the parts panel.
- **Defaults come from project settings** (X8), never from constants in a component (D7).

### 3.2 Duplication and mirroring

Three operations, three different relationships to the original:

| Operation | Result | Relationship afterwards |
|---|---|---|
| **Duplicate part** | A new part beside the original | **None.** A copy. Derivations *inside* the part are re-pointed to the copies, so the copy's stitch line follows the copy's outline. Derivations to features in other parts keep pointing there |
| **Flip** | The selected geometry, reflected in place | **None.** The same features, changed |
| **Mirror** | A new feature or part, reflected | **Linked.** The counterpart follows its original (ADR 0012) |

- Duplicating never creates a reference from the original into the copy, and never breaks one
  inside it.
- A mirror preserves kind and role. Mirroring a part mirrors every feature in it. The counterpart's
  holes are the original's holes reflected, so hole counts match by construction, the property v1.2
  seam pairing needs.
- A mirror's placement is its own parameter: an axis and a glide. Moving or rotating the counterpart
  updates them. Scaling it is refused, because a counterpart is the size of its original.
- Flip needs `transformShape` to reflect correctly (D2). That is its own slice, 3.7b, built before
  mirror.
- There is no `Part.transform` (ADR 0012).

### 3.3 The reference graph and deletion

Features are connected by two kinds of edge, in one graph:

- **derives**: the target's geometry is built from the source (offset, stitch holes, mirror);
- **references**: the target points at the source's geometry without being built from it
  (measurement ends).

The graph's structural invariants (S2–S4), enforced by commands with a reason and by the loader
with the feature named:

- every edge resolves to an existing feature;
- the graph is acyclic, across both kinds of edge;
- every *derives* edge is allowed by the compatibility table (§3.4).

**Deleting** (ADR 0009):

- If nothing depends on it, it is deleted at once.
- If something does, the user chooses: delete the chain, freeze the direct derived dependents, or
  cancel. Dependents with no drawn form — references and stitch hole sets — are listed as deleted
  either way.
- **Re-pointing** is how a relationship survives replacing its source. Every derived feature's
  property panel shows *Follows: [feature]*, which can be changed to any compatible source that
  would not close a cycle.

**Gestures on derived features** (ADR 0012), none of which is ever silently ignored, detached or
converted (X3):

- A mirror-derived feature: move and rotate act on its parameters; scale is refused.
- An offset-derived feature or a hole set, on its own: moving is refused, with "it follows its
  outline — move the outline". Moving it together with its source works, because the source moves.

### 3.4 Stitch line, seam allowance and outline: one relationship, two directions

A stitch line and its outline are related by one number, the **stitch margin**: how far the thread
runs from the cut edge. Either end can be the one the maker dimensions.

- **Inset** (the common case): draw the outline, derive the stitch line inward.
- **Seam allowance**: draw the stitch line ("the pocket opening must be exactly 95 mm"), derive the
  outline outward.

Both use the same offset op. **"Inward" means into the part's material and "outward" means away
from it**, resolved by role rather than by path winding. For an outer contour the material is
inside; for a cut-out it is outside (D6). A stitch line around a card-slot window runs outside the
window, which is what "inward" means to a maker.

**Derivation compatibility.** These are the only *derives* edges commands create and the loader
accepts (S4):

| Target | Op | Source | Conditions |
|---|---|---|---|
| Stitch line | offset, inward | Cut contour (outer or cut-out) | Whole run or partial run |
| Outer cut contour | offset, outward | Stitch line | Source closed; whole run only, because an outline must be closed |
| Stitch hole set | stitch holes | Stitch line | |
| The same kind | mirror | The same kind | A cut contour keeps its role |

What follows from it:

- A part may have a **derived** outer contour. Its anchors come from the stitch line through the
  offset (ADR 0010), so measurements and runs can name its corners.
- One project default, `settings.defaultStitchInsetMm`, serves both directions. The field keeps its
  name, so no migration is needed; the panel labels it *Stitch margin*.
- A seam-allowance part is created by one command, as one undo step: a root stitch line and an
  outline derived from it (§3.8).
- Deleting that stitch line is exactly the case ADR 0009 exists for. The dialog lists the outline.

### 3.5 Anchors and measurements

**One addressing scheme** (ADR 0010). A place on a feature is `(featureId, anchor index)`:

- root features define anchors from their parameters, or from their corners;
- derived features inherit their source's anchors through the derivation;
- a missing anchor fails, and never re-targets a neighbour (E4).

**Annotations are features without a geometry source.** A measurement and a text label belong to a
part, carry no `GeometrySource`, and are resolved after the geometry they refer to.

```ts
interface Measurement extends AnnotationBase {
  kind: 'measurement';
  type: 'horizontal' | 'vertical' | 'aligned' | 'radial';
  a: MeasureRef;
  b?: MeasureRef;               // absent for radial
  offsetMm: Mm;                 // how far the dimension line sits from the geometry
  precision: 0 | 1 | 2;         // decimal places shown
}

type MeasureRef =
  | { kind: 'anchor'; featureId: FeatureId; anchor: number }
  | { kind: 'centre'; featureId: FeatureId }                       // a circle or an arc
  | { kind: 'extent'; featureId: FeatureId; side: 'left' | 'right' | 'bottom' | 'top' };
```

- **Every end references geometry.** There are no free points, because a dimension to a free point
  goes stale without saying so.
- **The value is generated, never stored** (X6), and is shown at `precision`.
- **The measure tool builds refs from snaps.** A corner snap becomes an anchor ref and a centre snap
  a centre ref. A snap with no durable ref (grid, on-path, midpoint) is refused with a reason.
- A measurement whose anchor has gone fails with `ANCHOR_MISSING` and draws as a warning.
- A measurement belongs to the part of its first reference.

### 3.6 Typography

ADR 0011. The flow:

```
font file ──(development script)──▶ metrics + glyph outlines, committed as data
                                              │
                                   packages/typography
                            layout(text, sizeMm, align) → glyphs in mm
                              ┌───────────────┴────────────────┐
             render: document-text display item       export: ExportScene text
                   │                                          │
   canvas: the font, via FontFace,                SVG and PDF: filled glyph outlines
   placed at the laid-out positions               (no font embedded)
```

- **Document text** (millimetres, can reach paper) and **overlay text** (pixels, screen only) are
  different display-item types (X5).
- **Text that restates a model value is generated, never stored** (X6): measurement values, and part
  captions such as "Card holder — cut 2". Only free text labels store their text.
- A **text label** is an annotation: `{ kind: 'text-label'; text; at: Vec2; sizeMm; rotationRad }`.
  It moves with its part.
- **Part captions appear on the canvas as well as on paper**, from the same layout. Today they exist
  only on paper, in Helvetica.
- A character outside the typeface renders as a replacement glyph and raises `TEXT_GLYPH_MISSING`.
  Nothing throws.
- Document text below 1.5 mm raises `TEXT_TOO_SMALL_TO_PRINT` (DR5).

### 3.7 Validation, and how a problem reaches the user

ADR 0013. Three categories, one pipeline:

```
commands refuse, with a reason ──┐        loader refuses, naming the field
                                 ▼
Document ──evaluate──▶ ResolvedProject ──validate──▶ Diagnostic[]
                        (typed failures)            (outcomes + design rules)
```

```ts
interface Diagnostic {
  code: DiagnosticCode;               // stable string
  severity: 'error' | 'warning' | 'info';
  message: string;
  partId: PartId;
  featureId?: FeatureId;
  related?: readonly FeatureId[];
  at?: Vec2;                          // zoom-to-problem; falls back to the feature's bounds
}
```

Every surface reads the same list (X7):

| Surface | Shows |
|---|---|
| **Problems panel** | Every diagnostic, grouped by part, errors first. Clicking one selects the feature and zooms to it |
| **Parts panel** | A count badge on each part and each feature row |
| **Property panel** | The selected feature's diagnostics |
| **Canvas** | Failed features as warning outlines; the location of the selected diagnostic |
| **Export** | Refuses nothing. Warns that errors exist and that failed features are left out |
| **Status bar** | Gesture refusals only. Never diagnostics |

Validation is memoised per part, on the same identity keys as evaluation.

### 3.8 Drawing modes: selection chooses where, never what

Slice 4.7 made the kind of a drawn feature a tool setting. With cut-outs and seam allowance added,
that setting would start meaning different things depending on what is selected. Because a new
feature is selected the moment it is drawn, the *next* draw would then quietly change meaning.

So (X4): **each mode has one fixed result, and selection only chooses which part.**

| Mode | Result | Needs a selected part |
|---|---|---|
| **Outline** | A new part with an outer contour | No, and never reads selection |
| **Stitch + allowance** | A new part: a stitch line and an outline derived outward | No, and never reads selection |
| **Cut-out** | An inner contour | Yes |
| **Stitch** | A stitch line | Yes |
| **Fold** | A fold line | Yes |
| **Marking** | A marking line | Yes |

- The hardware and text tools join the selected part. The measure tool needs no part selected; the
  measurement joins the part of its first reference.
- **An open path drawn in Outline, Cut-out or Stitch + allowance mode is refused with a reason** (S6), because each of those has to enclose an area. Today an open
  path in *Cut* silently becomes a marking line, which is the "mode means something else" problem
  in miniature.

## 4. Invariants

Defined, with their enforcement point, in [`domain-model.md`](../../domain-model.md) §8. By category:

- **Structural, enforced (S1–S10).** S1 unique ids · S2 every reference resolves · S3 the reference
  graph is acyclic · S4 every derivation is in the compatibility table · S5 at most one outer contour
  per part · S6 outlines and cut-outs enclose an area · S7 a locked feature changes only by being
  unlocked · S8 derived geometry is never persisted · S9 nothing addresses geometry by segment
  index · S10 positive quantities, distances, pitches and sizes.
- **Evaluation outcomes (E1–E4).** E1 every feature resolves or fails with a typed failure · E2
  nothing is silently dropped from what is drawn or printed · E3 a failure is reported once, at its
  root · E4 a missing anchor fails and never re-targets.
- **Design rules, reported (DR1–DR6).** DR1 a part has an edge · DR2 everything in a part lies on its
  material · DR3 a cut path is unambiguous · DR4 stitching is regular enough to sew · DR5 printed text
  is legible · DR6 parts are removed only on purpose.
- **Interaction (X1–X8).** X1 no command fails silently · X2 no delete changes an unnamed feature
  without showing it · X3 derived features are never silently detached, converted or ignored · X4
  selection chooses where, never what · X5 text that can reach paper is set in millimetres in the
  vendored typeface · X6 text that restates a model value is generated · X7 every problem surface
  reads one list · X8 defaults come from project settings.

## 5. Diagnostics

The catalogue, with the invariant each code protects and the slice it lands in, is
[`domain-model.md`](../../domain-model.md) §8.6. Two facts from it shape the order:

- **Four codes from the old list are retired**, because they describe states that are now
  unrepresentable rather than reportable: `PART_HAS_MULTIPLE_OUTER` (S5), `CONTOUR_NOT_CLOSED` (S6),
  `BROKEN_DERIVATION` (S2 for deleted sources, with `SOURCE_FAILED` for failed ones), and
  `HOLES_OUTSIDE_PART`, folded into `OUTSIDE_PART`.
- **Rules land with the slice that creates the state they check**, not all in 4.12. The channel
  comes first (4.12a), and each slice after it adds its own codes.

## 6. Format changes

The rule recorded in `v1_to_v2.ts` still holds: a new persisted variant means a version bump, a
fixture and a migration. Each slice that adds one bumps the version.

| Slice | Persisted change | Migration |
|---|---|---|
| 4.2b | `frozenFrom?: string` on features; a part's `features` may be empty | Identity |
| 4.8 | The `mirror` derivation op | Identity |
| 4.10 | The `measurement` annotation kind | Identity |
| 4.11b ✅ | The `text-label` kind and its `text` source (format version 5) | Identity |

- **4.3 and 4.9 add no persisted variants.** Cut-outs use the existing `role: 'inner'`, lock the
  existing `locked`, and seam allowance the existing `side: 'outward'`.
- **The loader gains the graph checks (S2–S4) in 4.2b, and the part checks (S5–S6) in 4.3.** A
  hand-edited file that satisfied the schema but broke them used to load; it will now be refused with
  the feature named. Nothing has shipped, so no user file is affected.

## 7. Build order

Derived from what each slice needs, not from its number. Slice numbers stay stable identifiers.

| # | Slice | Delivers | Needs |
|---|---|---|---|
| 1 | **4.2b** Reference graph and deletion | Compatibility table · `planDelete` and the dialog (delete / freeze / cancel) · re-point (*Follows*) · parts kept when emptied · refusal queries for cycles and derived moves · loader checks S2–S4 | — |
| 2 | **4.12a** Diagnostic channel | Typed failures · `OFFSET_SPLIT` (D3) · `validate()` with the stitch and offset rules · problems panel (list and select) · failed features drawn as warnings (D4) | 4.2b |
| 3 | **4.11a** Typography ✅ | Vendored typeface · `packages/typography` · millimetre text items · outlines in SVG and PDF · Helvetica removed (D1) · part captions on canvas | — |
| 3b | **4.11b** Text labels ✅ | The `text-label` feature kind, its editor, format bump and fixture | 4.11a |
| 4 | **4.4b** Anchors through derivations | Offset corner correspondence · hole sets expose their line's anchors · `ANCHOR_MISSING` | 4.12a |
| 5 | **3.7b** Reflections ✅ | `transformShape` reflects correctly (D2), property-tested against transforming the evaluated path · a Flip command | — |
| 6 | **4.3a** Cut-outs and part rules ✅ | Drawing modes (§3.8) · cut-outs · material-relative inward (D6) · defaults from settings (D7) · part rules · loader checks S5–S6 | 4.2b, 4.12a |
| 6b | **4.3b** Parts panel ✅ | Part selection · dependency tree · delete and duplicate part · visibility and lock (D8) | 4.3a |
| 7 | **4.8a** Mirror, the operation ✅ | The mirror op · mirror a feature · placement by axis and glide · re-parameterising gestures · scaling refused · format 6 | 4.2b, 4.4b, 3.7b, 4.3 |
| 7b | **4.8b** Mirror, the composition | Mirror a part · mirror across a fold line · labels · hole parity by construction · the pair in the dependency tree | 4.8a |
| 8 | **4.9** Seam allowance | *Stitch + allowance* mode · outward offsets · stitch margin | 4.2b, 4.4b, 4.3 |
| 9 | **4.10** Measurements | Measure tool · measurement annotations · anchor, centre and extent refs · values set through typography | 4.2b, 4.4b, 4.11 |
| 10 | **4.12** Validation complete | Zoom-to-problem · badges · export warning · the invariant audit test | All of the above |
| 11 | **Close-out** | One end-to-end scenario across the phase · roadmap summary · final pass over the docs | All |

Why the order departs from the numbers:

- **Graph and diagnostics come first** because every later slice deletes things, derives things
  and fails in new ways. Built after, each of those would be retrofitted.
- **Typography comes third, not just before measurements**, because D1 breaks PDF export today for
  any name containing `ł ą ę ś ź ż ć ń`, and nothing in 4.11 depends on the graph work.
- **4.3 precedes mirror and seam allowance** because part selection, the dependency tree and
  material-relative "inward" are what mirror-a-part and seam allowance are built on.
- **Mirror precedes seam allowance** because it reuses 4.3's duplicate-part machinery directly, and
  exercises anchor mapping through an exact transform before a derived outline relies on offset
  correspondence in real projects.

Each slice still gets its own short spec that points back here, tests first in the pure layers, a
pull request, green CI, and a merge before the next one starts.

## 8. Architecture decisions

| ADR | Decision |
|---|---|
| [0009](../../adr/0009-explicit-resolution-when-deleting-a-source.md) | Deleting something others depend on asks: delete the chain, freeze, or cancel. Never a silent cascade or bake |
| [0010](../../adr/0010-anchors-address-geometry.md) | Anchors are the only way to address a place on a feature, and they carry through derivations |
| [0011](../../adr/0011-one-vendored-typeface-outlined-on-paper.md) | One vendored typeface, laid out once in millimetres; the font on screen, outlines on paper |
| [0012](../../adr/0012-mirror-is-a-derivation.md) | Mirror is a derivation with its own placement; no part transform in Phase 4 |
| [0013](../../adr/0013-invariants-are-enforced-rules-are-reported.md) | Structural invariants are enforced; design rules are reported; one diagnostic list |

Recorded here rather than as ADRs, because they are product decisions inside the existing
architecture: the drawing-mode rule (§3.8), the dependency tree in the parts panel, the two spacing
levels, what lock means, and keeping emptied parts.

## 9. Documents changed with this design

- **`domain-model.md`**: rewritten to describe the system as built and as designed, with per-section
  status. Now the home of the invariants (§8).
- **`architecture.md`**: layering (`typography`), data flow (`validate`, typography), selection.
- **`printing.md`**: text on paper is outlines.
- **`file-format.md`**: the §3.1 example is now format version 3.
- **`glossary.md`**: anchor, reference, freeze, re-point, cut-out, flip, linked mirror, stitch margin,
  annotation, structural invariant, design rule, diagnostic, document and overlay text.
- **`roadmap.md`**: Phase 4 entries rewritten; 3.7b, 4.2b, 4.4b and 4.12a added; the build order
  stated.
- **`CLAUDE.md`**: points Phase 4 work at this document and the ADRs.
- **Superseded in place, with a note rather than a rewrite:** the cascade in the stitch derivation
  design, the drawing-mode rule in the fold, mark and hardware design, and the rectangle mirror row
  in the transforms design.

## 10. Deferred, so it is not relitigated

- **`Part.transform`, materials, grain direction, notes, persisted guides.** None is needed for
  Phase 4's features.
- **Selection drill-down and vertex selection.** Slice 3.9, which needs vertex ids first (ADR 0010).
- **Rows of holes along a line** (a belt's adjustment holes). A derived hole set along a line, the
  follow-on recorded in the 4.7 design.
- **Angular measurements; slot and diamond hole shapes; the radius-aware corner policy.**
- **Boolean operations, seam pairing and hole-count parity, templates.** Their existing phases.
- **Linked copies that are not mirrored.** `quantity` already covers identical pieces.
- **Whether a command should ever move the viewport** (noticed in 4.3b). Duplicate places the copy
  clear of the original, which can put it outside the view: the copy is correct and invisible until
  the drawing is framed. The question is not Duplicate's — it belongs to **every command that
  creates or transforms geometry away from where the user is looking**: duplicate, mirror (4.8),
  seam allowance (4.9), paste, and whatever comes after. Answering it one command at a time is how
  an editor acquires a viewport that jumps unpredictably, so it wants a single deliberate
  interaction design, plus the plumbing to match — framing the selection needs the viewport lifted
  out of `CanvasHost`. **Not to be attached to whichever slice happens to expose it.**

## 11. Decided, and still to approve

- **The typeface: IBM Plex Sans**, chosen on 2026-09-15 for the reasons in ADR 0011.
- **Both approvals were given on 2026-09-16**, when 4.11a started: the font files come from the
  `@ibm/plex-sans` package and are committed to `assets/fonts/`, and `opentype.js` extracts the
  glyph outlines at development time. IBM's telemetry postinstall is declined in
  `pnpm-workspace.yaml`. See the
  [typography design](2026-09-16-typography-design.md).
