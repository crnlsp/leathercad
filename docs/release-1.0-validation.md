# 1.0 production validation

The manual gate for 1.0, done by a person on the **packaged** build, on Linux, Windows and macOS.
Everything automated is green before this starts (`pnpm check`, E2E, the packaged smoke test, the
pixel references). What they cannot prove is the printer, its driver, the viewer's print dialog and
the paper — and whether the workflow makes sense to a leatherworker holding the result.

**Last updated:** 2026-09-24, for the practical-1.0 build (sheet plan, Sheets view, project and
work bars).

---

## Before you start

- **The build.** The installer or AppImage from `pnpm package` (or the release workflow) at the
  commit under test. Note the version shown in the status bar.
- **Tools:**
  - a steel rule graduated in 0.5 mm — not a tape;
  - a pen, tape, scissors or a knife;
  - scrap card or leather;
  - the pricking iron you normally use.
- **The printer:** its usual paper, and the operating system's **default** PDF viewer.
- **Recording:**
  - Record every step as *expected / actual / pass or fail / note*.
  - Measurements go into [`print-verification-log.md`](print-verification-log.md), one row per
    platform.

## What blocks the release

Any one of these is a blocker:

- A printed measurement more than **0.5 mm** from expected, printed at 100 % / Actual size.
- The sheet count, the numbering or what is on a sheet differs between:
  - the paper list;
  - the Sheets view;
  - the PDF.
- Anything magenta on paper. Magenta is screen-only furniture.
- A part printed that Parts says is *Not printed*, or a part missing that Parts says prints.
- A taped join misaligned by more than 0.5 mm, or a step in an edge across a join.
- A sheet without its 50 mm square and 100 mm ruler.
- Lost work, a crash, or a file that does not reopen as it was saved.

**Not blockers:**
- cosmetic layout;
- packing that uses more paper than a person would;
- a label cut short in a narrow window.

Record them anyway.

## The checks

### 1. Start-up

1. The window title reads **Untitled — LeatherCAD**.
2. The top bar holds the project: name, *Save*, *New*, *Open*, the paper list, and *Export PDF*,
   the only gold button.
3. The second bar holds the work: *Undo*, *Redo*, *Draw as* and *Design | Sheets*.
4. The paper list reads **1 sheet of A4, portrait, scale check only**.

### 2. An empty project

1. Export PDF: one page, carrying only the 50 mm square, the ruler and the instructions.
2. Print it at Actual size. The square measures **50.0 × 50.0**, and the ruler **100.0**.

### 3. The print test

Follow the procedure in [`print-verification-log.md`](print-verification-log.md) on
`fixtures/projects/print-test.lcp`, and record its row.

1. **In the Sheets view:**
   - sheet 1 holds the panel and the pocket;
   - the strap spans sheets 2–3 with one dashed join.
2. **The measurements, A to H:**
   - square **50.0 × 50.0**;
   - ruler **100.0**;
   - panel edge **100.0**;
   - dimension line **100.0**;
   - the 25-hole row **93.0**;
   - 10 gaps **38.75**;
   - the taped strap **250.0** end to end;
   - strap width **25.0**, with no step at the join.
3. **The sheets:**
   - the footers read *Sheet 1 of 3*, *Sheet 2 of 3*, *Sheet 3 of 3*;
   - each sheet carries what the Sheets view showed on it.

### 4. Every paper, on the print test

For each paper, check three things agree: the paper list's words, the Sheets view's summary, and
the PDF's page count.

| Paper | Portrait | Landscape |
|---|---|---|
| A5 | 5 | 5 (the panel is taped) |
| A4 | 3 | 1 |
| A3 | 1 | 1 |
| Letter | 3 | 1 |
| Legal | 3 | 1 |

Print one sheet in the orientation you would really use, and measure its square.

### 5. A realistic wallet

Build a bifold, as in [`getting-started.md`](getting-started.md):

- **the outer:** 200 × 95 mm, a stitch line 3 mm in, holes at 3.85 mm, and a fold line at 100 mm;
- **the lining:** 196 × 91 mm;
- **a card pocket:** 95 × 60 mm, with a thumb scoop, stitched on three sides, *Cut* 2.

1. **On A4 portrait**, Parts says the outer and the lining are *taped*: 200 mm is more than the
   190 mm A4 prints across. On A4 landscape they are whole.
2. **On the paper you really print on:**
   - the number in the paper list;
   - the number of sheets in the Sheets view;
   - the PDF's page count.

   All three are the same.
3. **The pocket's printed caption** reads *— cut 2*.
4. **Print, cut out and tape** the pieces, then:
   - the outer measures **200.0 × 95.0**;
   - the lining measures **196.0 × 91.0**;
   - the fold line sits at **100.0**.
5. **Lay the pricking iron on the printed holes:** every tooth lands on a hole mark along a straight
   run.
6. **Lay the pocket on the outer:** its stitch line lines up with the outer's where they are sewn
   together.
7. **Trace one piece onto leather,** and check it against the rule.

### 6. Taped both ways

1. Draw a 300 × 250 mm panel on A4 portrait.
   - The Sheets view shows it as a 2 × 2 group.
   - The board shows its joins both ways, labelled *Tape join*.
2. Print it, and assemble the four sheets on the crosses. The centre cross meets on all four.
3. Measure **300.0 × 250.0**.

### 7. Printing one sheet again

1. From the viewer, print page 2 alone.
2. It is identical to sheet 2 of the first print.
3. Its square still measures **50.0**.

### 8. What does not print

1. **Hide the panel's stitch holes.**
   - Parts says *1 hidden feature isn't printed*.
   - The PDF has no holes on the panel.
2. **Hide a whole part.**
   - Parts says *Not printed — It is hidden*.
   - The sheet count drops, and the part is not in the PDF.
3. **Nothing magenta on any printed page:** no join label, no outline, no sheet number above a
   sheet. The footer number *is* printed, in black.

### 9. Edge cases

1. **The wrong paper in the printer.** Print a PDF exported for Letter on A4 paper, and the other
   way round.
   - The viewer may scale it; the square must show that it did.
   - Record the viewer's behaviour. This is a procedure finding, not a software blocker.
2. **Long names.** Long part and project names never hide *Save*, *New*, *Open*, the paper list or
   *Export PDF* at your usual window size.
3. **Undo.** Undo after a paper change brings back the previous paper, in one step.
4. **Unsaved work.** Closing with unsaved changes asks first. Save, reopen, and everything —
   including the paper — is as it was.

### 10. Every platform

Repeat checks 1–4 and 7 on Windows and on macOS, each from its own default PDF viewer. Note the
exact name of the viewer's actual-size setting. Record one row per platform in the log.

## After it passes

The last 1.0 items are then the release tasks in the roadmap's 8.6, which need credentials:
- [ ] Windows signing;
- [ ] macOS signing and notarisation;
- [x] the Release workflow's permission (2026-09-24).

v1.0.0 was released on 2026-09-24, unsigned on Windows and ad-hoc signed on macOS. The
platform rows in [`print-verification-log.md`](print-verification-log.md) are still pending.
