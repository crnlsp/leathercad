# Phase 4 close-out (slice 4.13) — design

**Date:** 2026-09-23
**Status:** Proposed with the slice's pull request.
**Closes:** Phase 4, as reconciled in the
[Phase 4 reconciliation](2026-09-15-phase-4-reconciliation-design.md) §7, row 11

---

## 1. What the slice is

The roadmap gives it one line: *one end-to-end scenario walked through the whole phase, a roadmap
summary, and a final pass over the docs the phase changed.* Nothing new is designed. Every Phase 4
slice was tested on its own terms, and the E2E suite has a test per behaviour. None of them checks
that the behaviours still **compose**: that a fold, a mirrored slot, a derived stitch line, a
dimension and a label can all live in one project, survive a save, and reach the paper together.

The UI/UX audit ran before this slice, at the user's instruction, so this slice does not repeat it.
Findings stay where the audit put them (roadmap § *Checkpoint*, F.0–F.7). The only fixes this slice
makes are to something the scenario **breaks**.

## 2. The scenario

A card holder, drafted the way a maker would do it and driven through the running application:

1. Name the project in Polish.
2. Draw the shell roughly, then type it to exactly 180 × 95 mm with 6 mm corners.
3. Stitch it: a derived stitch line at the project's edge margin, then holes along it.
4. Draw a fold down the middle.
5. Cut a card slot on the left half, then **mirror it across the fold**.
6. Draft a pocket from its **opening** (*Stitch + allowance*), so its edge is derived outward.
7. **Dimension** the pocket's opening, then retype the opening. The dimension keeps resolving.
8. Put a **label** on the shell.
9. Make a mistake the rules catch: move the slot into the stitching. Find it from the **problems
   panel**, then fix it by typing.
10. Delete the fold, **freeze** what depends on it, and undo.
11. **Save**. Reopen in a fresh instance. Everything comes back as parameters, and the numbers
    recompute to the same values.
12. **Export** the reopened project and check the PDF with `pdfinfo`.

## 3. Acceptance criteria

Each one can be checked by using the application. The scenario test checks each of them.

- **A1:** a typed 180 × 95 outline with a 3.5 mm stitch line reports a hole count and an achieved
  spacing within 5 % of the 3.85 mm pitch.
- **A2:** the mirrored slot is marked *Folded across*. Resizing the original slot changes the
  counterpart's perimeter to match.
- **A3:** the pocket is one part with two features, and its edge is shown as following the stitch
  line.
- **A4:** a dimension between two corners of the pocket's opening is created, and still resolves
  after the opening is retyped. *Nothing to fix* throughout.
- **A5:** a slot moved into the stitching is reported. Clicking the problem selects a feature of
  the shell. Retyping the slot clears every badge.
- **A6:** deleting the fold asks, lists the counterpart, and freezes it on request. One undo brings
  the fold back and the counterpart follows it again.
- **A7:** after save and reopen in a new instance, the part count, feature count, hole count,
  achieved spacing, label text and *Folded across* note are all as they were.
- **A8:** the reopened project exports to an A4 PDF with no export notice and no file error.

The scenario has to reach the canvas by millimetres, not by pixel offsets. The canvas moves when
the tool changes, a known bug that F.3 fixes. So the test reads the cursor readout to find where a
millimetre lands on screen **at the moment it clicks**. Pixel offsets remembered from an earlier
tool are never reused.

## 4. The docs pass

The docs the phase changed are checked against the code and corrected where they have gone stale.
This is not rewriting them:

- `roadmap.md`: 4.13 done, and a Phase 4 summary.
- The reconciliation's build-order table.
- `domain-model.md`'s per-section status.
- `file-format.md`'s current version.
- `CLAUDE.md`.

## 5. Not in this slice

- **F.0–F.7.** None of it, even where the scenario brushes past it.
- **The known independent issues:** the canvas jump, asymmetric `intersectSegments`, the `ticks`
  flake, and DR2 on an edge-to-edge fold. The scenario draws its fold just inside the edge for
  the same reason the 4.8b test does.
- **A dimension's value in the property panel.** Today it is readable only on the canvas, so the
  scenario asserts that the dimension resolves, not its number.
- **Sample projects** (5.4). The scenario builds its project; it does not ship one.
