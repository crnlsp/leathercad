# Cut-outs and the rules that give them meaning (slice 4.3a) — design

**Date:** 2026-09-16
**Status:** Accepted with the [Phase 4 reconciliation](2026-09-15-phase-4-reconciliation-design.md)
**Invariants delivered:** S5, S6, X4, X8; DR1 and DR2 (`domain-model.md` §8)
**Defects fixed:** D6, D7

---

## Why this half first

4.3 is two jobs wearing one number: what a part *is* made of, and how the panel shows it. This is the
first — cut-outs, the modes that make them, and the rules that make them mean something. It is also
what 4.8 and 4.9 are waiting for: a mirror and a seam allowance both need a part whose material is
defined, and "the material" is exactly what a cut-out changes.

The parts panel — part selection, the dependency tree, duplicate, visibility and a lock commands
honour — is **4.3b**.

## Acceptance criteria

1. **Cut-out** mode draws an inner contour on the selected part. With no part selected, nothing
   happens and the status bar says why.
2. A part refuses a second outer contour (S5), and the loader refuses a file with one.
3. An **open** path drawn in Outline or Cut-out mode is refused with a reason (S6) rather than
   quietly filed as a marking line, which is what happens today.
4. Each drawing mode has **one fixed result**; selection only chooses which part (X4). Drawing an
   outline never reads the selection at all.
5. A stitch line inset from a cut-out runs **outside** it — away from the hole, into the leather
   (D6). Round an outer contour it still runs inside.
6. A part with features but no outer contour is reported (`PART_HAS_NO_OUTER_CONTOUR`); so is a
   cut-out that is not inside its part, a hole that is off the material, and a hole closer than
   1.5 mm to an edge.
7. New stitch lines and hole sets take their inset and pitch from **project settings** (D7).

## The drawing modes (§3.8)

| Mode | Result | Reads the selection |
|---|---|---|
| **Outline** | A new part with an outer contour | Never |
| **Cut-out** | An inner contour on the selected part | Yes |
| **Stitch** | A stitch line on the selected part | Yes |
| **Fold** | A fold line | Yes |
| **Marking** | A marking line | Yes |

One fixed result each, because a new feature is selected the moment it is drawn — so a mode that
read the selection to decide *what* to make would quietly change meaning on the next draw (X4).

**Stitch + allowance** is the sixth mode in the reconciliation's table and is **not built here**: it
makes a stitch line with an outline derived outward from it, which is seam allowance, slice 4.9. The
mode appears when the capability does.

## "Inward" is toward the material, not toward the winding (D6)

An offset's direction is currently decided by the source's winding, which is right for an outer
contour and backwards for a cut-out: the material of a part is *inside* its outline and *outside*
every hole in it. A stitch line round a thumb slot has to run in the leather, not across the gap.

So the domain resolves inward against the **role** of what is being followed — outer contour inward
means into the enclosed area, inner contour inward means away from it — and hands the geometry layer
a signed distance, as it already does. Geometry keeps knowing only left and right.

## Structural invariants, refused rather than reported

Both were listed in `domain-model.md` §8.6 as retired diagnostics, "unrepresentable rather than
reportable". This is the slice that makes that true:

| Invariant | Refusal | Where |
|---|---|---|
| S5 — a part has at most one outer contour | `PART_ALREADY_HAS_OUTER` | The command that would add it; the loader |
| S6 — outer contours and cut-outs enclose an area | `CONTOUR_NOT_CLOSED` | The drawing mode; the loader |

Both are structural codes in the existing registry, refused through the existing channel. No new
mechanism.

## Design rules, reported

Four rules over the resolved project, all protecting DR1 and DR2 — "a part is a piece of leather
with one edge", and "everything in a part lies on its material":

| Code | Severity | When |
|---|---|---|
| `PART_HAS_NO_OUTER_CONTOUR` | error | The part has features but nothing to cut them from |
| `CUT_OUT_OUTSIDE_PART` | error | An inner contour is not inside the outer one |
| `OUTSIDE_PART` | error for holes, warning for lines | A feature is off the material — outside the outline, or inside a hole |
| `HOLE_TOO_CLOSE_TO_EDGE` | warning | A hole is nearer than 1.5 mm to any edge, where the leather tears |

The last two were deferred here from 4.12a, which recorded that they need material-relative
containment — which is what this slice builds.

**The material** of a part is: inside its outer contour, and outside every inner one. One function,
used by every rule, so they cannot disagree about what "on the part" means.

`PathOps.distanceToPath` is added to geometry for the edge distance: `isPointOnPath` already
computes exactly this and throws the number away.

## Defaults come from settings (D7)

`settings.defaultStitchInsetMm` and `settings.defaultIronPitchMm` exist and nothing reads them; the
panel hard-codes 3.5 and 3.85. The commands that add a stitch line and a hole set now take their
defaults from the project (X8).

## Deliberately not here

- **The parts panel**: part selection, the dependency tree, duplicate and delete a part, visibility,
  and a lock commands honour (D8). Slice 4.3b.
- **Stitch + allowance**, the sixth mode. Slice 4.9.
- **Mirror**, and anchors through it. Slice 4.8.
- **Cut-outs in the export preset**: an inner contour already prints as a cut line; nothing about
  presets changes here.

## Tests

- Cut-out mode: creates an inner contour on the selected part; refuses with no part selected; an
  open path refused in both enclosing modes.
- S5: a second outer contour refused by the command and by the loader, with the feature named.
- D6: a stitch line inset from a cut-out is **larger** than the cut-out and stays inside the part; the
  same inset round the outer contour is smaller than it. Property: for any panel and any hole, the
  stitch line round the hole never enters the hole.
- The rules, each at and either side of its threshold, and each naming the right feature.
- Defaults: a stitch line added with settings at 4 mm is inset 4 mm, not 3.5.
- E2E: draw a panel, draw a cut-out in it, see two features on one part and no problems; draw an open
  path in Cut-out mode and see the refusal.
