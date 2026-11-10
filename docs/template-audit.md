# Built-in template audit — 8.14b

Audited against `develop` at `58e3b7f` using the real evaluator and isolated Electron sessions.
Recipes in `templates.test.ts` and `sampleProject.test.ts` build the shipping files through document
commands. File format 12, existing migrations and the print/export pipeline are unchanged.

## Construction status

The software checks below do **not** by themselves establish that a pattern goes together; the leather check below does, for the card holder only.
The maintainer approved the revised card-holder design (D19) on 2026-11-10 and settled the bifold's
maker questions from
[the manufacturing spec §8](superpowers/specs/2026-11-03-seams-and-manufacturing-design.md#8-questions-for-a-maker-814b)
as D20 on 2026-11-11. On 2026-11-11 the maintainer cut the card holder in leather and its holes
lined up on all three seams; that is [logged](print-verification-log.md#built-in-template-construction--814b),
and 8.14b is done. The bifold, key fob and coaster were not made in leather.

## Card holder — matching derived stitching approved

The outer remains 105 × 70 mm with 4 mm corners, stitching inset 3 mm and 86 holes. The pocket
remains 105 mm wide and cut twice. The approved design changes its height from 45 to **47.3487 mm** and
its top corner radii from square to **3 mm**; the bottom radii remain 4 mm. Its stitching is a
3 mm inward offset between outline corners 2 and 1, following the left, bottom and right sides.

The original plan's 44.39 mm estimate assumed the old drawn line's endpoints. A partial offset
ends at its selected contour corners: a square top corner puts its endpoint on the cut edge.
Rounding the top corners to the inset radius puts the endpoint 3 mm below the opening, without
changing existing derivation semantics. The revised height gives eleven gaps of the outer's achieved side spacing (3.7394586 mm).
The exact height is 47.3486465 mm; rounding **up** to the storage quantum keeps the last outer
hole inside the declared stretch. Nearest rounding would exclude that hole. D19's design approval
does not establish the result of sewing it in a particular leather.

| Declared seam | Pocket and outer counts | Maximum paired drift |
|---|---|---|
| Left | 12 = 12 | less than 0.00006 mm |
| Bottom | 27 = 27 | within `EPS_LENGTH` |
| Right | 12 = 12 | less than 0.00006 mm |

All three seams are explicit metadata; moving pieces on the board infers nothing. One pocket
pattern is cut twice. The evaluator reports no problems. Resizing the pocket outline moves its
stitching; tests also cover save/load and all declared seam verdicts.

The previous mismatched pattern is preserved unchanged as
[`card-holder-1.6.lcp`](../fixtures/regressions/card-holder-1.6.lcp), so 9.6's mismatch and endpoint
regressions keep testing the original 0.61 mm side drift and 0.43 mm bottom drift.

## Card sizes and the taller pocket — research and test target

The maker reviewed the first paper proposal and requested a slightly higher pocket. The previous
43.6092 mm cut height provided 40.6092 mm of nominal depth (75.2% of a payment card). The revised
47.3487 mm height provides **44.3487 mm** from the bottom stitch line to the straight opening:
**82.2% coverage and 9.6313 mm exposed** for a landscape payment card. Cut height divided by card
height would overstate coverage: the bottom 3 mm is the stitch allowance.

Card sizes checked on 2026-11-10, width × height in landscape. These are finished dimensions,
not print bleed dimensions; business-card conventions vary within regions.

| Card / market | Typical size, mm | Exposed above revised opening, mm | Source |
|---|---|---|---|
| Payment / ID-1, worldwide | 85.60 × 53.98 | 9.63 | [Entrust card-printer manual](https://www.entrust.com/sites/default/files/documentation/userguides/528060-001a_sigma_ds1_ds2_ds3_ug.pdf), [ISO/IEC 7810](https://www.iso.org/standard/70483.html) |
| Business, much of EU / UK | 85 × 55 | 10.65 | [AzePrint regional guide](https://www.azeprint.com/print-packaging-guide/business-card-sizes-around-the-world.html) |
| Business, US / Canada | 88.9 × 50.8 | 6.45 | [MOO US sizes](https://www.moo.com/us/business-cards/moo-size?product_id=101) |
| Business, Japan | 91 × 55 | 10.65 | [Raksul business-card printing](https://raksul.com/print/businesscard/) |
| Business, mainland China / Taiwan | 90 × 54 | 9.65 | [Howdy Creative regional guide](https://howdy-creative.co/en/business-card-size-en/) |
| Business, Australia / New Zealand | 90 × 55 | 10.65 | [Cardzilla Australian artwork specification](https://www.cardzilla.com.au/files/media/Artwork%20Guidelines%20-%20Business%20Cards.pdf), [Howdy Creative](https://howdy-creative.co/en/business-card-size-en/) |
| Business, Russia / CIS convention | 90 × 50 | 5.65 | [AzePrint regional guide](https://www.azeprint.com/print-packaging-guide/business-card-sizes-around-the-world.html) |

No reliable universal leathercraft coverage percentage was found in the consulted sources.
**80–84% for an ID-1 card is our design target for this revision, not an industry standard.** It
increases the covered area while keeping roughly 10 mm available to pinch. Shorter US business
cards expose only 6.45 mm, so test those if they are part of the intended carry. The 99 mm between
side stitch lines leaves 13.4 mm of total flat clearance for ID-1 and 8 mm for the widest listed
91 mm card. Those are geometric allowances, not a predicted grip or capacity.

Maker guidance is construction-specific. [MAKESUPPLY's minimalist-wallet build](https://projects.makesupply.co/templates/make-a-simple-minimalist-wallet-free-pdf-pattern/)
uses medium to medium-firm vegetable-tanned leather around 1.2–1.4 mm; [Rocky Mountain's horizontal
card-wallet pattern](https://www.rmleathersupply.com/products/rm-003-horizontal-card-snap-wallet-digital-pattern)
calls for 0.8–1.2 mm in a different construction. [MAKESUPPLY's three-pocket design](https://makest.shop/products/3-pocket-card-holder-no-1-template-set)
explicitly notes that capacity changes with use, leather type and thickness. These examples support
matching the material to the pattern and testing the intended load; they do not validate this one.
For our first sample, use the intended leather, record its thickness and firmness, finish the open
edges before assembly, and keep glue out of the card cavity. Check insertion, pinch access and
retention with one card and with the intended load, then repeat after insertion/removal cycles.
The open pocket has no positive closure: extra depth alone cannot guarantee against cards falling out.

### Review resources

- `fixtures/projects/card-holder.lcp`: revised pattern, one outer and a pocket cut twice.
- `fixtures/projects/card-fit-check.lcp`: six representative card cutouts, built through commands
  in `cardFitCheck.test.ts`. The marking line on each shows the revised pocket opening when the
  card bottom is seated at the bottom stitch line. It is a guide, not another cut.
- Open each project and **Export PDF** for the ordinary vector, 1:1 output with its 100 × 5 mm
  gauge. For a paper mock-up, cut the patterns and card blanks, align the bottom and side edges,
  and tape outside the stitch lines. Compare visible card height and pinch access. Paper cannot
  reproduce leather thickness, friction, stiffness or break-in; use real cards in the sewn sample.

## Bifold wallet — pocket widened, lining cut to match (D20)

The maintainer settled both §8 questions on 2026-11-11, choosing the common construction over a
new one:

- **Card pockets: stitched 3 mm in, as the outer is.** The 4 mm inset left 87.0 mm between stitch
  lines, 1.4 mm of room for an 85.60 mm card before the leather's thickness and the stitching's
  pull. The pocket stays 95 × 60 mm; its stitching now leaves **89.0 mm**, 3.4 mm of room. Sides
  53.00 mm · 15 holes · 3.786 mm; bottom 89.00 mm · 24 holes · 3.870 mm. A geometric allowance,
  not a promise of fit in a given leather.
- **Lining: cut to the outer's outline** (200 × 95 mm, 5 mm corners), glued while folded, trimmed
  flush, then punched with the outer. Cut 2 mm smaller, the outer's 3 mm stitching fell 1 mm from
  the lining's edge, under the 1.5 mm the edge rule asks; now it is 3 mm from both. Folding makes
  the inner layer overhang slightly at the edges; trimming flush removes it. The template's
  description says so.

The thumb-scoop pocket's U stitching remains drawn: it stops 4 mm under the square opening, which
the current corner-to-corner partial offset cannot. Deriving it needs an explicit run-end trim
feature, not a hidden change of shape. No seams are declared: the lining has no hole set of its
own and the template is punched as a stack. The lining slot's fold mirror is unchanged.

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

Recorded on 2026-11-11 for the card holder: holes line up on all three seams. The procedure, for
a fuller record or another template:

1. Export the approved card-holder template through the
   app and print at actual size. Check scale using the established
   [print-verification procedure](print-verification-log.md).
2. Cut one outer and two pockets in the chosen leather. Record thickness, iron pitch and any
   trimming or skiving. Align the pockets' bottom and side edges on opposite faces of the outer.
3. Confirm 12 pairs on each side and 27 along the bottom align before sewing; sew the piece and
   record the outcome, including whether a card fits as intended.
4. Add the dated construction result to the verification log. A software PDF export is not a
   physical pass.
