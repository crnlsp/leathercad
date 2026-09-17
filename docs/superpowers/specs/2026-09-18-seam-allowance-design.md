# Seam allowance — dimensioning the opening, not the edge (slice 4.9) — design

**Date:** 2026-09-18
**Status:** Accepted (2026-09-18). Criterion 5 confirmed as core workflow, not scope creep.
**Delivers:** the sixth drawing mode (§3.8), the outward half of §3.4
**Invariants touched:** none newly; this slice is a check that the existing ones already fit

---

## 1. The workflow, and why it is the other way round

Every derivation so far starts at the cut edge: draw the outline, inset the stitching. **Seam
allowance starts at the stitching**, and it is the direction a maker reaches for whenever the *inside*
dimension is the one that matters:

> A card pocket has to take a card. The opening must be **95 mm**, and what the edge does is
> whatever it must to leave 4 mm outside the seam. Drawing a 103 mm outline and insetting 4 mm to
> get there is arithmetic the maker should not be doing — and redoing every time the allowance
> changes.

Same for a pen slip, a gusset that must clear a frame, a phone pocket. The quantity that is
*specified* is the stitch line; the cut edge is consequence.

**One number, two directions** ([reconciliation §3.4](2026-09-15-phase-4-reconciliation-design.md)).
The stitch margin is the inset seen from the edge and the allowance seen from the stitching, so
`settings.defaultStitchInsetMm` serves both and needs no new field. The panel already calls it
**Edge margin** (4.8a), which reads correctly from either end.

## 2. What is already built — checked, not assumed

I probed the current code before designing anything, because this slice looked suspiciously small.
It is small: **the geometry and the graph already do this.** What follows is measured, not hoped.

| Question | Answer, as it stands today |
|---|---|
| Does an outward offset work? | **Yes.** A 95 × 60 stitch line with a 4 mm allowance gives −4…99 × −4…64, closed, 8 segments. |
| Does it depend on winding? | **No.** The same stitch line drawn clockwise gives the identical result — `applyDerivation` reads the actual signed area. |
| Do anchors survive? | **Yes.** Four corners in, four out, through `anchorsOnRun` (ADR 0010). |
| Concave shapes? | An L-shaped stitch line with a reflex corner offsets correctly at 3 mm and at 25 mm, keeping all six anchors. |
| Does the compatibility table allow it? | **Yes** — the *outer cut contour ← offset outward ← stitch line* row exists, with `allowance-needs-outer`, `allowance-needs-whole-run` and `allowance-needs-closed-line`. |
| Does S6 accept a derived outline? | **Yes.** `declaresClosed` already follows a whole-run offset to its source. |

So 4.9 is **not** a geometry slice. It is a drawing mode, a command, and the panel action that reach
what is already there. Saying so now is better than discovering it halfway through and quietly
widening the scope to fill the time.

## 3. The corner policy

An outward offset has to bridge the gap at every convex corner, and `offsetPathTraced` offers one
join: **round**, radius equal to the allowance.

**That is the correct answer here, not merely the available one.** It is what the tool physically
does: run a wing divider round the stitch line and the corner it traces *is* an arc of the
allowance's radius. And a sharp external corner in leather is fragile — it is the first thing to
curl, and makers round it anyway. A mitre would produce a point nobody would cut.

Two consequences worth stating rather than discovering:

- **A rectangular stitch line gives a rounded-rectangle outline**, corner radius = the allowance.
  That is right, and it is what the maker wants; it should not be read as the tool failing to keep
  the shape.
- **The derived outline's corner radii are not editable.** They are the allowance. Changing them
  means changing the allowance, which is the one number this relationship has.

No mitre join is added. Nothing in §1 needs one, and a join policy is a parameter that would then
have to be persisted, migrated and explained.

## 4. Where it gives up, and what it says

Probed: an L-shaped stitch line with a **60 mm** allowance — far larger than the notch it has to
swallow — fails with `OFFSET_COLLAPSED`, whose outward wording already reads *"A 60 mm allowance
cannot be built outside this stitch line."*

That is the analytic Tier 1 offset reaching its limit on a self-overlapping result, and it is
**outside the useful range by an order of magnitude**: a seam allowance is 3–8 mm. The slice's
position is that reporting it is the right behaviour and building Tier 2 to serve a 60 mm allowance
is not this slice's business (that is 9.11). A test pins that it *reports* rather than producing
something plausible and wrong.

## 5. The one invariant that needed checking: D6

4.8a left a marked limitation in `domain-model.md` §4.4:

> The direction is read from the **directly followed** feature's role… Seam allowance (4.9) derives
> an outline *outward from a stitch line*, and a stitch line does not have a role.

**Checked, and 4.9 does not hit it.** The ambiguous case would be an allowance grown from stitching
that runs around a *cut-out*, which would have to travel toward the hole. The compatibility table
forbids exactly that: `allowance-needs-outer` requires the target to be an **outer** contour, so the
representable case is always "grow the piece outward from its own seam", where *away from the
enclosed area* is the only reading and the current winding-based answer is right — verified in both
windings.

So `towardsMaterial` stays as it is, and the note in §4.4 stays, narrowed: it is a limitation of the
*representation*, met only by a derivation the table does not allow. **Lifting it is not needed here
and should not be done speculatively.** If a later slice wants seam allowance on a cut-out, that is
when orientation has to resolve through the derivation's root.

## 5a. The allowance is a **derived feature**, linked to its stitch line

Asked at review, and the answer is yes — by using the architecture that is already there rather than
adding anything beside it.

The outline the allowance produces is an ordinary **derived feature**:

```ts
{ kind: 'derived', sourceId: <the stitch line>, op: { type: 'offset', side: 'outward', run: { kind: 'whole' } } }
```

Which means, for free and by construction:

- **Editing the stitch line moves the edge.** Its width, its position, its shape — evaluation
  recomputes the outline from parameters on every change, and on every load (CLAUDE.md invariant 4).
- **Editing the allowance moves the edge**, through the same *Edge margin* field an inset stitch line
  already uses. One number, one relationship.
- **Nothing is baked.** The file stores "outward, 4 mm, from that stitch line" and not one coordinate
  of the resulting contour, so an improvement to the offset improves every file that already exists.
- **The graph already knows about it.** It is a *derives* edge, so S2, S3 and S4 cover it, the parts
  panel nests the outline under its stitch line, and deleting the stitch line reaches ADR 0009's
  dialog without a line of new code.

**One model, two ways in.** The drawing mode and the panel's *Add seam allowance* build the **same**
derivation — the second is `addAllowance` on an existing stitch line, the first is that plus the part
and the drawn stitch line, in one undo step. There is deliberately no second seam-allowance concept:
a "baked" or "one-shot" allowance would be a different thing wearing the same name, and the first
time a maker retyped an opening width and the edge did not follow, the model would have lied to them.

This is the same choice mirror made in 4.8a — a relationship, not a copy — and for the same reason.

## 6. Acceptance criteria

1. **Stitch + allowance** is the sixth drawing mode. It makes a **new part** containing a drawn
   stitch line and an outer contour derived outward from it, and **never reads the selection** (X4) —
   the same rule as *Outline*.
2. An **open path** drawn in that mode is refused with a reason (S6), as in *Outline* and *Cut-out*.
3. The allowance comes from **project settings**, not a constant (X8).
4. It is **one command and one undo step**: a part with two features, or nothing.
5. **The panel offers the same thing from an existing closed stitch line** — *Add seam allowance* —
   as a **first-class path, not a shortcut**: drawing the stitching first and deciding on the edge
   afterwards is the common order. It builds the identical derivation (§5a).
6. **Editing the stitch line moves the edge**, including its size, position and the allowance itself.
7. **Deleting the stitch line** is ADR 0009's case: the dialog lists the outline, and *freeze* keeps
   it as drawn geometry.
8. The derived outline's **anchors** are the stitch line's, so measurements and partial runs can name
   its corners (ADR 0010).
9. The part reports **no problems**: it has one outer contour (S5, DR1), closed (S6), and everything
   on its material (DR2).

## 7. What the command makes

```ts
export function addAllowancePart(
  partId: PartId,
  stitchId: FeatureId,
  outlineId: FeatureId,
  source: DrawnSource,
  allowanceMm?: Mm,          // omitted: the project's stitch margin (X8)
): Command;
```

A part named *Pocket* holding:

- a **stitch line** whose source is the drawn geometry — the root, and the thing the maker
  dimensions;
- an **outer contour** derived `offset / outward / whole` from it.

The stitch line is the root because that is what is being specified. This is the first part whose
outline is derived rather than drawn, which is precisely what §3.4 anticipated and what makes
deleting the stitch line interesting.

## 8. Deliberately not here

- **Holes on the stitch line.** *Add holes* already exists and is one click; folding it into the mode
  would make a mode that does three things.
- **A mitre join**, or any join parameter. §3.
- **Tier 2 offsetting** for allowances larger than the shape can carry. §4, slice 9.11.
- **Lifting D6's direct-source limitation.** §5 — not needed, so not touched.
- **Variable allowance** along a seam, or a different allowance per edge. One relationship, one
  number; a per-edge allowance is a different feature and nobody has asked for it.
- **Bend allowance across a fold** — `materialThicknessMm`, v1.1.
- **Viewport framing.** Still the reconciliation §10's, still not a slice's to adopt.

## 9. Tests

- **Property:** for any closed convex stitch line and any allowance in 1–10 mm, the derived outline
  encloses the stitch line, and every point of the stitch line is at least the allowance inside it.
- **Property:** the result is independent of the stitch line's winding.
- **Anchors:** a rectangular stitch line's four corners appear on the outline, at the reflected —
  here, offset — positions; an L keeps all six.
- **Corners:** a rectangular stitch line gives corner arcs of radius = the allowance, stated as a
  test because §3 says it is intended rather than incidental.
- **The margin comes from settings**, not 3.5.
- **Editing propagates:** change the stitch line's width, its position and the allowance; the outline
  follows all three.
- **Refusals**, each changing nothing: an open path in the mode (S6); an allowance on a partial run
  (`allowance-needs-whole-run`); a *cut-out* target (`allowance-needs-outer`); an allowance too large
  for the shape (`OFFSET_COLLAPSED`, reported not guessed).
- **Delete the stitch line**: the dialog lists the outline; *freeze* keeps it, drawn.
- **E2E:** draw a pocket opening in *Stitch + allowance*, see one part with two features and no
  problems; retype the opening width to 95 and watch the edge follow; add holes to the stitch line.

## 10. Settled at review

1. **The slice stays small and stays its own.** Not combined with 4.10 to make it bigger. That the
   offset already exists is the useful fact: this slice **connects and exposes** a capability rather
   than inventing work to justify itself.
2. **Criterion 5 is in, as core workflow.** A maker commonly creates the stitch line first and only
   then decides to generate the edge around it, so the existing-feature action is a first-class path
   beside the drawing mode — using the same derivation, never a second model (§5a).
3. **The allowance is linked and derived** (§5a), which is what the existing architecture gives when
   it is used as intended.

Carried unchanged from the design: round corners at the allowance's radius; anchors preserved;
winding-independent for the supported case; `OFFSET_COLLAPSED` reported rather than Tier 2 built;
`allowance-needs-outer` and D6's constraint left intact; no separate corner-radius editing.
