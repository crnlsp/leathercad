# Print verification log

`CLAUDE.md` forbids claiming print accuracy without a physical measurement recorded here. This file
is that record. **An entry is a measurement someone made with a rule against paper** — not a test
result, and not a calculation.

Automated checks already cover everything measurable without a printer: the PDF is rasterised with
poppler and measured in pixels, which renders through an independent implementation and measures
what a printer would be sent. What no automated check can cover is the printer, its driver, and its
paper handling. That is what this file is for.

## What to measure

Print `fixtures/projects/` or any pattern at 100%, then measure with a steel rule:

| Measurement | Where | Expected |
|---|---|---|
| Verification square | Bottom of every page | 50.0 mm on both sides |
| Calibration ruler | Bottom of every page | 100.0 mm end to end |
| Stitch hole spacing | Across ten holes on a straight run | 10 × the achieved spacing shown in the panel |
| A known panel dimension | The pattern itself | The number typed into the panel |

Ten holes rather than two: a single gap is within the width of a pencil line, and any error
accumulates into something a rule can actually resolve.

## Entries

| Date | Version | Printer | Driver / settings | Paper | Square | Ruler | 10 holes | Notes |
|---|---|---|---|---|---|---|---|---|
| _pending_ | | | | | | | | **M5 is not verified.** No physical measurement has been made. |

Until a row appears above, the project must not claim verified 1:1 output.
