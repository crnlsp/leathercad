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
| The dimension under it, between its extension lines | 100.0 mm, its line 8.0 mm below the edge |
| Outer panel's straight bottom run of holes | 25 holes, 3.875 mm apart, evenly |
| The strap, sheet 2's end to the join plus the join to sheet 3's end | 275.0 mm |
| Each registration cross | on its join line, at the same place on the strap on both sheets |

`fixtures/projects/paper-check-assembly.lcp` (R11) is exported and measured the same way, on A4
portrait, six sheets, at 10 px/mm:

| On the PDF | Measured |
|---|---|
| The gauge, every sheet | 100.0 × 5.0 mm |
| Sheet 1: the row of holes | 5 holes, each 4.0 mm across, 25.0 mm apart, 100.0 mm first to last |
| Sheet 2: the assembly map | the panel's outline drawn smaller than 250 mm: the one drawing on paper not to scale |
| Sheets 3–6: the 300 × 300 mm panel taped 2 × 2 | edge to the join plus the join to the far edge: 300.0 mm across (sheets 3 and 4) and 300.0 mm down (sheets 3 and 5) |

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

**Sheets that say what to measure.** Each check on this page has a `paper-check-*.lcp` twin in
`fixtures/projects/`: the same project, with a short label beside everything to measure — its
letter here and the value it must read, as `E = 93.0 bottom holes 1 to 25`. Print the twin and the
paper is the procedure; the tables below remain the record. The labels sit inside their pieces, so
every piece prints where it does without them (`paperChecks.test.ts` holds that, and regenerates
them with `UPDATE_FIXTURES=1 pnpm test`): `paper-check-print-test.lcp` for A–H,
`paper-check-alignment-marks.lcp` for 9.13, and `paper-check-mirrored-pair.lcp` for Q21, its pocket
already cut as a mirrored pair.

1. **Open** `fixtures/projects/print-test.lcp` in the LeatherCAD build under test. Note the version
   in Help › *About LeatherCAD*. The project is on A4 portrait, and the paper button beside *Export PDF* says
   *3 × A4 portrait* (before 1.5, the paper list said *3 sheets of A4, portrait (Strap taped)*).
   If the printer holds Letter, choose *Letter* in its popover first — the layout changes, the
   measurements do not.
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
   | D | Sheet 1, under the panel | The dimension marked *100.0*, arrowhead tip to arrowhead tip | 100.0 mm |
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
| 2026-10-09 | `develop` at 6a63ae2, the 1.3.5 release candidate | Linux (CachyOS) | none: LeatherCAD's *Print*, *100 % — locked*, *No scaling* | Brother HL-L2442DW, the printer's default settings | A4 portrait | All three sheets. A–H each within 0.5 mm of expected, reported as passing; exact readings not noted | **Pass** |
| 2026-10-09 | `develop` at 6a63ae2, the 1.3.5 release candidate | Linux (CachyOS) | none: LeatherCAD's *Print*, A4 landscape (7.6b) | Brother HL-L2442DW, the printer's default settings | A4, the sheet turned onto upright paper | One sheet. A–F and the strap whole at 275.0 each within 0.5 mm of expected, reported as passing; exact readings not noted | **Pass** |
| 2026-11-20 | `develop` at 0527c3a (1.7, after R18), `paper-check-*.lcp` | Linux (CachyOS), CUPS 2.4.20, libcupsfilters 2.2.1 | none: the PDF written as *Print* writes it (`exportPdf`, upright, no correction) and sent to `lp` with *Print*'s own options (`print-scaling=none`, `fit-to-page=false`, `media=A4`) | Brother HL-L2442DW, driverless (IPP Everywhere), the printer's default settings | A4 portrait | All three sheets, labelled. Every check read **under 1 mm** from expected; exact readings not noted. G taped at the crosses | **Pass — every reading under 1 mm** (the maintainer's call: not read finely enough to place against 0.5 mm) |
| _pending_ | | Windows | | | | | |
| _pending_ | | macOS, through *Print* | | | | | |

**Linux is verified through *Print*** (1.3.5): the print test's three portrait sheets and its
landscape sheet measured true on a Brother laser, and the same printer scaled a viewer's print of
the same PDF to 96 % before 7.6. **Windows and macOS are not verified** (R8): until a row above
carries real readings for each, the project must not claim verified 1:1 output on it.

## 1.6's printing — checks I to M (R11)

1.6 changed four things that print: rows of holes (4.14), taped sheets with arrows and an assembly
map (7.2), dimension arrowheads (4.10b, check D above) and printer calibration (7.5). R11 measures
them on paper. Until a row below carries real readings for I to M, and the row above for A to F is
re-taken after L, R11 is not done and its roadmap line stays ☐.

**What is checked automatically.** `printTestAssembly.test.ts` holds the fixture to the commands
that build it, and the sheets it plans (a hole row on sheet 1, the map on sheet 2, four tiles);
`packages/export`'s tests hold the map's words. `e2e/print-verification.spec.ts` exports the
fixture through the app and measures the PDF through poppler (table above). None of that is the
printer.

**The procedure**, about an hour with the calibration, with the steel rule of the procedure above:

1. **Open** `fixtures/projects/paper-check-assembly.lcp` in the build under test, on A4 portrait.
   Note the version in Help › *About LeatherCAD*. *Sheets* shows six sheets: *Hole row* on sheet 1, the
   assembly map of sheets 3–6 on sheet 2, and *Panel* taped 2 × 2 across sheets 3–6.
   Each piece carries short labels naming the check and its expected value (`I = 4.0 hole
   diameter`, `J = 300.0 edge to edge after taping`), so the paper explains itself.
2. **Print** as step 3 above (on Windows, *Save PDF…* and print at *Actual size*). Never scaled.
   **Print the calibration page** from the print preview's *Calibrate this printer…* only for L
   and M; I to K are printed uncorrected, from a printer with no correction stored.
3. **Measure**, each to the nearest half millimetre:

   | # | Where | What | Expected |
   |---|---|---|---|
   | I | Sheet 1, *Hole row* | Each hole's diameter, across the circle | 4.0 mm |
   | I | Sheet 1 | Centre of the first hole to centre of the last: 5 holes, 4 gaps of 25 | 100.0 mm |
   | J | Sheets 3–6, *Panel* | Cut each sheet on its dashed lines, lay it over the next with the crosses together and the arrows pointing at each other, tape the four; then the panel's bottom edge, corner to corner | 300.0 mm |
   | J | The same, assembled | Its left edge, corner to corner | 300.0 mm |
   | J | The same, assembled | The centre cross: all four sheets meet on it | Yes |
   | K | Sheet 2 | The assembly map is headed *assembly map of sheets 3–6* and says *Not to scale: a map of how the sheets join. Never cut from it.* The panel on it is not 300 mm | Yes, and it is smaller |
   | K | Sheet 2 | Nothing on it is traced or cut from | The map is the one drawing here that is not 1:1 |
   | L | The calibration page | Print it from *Calibrate this printer…*, measure both lines end to end with the rule, enter the readings, save. Then print the first print test (`print-test.lcp`, A4 portrait) corrected, and measure A to F | A to F: as above, within 0.5 mm. The foot of each sheet reads *corrected for its printer* |
   | M | The same printer | *Remove correction*, and print the print test again: A to F | As the first print, uncorrected; the foot reads *1:1* again |

   Check D's arrowheads: measure the dimension *Outer panel*'s *100.0*, arrowhead tip to arrowhead
   tip, as before 1.6 it was measured between its extension lines, and note whether the two
   readings differ.

   The calibration page's lines are 190 × 200 mm on A4. Note both readings and the correction the
   step shows (*scaled … % across the paper and … % along it*). A printer whose readings are exact
   stores nothing: say so in the row, and try again with a printer or a paper that is off.

4. **Find out, and note in the row:** whether the printer's own driver applies a correction of its
   own (compare the calibration page printed corrected and uncorrected), and whether D reads the
   same tip to tip as between the extension lines.
5. **Record** a row. A reading more than **0.5 mm** from expected is a failure: investigate it
   (a 1:1 bug holds every printing slice) and either fix it or explain it in the row.

| Date | Build | OS, viewer and scale setting | Printer, driver, paper | I (diameter · first to last) | J (across · up · centre cross) | K | L (calibration readings x · y, then A–F) | M (A–F) | Result |
|---|---|---|---|---|---|---|---|---|---|
| 2026-11-21 | `develop` at b8b9b57 (1.7, after R11's fixture), `paper-check-assembly.lcp` | Linux (CachyOS), CUPS 2.4.20, libcupsfilters 2.2.1; I–K: the PDF written as *Print* writes it (`exportPdf`, upright, no correction) and sent to `lp` with *Print*'s own options; L and M: LeatherCAD's own *Print* and *Calibrate this printer…* | Brother HL-L2442DW, driverless (IPP Everywhere), the printer's default settings, A4 | Pass | Pass | Pass: headed *Not to scale*, the panel on it smaller | Pass | Pass | **Pass — every check as expected, by the maintainer's reading**; exact readings, the stored correction and D tip to tip against the extension lines not noted |

## Built-in template construction — 8.14b

| Date | Build | Template | What was done | Result |
|---|---|---|---|---|
| 2026-11-11 | `fix/8-14b-templates` at `d16ad2c` (D19 card holder) | Card holder: one outer, two pockets | Cut and punched in leather by the maintainer | **Pass.** The pockets' holes line up with the outer's on all three seams (12 / 27 / 12). Leather, thickness, iron and card fit were not recorded |

This is the construction check 8.14b asks for: cut from leather once, holes lining up. It is not
a 1:1 print-scale reading; the rows above remain the record for that. The
[template audit](template-audit.md#physical-check-to-record) gives the procedure and what a fuller
record would add.

## Alignment marks — 9.13

9.13 prints a seam's alignment marks, so it is measured on paper (seams spec §6). Until a row
below carries real readings, 9.13 is not done and its roadmap line stays ◐.

**What is checked automatically.** `cardHolderMarks.test.ts` holds the fixture below to the shipped
card holder with marks added through the app's commands, and checks that each mark is at the 6th
and 12th paired hole of both pieces, the two the same distance from the corner hole along the
stitch line (to 0.0005 mm). `packages/export` checks that the ticks reach the scene, the sheet
plan, the PDF, the SVG and the DXF. None of that is the printer.

**The procedure**, about five minutes, with the steel rule of the procedure above:

1. **Open** `fixtures/projects/card-holder-marks.lcp` in the build under test: the shipped card
   holder, its left and right seams marked every 6th pair. Note the version in Help › *About LeatherCAD*.
2. **Sheets** shows one A4 portrait sheet: *Outer* and *Pocket — cut 2*, each with four short grey
   ticks just inside its left and right stitching, square to it.
3. **Print** as step 3 above (on Windows, *Save PDF…* and print at *Actual size*). Never scaled.
4. **Measure**, to the nearest half millimetre. The corner hole is the one on the rounded bottom
   corner; *to the mark* is to the centre of the hole the tick points at, with the rule laid
   straight between the two hole centres.

   | # | Where | What | Expected |
   |---|---|---|---|
   | A, B | The gauge | As above | 100.0 × 5.0 mm |
   | N | *Outer*, left side | Bottom corner hole to the lower mark (6th hole) | 18.6 mm |
   | O | *Pocket*, left side | Bottom corner hole to the lower mark (6th hole) | 18.6 mm |
   | P | *Outer*, left side | Bottom corner hole to the upper mark (12th hole) | 41.1 mm |
   | Q | *Pocket*, left side | Bottom corner hole to the upper mark (12th hole) | 41.1 mm |
   | R | Both pieces, right side | N to Q again | as N to Q |

5. **Record** a row. The check passes when N and O, and P and Q, are within 0.5 mm of each other on
   each side — the seams spec's acceptance — and each within 0.5 mm of expected. A tick that is not
   inside the stitching, or that touches the cut edge, fails however it measures.

| Date | Build | OS, viewer and scale setting | Printer, paper | Readings N · O · P · Q (left; right) | Result |
|---|---|---|---|---|---|
| 2026-11-20 | `develop` at 0527c3a (1.7, after R18), `paper-check-*.lcp` | Linux (CachyOS), CUPS 2.4.20, libcupsfilters 2.2.1; none: the PDF written as *Print* writes it (`exportPdf`, upright, no correction) and sent to `lp` with *Print*'s own options (`print-scaling=none`, `fit-to-page=false`, `media=A4`) | Brother HL-L2442DW, driverless (IPP Everywhere), the printer's default settings, A4 | Every check read **under 1 mm** from expected; exact readings not noted; every tick inside the stitching, clear of the cut edge | **Pass — every reading under 1 mm** (the maintainer's call: not read finely enough to place against 0.5 mm) |

## A mirrored pair's caption — Q21

Q21 prints a new caption under a piece cut as a mirrored pair, and a longer caption can move a piece
on the sheet, so it is measured on paper (seams spec §11). Until a row below carries real readings,
Q21 is not done and its roadmap line stays ◐.

**What is checked automatically.** `packages/export/src/mirroredPair.test.ts` checks the caption's
words for two, four and six pieces, that it reaches the sheet the PDF draws at 2.8 mm, and that the
SVG and the DXF differ from a piece cut alike in their annotation layer only — the cut, stitching
and holes are byte for byte the same. None of that is the printer.

**The procedure**, about five minutes, with the steel rule of the procedure above:

1. **Open** `fixtures/projects/card-holder.lcp` in the build under test, pick *Pocket* in Parts
   and tick *Cut as a mirrored pair* in Properties. Parts now reads *Pocket 1 + 1 mirrored*. Note
   the version in Help › *About LeatherCAD*.
2. **Sheets** shows one A4 portrait sheet: *Outer*, and *Pocket* captioned *Pocket — cut 2, turn
   the template over for the second*.
3. **Print** as step 3 above (on Windows, *Save PDF…* and print at *Actual size*). Never scaled.
4. **Measure and read**, to the nearest half millimetre:

   | # | Where | What | Expected |
   |---|---|---|---|
   | A, B | The gauge | As above | 100.0 × 5.0 mm |
   | S | *Pocket* | Width across the outline, left cut edge to right | 105.0 mm |
   | T | *Pocket* | Height of the outline, bottom cut edge to top | 47.3 mm |
   | U | *Pocket* | Height of a capital letter of its caption | 2.0 mm, give or take 0.3 |
   | V | *Pocket*'s caption | Whole, on one line, above the piece, touching neither its cut line nor another piece's, inside the sheet's margins | Yes |

5. **Cut** the pocket out of the paper twice: once as printed, once with the template turned
   over. The two must stack edge to edge, printed sides facing.
6. **Record** a row. The check passes when A, B, S and T are each within 0.5 mm of expected, U is
   legible at arm's length, and V is yes.

| Date | Build | OS, viewer and scale setting | Printer, paper | Readings A · B · S · T · U · V | Result |
|---|---|---|---|---|---|
| 2026-11-20 | `develop` at 0527c3a (1.7, after R18), `paper-check-*.lcp` | Linux (CachyOS), CUPS 2.4.20, libcupsfilters 2.2.1; none: the PDF written as *Print* writes it (`exportPdf`, upright, no correction) and sent to `lp` with *Print*'s own options (`print-scaling=none`, `fit-to-page=false`, `media=A4`) | Brother HL-L2442DW, driverless (IPP Everywhere), the printer's default settings, A4 | Every check read **under 1 mm** from expected; exact readings not noted; U legible, V yes; the two cut pockets stack | **Pass — every reading under 1 mm** (the maintainer's call: not read finely enough to place against 0.5 mm) |

## A card holder from blank — R16

R16 builds the card holder from a blank project and prints it, so it is checked in leather once:
cut, punched and stitched, its holes lining up (the 1.7 plan, R16). Until a row below carries a
real result, R16 is not done and its roadmap line stays ◐.

**What is checked automatically.** `e2e/journey-card-holder.spec.ts` makes the steps below in the
built app and reads the result back: 86 holes on the outer and 49 on the pocket, its three seams
12 = 12, 27 = 27 and 12 = 12 holes with no drift, nothing in Problems, and the exported PDF read
piece by piece from its content stream (`e2e/pdfPieces.ts`) — the outer 105.000 × 70.000 mm with
86 hole marks, the pocket 105.000 × 47.349 mm with 49. None of that is the printer, the leather or
the iron.

**The procedure**, about an hour with the cutting, punching and stitching, with the steel rule of
the procedure above:

1. **Build** the card holder in the build under test, from a blank *New project*, as the journey
   does. Note the version in Help › *About LeatherCAD*.
   1. Draw a rectangle. In Properties: *Width* 105, *Height* 70, each corner radius 4, the piece
      named `Outer`. In the selection bar, *Stitch line*; *Edge margin* 3; then *Stitch holes*.
      Parts says 86 holes.
   2. Draw a second rectangle. *Width* 105, *Height* 47.3487, the top-left and top-right corner
      radius 3, the bottom two 4, named `Pocket`, *Cut* 2. *Stitch line*, *Edge margin* 3,
      *Stitched sides* *Open at the top*; then *Stitch holes*. Parts says 49 holes.
   3. Select the pocket's *Stitch holes*, Shift-click the outer's, *Sew together…*, and sew each
      side with a run of its own (*Between corners or ends…*, or *Part of a run, from a corner or
      end…*): the left, *Pocket* from *Corner 4* to *Start* and *Outer* from *Corner 4*, *Back
      along the line*; the bottom, *Corner 4* to *Corner 1* on both; the right, *Pocket* from
      *Corner 1* to *End* and *Outer* from *Corner 1*, *Forward along the line*. The
      seam panel reads 12 = 12, 27 = 27 and 12 = 12 holes, drift 0 mm, and Problems *Nothing to
      fix.*
2. **Print** as step 3 above (on Windows, *Save PDF…* and print at *Actual size*). One A4 sheet:
   *Outer*, and *Pocket — cut 2*. Never scaled.
3. **Measure** the paper, to the nearest half millimetre:

   | # | Where | What | Expected |
   |---|---|---|---|
   | A, B | The gauge | As above | 100.0 × 5.0 mm |
   | W | *Outer* | Width of the outline, cut edge to cut edge | 105.0 mm |
   | X | *Outer* | Height of the outline | 70.0 mm |
   | Y | *Pocket* | Width of the outline | 105.0 mm |
   | Z | *Pocket* | Height of the outline | 47.3 mm |

4. **Make it.** Cut the outer once and the pocket twice in leather from the paper, mark the holes
   through the paper at their centres, punch them with the iron, and stitch a pocket to each face
   of the outer along its left side, bottom and right side.
5. **Record** a row. The check passes when A, B and W to Z are each within 0.5 mm of expected and,
   on both faces, every pocket hole meets an outer hole on all three seams (12, 27 and 12 pairs):
   the thread runs through without a hole skipped or a stitch pulled sideways. Note the leather
   and its thickness, the iron, and whether a payment card goes in.

| Date | Build | OS, viewer and scale setting | Printer, paper | Readings A · B · W · X · Y · Z | Leather, iron | Holes line up (left · bottom · right, both faces) | Result |
|---|---|---|---|---|---|---|---|
| _pending_ | | | | | | | |
