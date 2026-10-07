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
| The verification gauge, every sheet | 100.0 × 5.0 mm |
| Outer panel's bottom edge, and between its straight sides | 100.0 mm |
| The dimension line under it | 100.0 mm, 8.0 mm below the edge |
| Outer panel's straight bottom run of holes | 25 holes, 3.875 mm apart, evenly |
| The strap, sheet 2's end to the join plus the join to sheet 3's end | 275.0 mm |
| Each registration cross | on its join line, at the same place on the strap on both sheets |

The same check fails on the same PDF refitted to Letter, as a "fit to page" viewer would print it:
it reads the square as 47.0 mm and the ruler as 94.0 mm.

`e2e/print-preview.spec.ts` prints the same project with **Print** (7.6) to a stand-in for CUPS's
`lp`. It checks the job asks for `print-scaling=none`, and that the bytes `lp` received measure as
above. Where CUPS's `pdftopdf` filter is installed, it measures them again after that filter, run
with the job's options.

It also prints the print test on A4 landscape (7.6b). `lp` receives one upright A4 page with the
sheet turned a quarter on it, and turned back it measures as above, with the strap whole on the
sheet at 275.0 mm, before and after `pdftopdf`.

What no automated check can cover is the printer, its driver and its paper handling, and on
Windows the viewer's print dialog. That is what this file is for.

## The procedure

This is check 3 of the [release checklist](release-checklist.md).

About ten minutes, with a **steel rule** (not a tape) graduated in half millimetres. Once on each of
Linux, Windows and macOS: on Linux and macOS with LeatherCAD's own **Print**, on Windows from the
default PDF viewer.

1. **Open** `fixtures/projects/print-test.lcp` in the LeatherCAD build under test. Note the version
   in the status bar. The project is on A4 portrait, and the paper list beside *Export PDF* says
   *3 sheets of A4, portrait (Strap taped)*. If the printer holds Letter, choose *3 sheets of
   Letter, portrait (Strap taped)* first — the layout changes, the measurements do not.
2. **Look at the Sheets view** (*Sheets*, or Ctrl+2) and note what it shows: three sheets, the
   panel and the pocket on sheet 1, the strap across sheets 2 and 3 with a dashed join. Since 7.4c
   the Sheets view and the PDF are drawn from one sheet plan; the paper must match it.
3. **Print** (Ctrl+P). The preview shows the same three sheets, *100 % — locked* and *No scaling*.
   Choose the printer and *Print 3 sheets*. On Windows the preview's last step is *Save PDF…*:
   save it and print it from the system's PDF viewer, at *Actual size* / *100 %* — not *Fit*,
   not *Shrink oversized pages* — and note the viewer and the exact name of the setting chosen.
4. Three sheets come out, the words at their foot reading *Sheet 1 of 3*, *Sheet 2 of 3* and
   *Sheet 3 of 3*, each carrying what the Sheets view showed on it.
5. **Measure**, each to the nearest half millimetre:

   | # | Where | What | Expected |
   |---|---|---|---|
   | A | Every sheet, bottom left | The gauge's long side, across | 100.0 mm |
   | B | Every sheet, bottom left | The gauge's short side, up | 5.0 mm |
   | C | Sheet 1, *Outer panel* | Its bottom edge, corner to corner | 100.0 mm |
   | D | Sheet 1, under the panel | The dimension line marked *100.0* | 100.0 mm |
   | E | Sheet 1, *Outer panel* | Its bottom row of holes, centre of the first to centre of the last: 25 holes, 24 gaps | 93.0 mm |
   | F | Sheet 1, *Outer panel* | The same row, hole 1 to hole 11: 10 gaps | 38.75 mm |
   | G | Sheets 2 + 3, *Strap* | Cut sheet 2 along its dashed line, lay it on sheet 3 with the crosses and the dashed lines together, tape it; then the strap end to end | 275.0 mm |
   | H | Sheets 2 + 3, *Strap* | Its width, and whether its edges cross the join without a step | 25.0 mm, no step |

   Measure the holes on **the straight bottom run**, as E and F say. The *Spacing* in the property
   panel is the whole hole set's average across its four runs — 3.88 mm on this panel, whose sides
   come out at 3.850 mm and whose rounded top at 3.922 mm — and ten holes are nine gaps, not ten.
   Both mistakes were once in this file.

6. **Record** a row below. A reading more than **0.5 mm** from expected — one graduation — is a
   failure. Record it anyway, with what was tried: a failing row is exactly what this file is for.

## Entries

The *Readings* column is A · B · C · D · E · F · G · H, in millimetres. Since 7.8 the sheets carry
a 100 × 5 mm gauge where they carried a 50 mm square and a 100 mm ruler, and the strap is 275 mm,
not 250: a row recorded before it read A as the square, across × up, B as the ruler, and G as
250.0.

| Date | LeatherCAD | OS | Viewer, and its scale setting | Printer, driver | Paper | Readings | Result |
|---|---|---|---|---|---|---|---|
| 2026-10-01 | 1.3.0 (bifold sample, before 7.6) | Linux (CachyOS), CUPS 2.4.19, libcupsfilters 2.2.1 | Okular, default *Fit to printable area*; again with *None; print original size*; and a browser | Brother HL-L2442DW, driverless (IPP Everywhere) | A4 | A · B: about 96 × 4.8 (the rest not taken) | **Fail.** CUPS fitted the page into the 4.23 mm margins: the jobs carried no `print-scaling=none`, and libcupsfilters defaults to `auto`. The PDF itself measures true (ADR 0019) |
| 2026-10-01 | 7.6 branch: `lp -o print-scaling=none -o fit-to-page=false -o media=A4`, as *Print* sends it | Linux (CachyOS), CUPS 2.4.19, libcupsfilters 2.2.1 | none: sent to `lp` | Brother HL-L2442DW, driverless (IPP Everywhere) | A4 | Sheet 1 only. A–F each within 0.5 mm of expected, reported as passing; exact readings not noted. G, H not printed | **Pass** (sheet 1). No visible issue |
| _pending_ | | Linux, all three sheets through *Print* in a released build | | | | | |
| _pending_ | | Linux, the print test on A4 landscape through *Print* (7.6b): one sheet, upright paper, A–F and the strap whole at 275.0 | | | | | |
| _pending_ | | Windows | | | | | |
| _pending_ | | macOS, through *Print* | | | | | |

**7.7 is not verified.** On Linux, sheet 1 sent with scaling off measured true, and the same
printer scaled the same PDF to 96 % from a viewer. No platform has a full row of A–H yet. Until a
row above carries real readings for each platform, the project must not claim verified 1:1
output.
