# Built-in template audit — 8.14b

Audited against `develop` at `58e3b7f` using the real evaluator and isolated Electron sessions.
Recipes in `templates.test.ts` and `sampleProject.test.ts` build the shipping files through document
commands. File format 12, existing migrations and the print/export pipeline are unchanged.

## Construction status

The software checks below do **not** establish that a pattern has been sewn successfully.
The card-holder construction is a reviewable proposal (D19). The bifold's maker choices from
[the manufacturing spec §8](superpowers/specs/2026-11-03-seams-and-manufacturing-design.md#8-questions-for-a-maker-814b)
and the sewn card-holder check remain pending. The roadmap therefore keeps 8.14b in progress.

## Card holder — matching derived stitching proposed

The outer remains 105 × 70 mm with 4 mm corners, stitching inset 3 mm and 86 holes. The pocket
remains 105 mm wide and cut twice. The proposal changes its height from 45 to **43.6092 mm** and
its top corner radii from square to **3 mm**; the bottom radii remain 4 mm. Its stitching is a
3 mm inward offset between outline corners 2 and 1, following the left, bottom and right sides.

The original plan's 44.39 mm estimate assumed the old drawn line's endpoints. A partial offset
ends at its selected contour corners: a square top corner puts its endpoint on the cut edge.
Rounding the top corners to the inset radius puts the endpoint 3 mm below the opening, without
changing existing derivation semantics. The height then gives ten gaps of the outer's achieved
side spacing, rounded to the storage quantum. This is a construction change requiring maker review.

| Declared seam | Pocket and outer counts | Maximum paired drift |
|---|---|---|
| Left | 11 = 11 | less than 0.00002 mm |
| Bottom | 27 = 27 | within `EPS_LENGTH` |
| Right | 11 = 11 | less than 0.00002 mm |

All three seams are explicit metadata; moving pieces on the board infers nothing. One pocket
pattern is cut twice. The evaluator reports no problems. Resizing the pocket outline moves its
stitching; tests also cover save/load and all declared seam verdicts.

The previous mismatched pattern is preserved unchanged as
[`card-holder-1.6.lcp`](../fixtures/regressions/card-holder-1.6.lcp), so 9.6's mismatch and endpoint
regressions keep testing the original 0.61 mm side drift and 0.43 mm bottom drift.

## Bifold wallet — geometry retained, maker answers pending

The existing 95 mm pocket has **87 mm between stitch lines**, giving 1.4 mm geometric clearance
for an 85.60 mm card. Leather thickness and stitching pull are not accounted for. This is a
measurement, not approval of the fit.

The lining is 2 mm inside the outer on each edge. When stacked, the outer's 3 mm inset stitching
is 1 mm from the lining edge. Whether that lining should be cut larger or trimmed after stitching
is unresolved. No trimming method is asserted by the template.

The thumb-scoop pocket's U stitching remains drawn: preserving its existing square opening,
4 mm top clearance and pocket dimensions does not fit the current corner-to-corner partial
offset's untrimmed ends. Deriving it requires a construction change or an explicit run-end trim
feature, not a hidden alteration of the shape. Its description names the unresolved fit and lining
construction. No seams are invented for a lining with no hole set: this template is punched as a
stack. The existing lining slot's fold mirror and measurement remain unchanged.

## Key fob — fold-linked rivet holes

The 140 × 26 mm strap, fold at x = 70 mm and 4 mm rivet holes at x = 14 and x = 126 mm keep their
geometry. The second hole is now a counterpart of the first across the named fold. Property tests
move both the source hole and the fold and check the counterpart follows. There is one rivet
through two layers; hardware summary counting remains 9.12's work.

## Coaster

The 100 mm rounded square and its 4 mm inset stitching were already derived and clean. Its file
and dimensions are unchanged; it participates in the same clean-load, save and PDF-export checks.

## Related fixes

- A partial path beginning at a corner could retain a floating-point remnant with no usable
  tangent. Offsetting that remnant incorrectly collapsed a valid pocket. `subPath` now checks
  boundary fragment **lengths**, using `EPS_LENGTH`, rather than applying a millimetre epsilon to
  a dimensionless parameter. Regression and property tests retain genuine short fragments.
- Properties now exposes a derived stitch line's whole/partial run and its durable corner indices.
  The existing derivation refusal prevents closing a line whose seams reference its open ends;
  the control displays that reason and leaves the document/history unchanged.

## Physical check to record

No physical result is recorded yet. To finish 8.14b:

1. Settle D19 and the bifold questions above. Export the agreed card-holder template through the
   app and print at actual size. Check scale using the established
   [print-verification procedure](print-verification-log.md).
2. Cut one outer and two pockets in the chosen leather. Record thickness, iron pitch and any
   trimming or skiving. Align the pockets' bottom and side edges on opposite faces of the outer.
3. Confirm 11 pairs on each side and 27 along the bottom align before sewing; sew the piece and
   record the outcome, including whether a card fits as intended.
4. Add the dated construction result to the verification log and tick 8.14b only after the required
   maker checks are complete. A software PDF export is not a physical pass.
