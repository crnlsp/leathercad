# Print verification log

`CLAUDE.md` forbids claiming print accuracy without a physical measurement recorded here. This file
is that record. **An entry is a measurement someone made with a rule against paper** — not a test
result, and not a calculation.

## What is already measured automatically

`e2e/print-verification.spec.ts` opens `fixtures/projects/print-test.lcp` in the built app, exports it
with the Export PDF button, rasterises the file with poppler — an implementation independent of ours
— and measures the ink on every sheet. `e2e/packaged/packaged.spec.ts` runs the same measurement
against the packaged binary, on Linux in CI and on Windows and macOS in the Package workflow. At
10 px/mm, within 0.2 mm (0.01 mm for the hole spacing), it finds:

| On the PDF | Measured |
|---|---|
| 50 mm square, every sheet | 50.0 × 50.0 mm |
| 100 mm ruler, every sheet | 100.0 mm |
| Outer panel's bottom edge, and between its straight sides | 100.0 mm |
| The dimension line under it | 100.0 mm, 8.0 mm below the edge |
| Outer panel's straight bottom run of holes | 25 holes, 3.875 mm apart, evenly |
| The strap, sheet 2's end to the join plus the join to sheet 3's end | 250.0 mm |
| Each registration cross | on its join line, at the same place on the strap on both sheets |

The same check fails on the same PDF refitted to Letter, as a "fit to page" viewer would print it:
it reads the square as 47.0 mm and the ruler as 94.0 mm.

What no automated check can cover is the viewer's print dialog, the printer, its driver and its paper
handling. That is what this file is for.

## The procedure

This is check 3 of the [release checklist](release-checklist.md).

About ten minutes, with a **steel rule** (not a tape) graduated in half millimetres. Once on each of
Linux, Windows and macOS, from that platform's default PDF viewer.

1. **Open** `fixtures/projects/print-test.lcp` in the LeatherCAD build under test. Note the version
   in the status bar. The project is on A4 portrait, and the paper list beside *Export PDF* says
   *3 sheets of A4, portrait (Strap taped)*. If the printer holds Letter, choose *3 sheets of
   Letter, portrait (Strap taped)* first — the layout changes, the measurements do not.
2. **Look at the Sheets view** (*Sheets*, or Ctrl+2) and note what it shows: three sheets, the
   panel and the pocket on sheet 1, the strap across sheets 2 and 3 with a dashed join. Since 7.4c
   the Sheets view and the PDF are drawn from one sheet plan; the paper must match it.
3. **Export PDF.** Save it anywhere. It opens in the system's PDF viewer.
4. **Print from that viewer**, at *Actual size* / *100 %* — not *Fit*, not *Shrink oversized
   pages*. Note the viewer and the exact name of the setting chosen. Three sheets come out, their
   footers reading *Sheet 1 of 3*, *Sheet 2 of 3* and *Sheet 3 of 3*, each carrying what the
   Sheets view showed on it.
5. **Measure**, each to the nearest half millimetre:

   | # | Where | What | Expected |
   |---|---|---|---|
   | A | Every sheet, bottom right | The square, across and up | 50.0 mm both ways |
   | B | Every sheet, bottom left | The ruler, 0 to 100 | 100.0 mm |
   | C | Sheet 1, *Outer panel* | Its bottom edge, corner to corner | 100.0 mm |
   | D | Sheet 1, under the panel | The dimension line marked *100.0* | 100.0 mm |
   | E | Sheet 1, *Outer panel* | Its bottom row of holes, centre of the first to centre of the last: 25 holes, 24 gaps | 93.0 mm |
   | F | Sheet 1, *Outer panel* | The same row, hole 1 to hole 11: 10 gaps | 38.75 mm |
   | G | Sheets 2 + 3, *Strap* | Cut sheet 2 along its dashed line, lay it on sheet 3 with the crosses and the dashed lines together, tape it; then the strap end to end | 250.0 mm |
   | H | Sheets 2 + 3, *Strap* | Its width, and whether its edges cross the join without a step | 25.0 mm, no step |

   Measure the holes on **the straight bottom run**, as E and F say. The *Spacing* in the property
   panel is the whole hole set's average across its four runs — 3.88 mm on this panel, whose sides
   come out at 3.850 mm and whose rounded top at 3.922 mm — and ten holes are nine gaps, not ten.
   Both mistakes were once in this file.

6. **Record** a row below. A reading more than **0.5 mm** from expected — one graduation — is a
   failure. Record it anyway, with what was tried: a failing row is exactly what this file is for.

## Entries

The *Readings* column is A (width × height) · B · C · D · E · F · G · H, in millimetres.

| Date | LeatherCAD | OS | Viewer, and its scale setting | Printer, driver | Paper | Readings | Result |
|---|---|---|---|---|---|---|---|
| _pending_ | | Linux | | | | | |
| _pending_ | | Windows | | | | | |
| _pending_ | | macOS | | | | | |

**7.7 is not verified.** No physical measurement has been made. Until a row above carries real
readings for each platform, the project must not claim verified 1:1 output.
