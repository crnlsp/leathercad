# Smart guides, nudging and exact placement — design for 1.7 (3.13 – 3.20)

**Status:** design, for the 1.7 plan ([`2026-11-03-release-1.7.md`](../plans/2026-11-03-release-1.7.md)).
Built so far: §3 (3.13), §4 (3.14, 3.15), §5 (3.20), §6, for whole pieces (3.16) and inside a piece (3.18), §7 and §11's announcement (3.17). Where this and the code disagree once a slice lands, the slice updates this
file in the same pull request.

**What it covers:** picking a piece by its body (3.13), keyboard movement (3.14), typed position
(3.15), one snapping model (3.20), live alignment while moving (3.16), placing inside a piece
(3.18), live distances and clearance (3.17) and equal spacing (3.19).

---

## 1. Why, in leathercraft terms

Smart guides in a drawing program line up objects on an artboard. On LeatherCAD's board that is
worth less than it looks: **where pieces sit on the board never reaches paper.** The Sheets view
packs every piece on its own (7.8). Placement matters physically in three places, and this design
serves them in this order:

1. **Inside a piece** — a snap centred on a flap, a fold at the middle, a rivet 12 mm in from an
   edge, a slot centred under a card pocket. These are cut and punched.
2. **Against the rules** — a hardware hole's rim 1.5 mm from an edge (`HOLE_TOO_CLOSE_TO_EDGE`,
   Q33). The maker should see the clearance while placing it, not after.
3. **Laser exports** — SVG and DXF write the board's arrangement (6.4), so pieces placed too close
   on the board are cut too close in leather.

Lining up whole pieces for a tidy board is the fourth use, and comes free with the same model.

## 2. What exists (develop at 7a69dc9)

- **Point snapping** on the cursor, once, before any tool sees it (`ToolManager.snapped`,
  [`packages/editor/src/tool.ts`](../../../packages/editor/src/tool.ts)). Kinds in priority order
  `endpoint › midpoint › centre › intersection › guide › on-path › grid`
  ([`snap.ts`](../../../packages/editor/src/snap.ts) `PRIORITY`); priority first, distance second.
  Tolerance is the pick radius in CSS pixels converted to millimetres (`pickToleranceMm`). Ctrl
  suspends. Grid snapping is off by decision (the grid on screen adapts to zoom).
- **The snap index** buckets discrete targets by 20 mm cells and caches crossings by path identity
  (PERF-004). Guides are matched by projection on demand.
- **Moving** is the Select tool: press on a line, drag; the whole piece moves when the outline is
  picked (`pieceScope`, Q30). The delta is *snapped cursor − snapped press point*, so a piece lands
  exactly only when it was grabbed by a corner. `transformRefusal` explains a refused move.
- **Hit-testing is on lines only** (`hitTest` uses `isPointOnPath`,
  [`hitTest.ts`](../../../packages/editor/src/hitTest.ts)). Seen in the app: a click in a
  piece's filled body selects nothing and starts a box selection; a click in the middle of the
  bifold's outer picks the fold line, and a drag then moves the fold alone.
- **No keyboard movement.** No arrow nudge, no select-all on the board (Ctrl+A is swallowed,
  [`App.tsx`](../../../apps/desktop/src/renderer/src/App.tsx) near the `selectAll` comment), no
  duplicate shortcut, no typed position for a piece. A circle, and so a hardware hole, has typed
  centre fields (`CircleEditor`), in world millimetres.
- **Pan** is the middle button or **Alt+drag** (`CanvasHost.tsx`). Alt is therefore not free as a
  drag modifier.
- **Align and distribute** (3.10) are commands on a multi-selection
  ([`packages/document/src/arrange.ts`](../../../packages/document/src/arrange.ts)), measuring
  world-axis bounds; a piece is measured by its outline.

## 3. Picking a piece by its body (3.13)

**Rule.** A press first asks the existing line hit test. When no line is within the pick radius,
it asks which piece's material contains the point: inside the piece's outer outline and outside
every cut-out, using the domain's own containment (the same point-in-path DR2 uses). The topmost
such piece wins — the last part in document order, as line hits already search. The pick is the
piece, as a click on its heading in Parts is (`selectParts`, Q29), so a drag moves it whole.

- A press inside a cut-out is not on the material: it picks nothing, and a box starts.
- Box selection starts on empty board only, as in most CAD tools. No modifier starts a box over a
  piece: Shift on a press already toggles that piece in the selection, Alt pans, and Ctrl+click is
  the right button on macOS. Many pieces are taken by Ctrl+A (3.14), Shift-clicks or the Parts
  tree. 3.13's *Find out first* checks in the app whether a box over a large piece is missed.
- **Hover says what a click will take.** While Select is active and nothing is being dragged, the
  piece under the pointer is drawn with the existing hover treatment of its outline (PERF-008's
  hover layer), and an internal line within the pick radius with its own. This is the minimum of
  U.22, carried by 3.13 because the new rule is invisible without it.
- **Internal lines.** A line still wins within the pick radius — that is how a fold or a stitch
  line is edited. The accident seen in the bifold (moving the fold instead of the piece) is reduced
  by the hover cue and by the refusal that already exists for derived lines; a fold is not derived
  and moves. We do not switch to "piece first, double-click to enter" (Figma's group model): it
  inverts what every release since 1.0 taught and every Parts row selects a feature directly.
  Revisit only with evidence from makers.

## 4. Keyboard movement (3.14) and typed position (3.15)

**Nudge.** With the board focused and something selected: an arrow key moves the selection 1 mm;
Shift+arrow 10 mm; Alt+arrow 0.1 mm (Option on macOS). Bound through the keymap
([`keymap.ts`](../../../apps/desktop/src/renderer/src/keymap.ts)), so Settings › Keyboard
shortcuts lists and rebinds them and `?` shows them. Arrows keep their meaning in a field, a tree,
a menu or the tab strip: the board hears them only when it has focus.

- **Undo.** A press is a gesture: the first `keydown` begins a `move` transaction, auto-repeat
  previews, `keyup` of the last held arrow commits. One press is one step; a held key is one step.
  No timer, so it is deterministic and testable without a clock.
- **Refusals** are the drag's: `pieceScope` makes the piece whole, `transformRefusal` explains a
  lock or a derived line moved alone, and the notice shows as it does for a drag.
- **Select all** (Ctrl+A on the board) selects every visible, unlocked piece. In a field it stays
  the field's.

**Typed position.** Properties › Arrange gains, for any selection that can move:

| Field | Means |
|---|---|
| **X**, **Y** | Where the selection's box starts — its left and bottom, Y up, world millimetres, as the rulers read |
| **Move by** Δx, Δy, then *Move* | A relative move |

Both take the number fields' sums and units (U.15) and quantise on entry (invariant 8). Two
fields rather than one with a `+` prefix, because "−12" is an absolute coordinate as much as a
move. One command, `translateFeatures`, one undo step either way.

## 5. One snapping model (3.20)

Before any guide is drawn, the snapping that exists is made one model with one table, because
3.16 adds candidates and 3.17 adds feedback, and both must behave the same at every zoom.

**Candidate.** `{ kind, point | axis, source, priority }`: a point (the existing kinds), or an
**axis value** (`x = c` or `y = c`) for alignment. Every candidate names where it came from
(a feature, a guide, a piece's extent) so the overlay can draw it and tests can assert it.

**Priority table** — one table in `snap.ts`, documented here, tested in both directions:

| Rank | Kind | Caught when |
|---|---|---|
| 1 | Point snaps, existing order (`endpoint` … `on-path`) | The cursor is within tolerance of the point |
| 2 | Persisted guide (axis-aligned) | A reference value is within tolerance of the guide |
| 3 | The host piece's centre (moving features inside a piece) | 〃 |
| 4 | The host piece's extent edges | 〃 |
| 5 | The host piece's other holes', cut-outs' and labels' centres (added by 3.18) | 〃 |
| 6 | Other pieces' centres | 〃 |
| 7 | Other pieces' extent edges | 〃 |
| 8 | Equal spacing (3.19) | A gap is within tolerance of its neighbour's gap |

A rank-1 point snap wins both axes. Otherwise each axis is decided on its own. Within a rank the
nearest in screen pixels wins; a tie goes to the candidate earlier in document order, so the
result never depends on iteration order.

**Hysteresis.** Once a candidate is caught on an axis, it holds while the raw value stays within
1.5 × tolerance and no higher-ranked candidate comes within tolerance. This removes the jitter
between two nearby targets. It depends only on the previous result, never on time.

**Suppression.** Holding Ctrl suspends every snap and every guide, as today, for as long as it is
held. Settings › General gains one toggle, *Smart guides* (`smartGuides` in `preferences.json`,
never in the project). No tolerance setting: the pick radius is a screen constant, and a second
number would only make two behaviours.

**Zoom and density.** Tolerances are CSS pixels converted through the viewport, as now, so a
guide catches at the same hand distance at 10 % and 800 % and on a 2× display (U.1's definition of
zoom). Candidates far outside the visible board are not considered.

## 6. Alignment while moving (3.16) and inside a piece (3.18)

**What moves — the references.** For a move of whole pieces, the selection's world-axis extent
gives three x values (left, centre, right) and three y values (bottom, centre, top). The extent is
exact (geometry §4.5), from the outlines, as Align measures. For features moved inside one piece
(the selection lies in one part and does not include its outline), the references are the
selection's extent, or for a single hardware hole or circle its centre alone.

**What it lines up with — the targets.** Collected once, when the gesture begins, from the
document as it was (`committedDocument`): nothing else moves during a move.

- Moving pieces: every other visible piece's extent (three x, three y), and axis-aligned guides.
- Moving features inside a piece: **that piece's** extent and centre lines first, its other
  features' centres (holes, labels, hardware), and axis-aligned guides. Other pieces are not
  targets: a rivet is placed on its own flap.

Targets are sorted per axis once, so each pointer move is a binary search (O(log n)), not a scan.

**Rotated and irregular pieces.** A world-axis extent is not an edge of a turned or curved piece.
So:

- *Centre* means the centre of the extent. For the shapes makers centre things on — a flap, a
  panel, a strap end — it is the axis of symmetry. On an irregular piece the label says "centre of
  its extent", never "centre".
- *Edge* alignment is offered only for an extent edge that the outline actually touches along a
  straight, axis-aligned segment (a rectangle at 0° or 90°, most drawn panels). A turned piece
  offers its centre and no edges. Aligning to an inclined edge is not in 1.7: a guide parallel to
  that edge (3.10) already does it exactly.
- Distances (§7) are measured to the real outline, never to the extent, so they are true for any
  shape.

**Applying it.** The raw delta is *raw cursor − press point*. Per axis, the winning candidate
replaces that axis's delta with *target − reference*, exactly. `translateFeatures` quantises the
committed delta to the storage quantum, so alignment holds to 1e-4 mm — the precision Align already
promises. The preview goes through the store's gesture; nothing reaches history until release.

**A point snap and the guides (as built in 3.16).** A point the cursor catches moves the *grabbed*
point onto it, so it means something only when the press itself caught a fixed point of what moves
— a corner, a midpoint, an arc's centre, a crossing. Then a caught point wins both axes, as §5
says, and without one the guides decide each axis. A piece grabbed anywhere else (its body, or
along an edge) has no point of its own to put on a target: during that drag no point is offered and
no glyph drawn (`Tool.snapsPoints`), so a stitch line or a corner passing under the pointer cannot
override the alignment. What moves is excluded from snapping from the press on, not from the first
move after it.

*As built, also:* `packages/editor/src/align.ts` holds the matching (`collectAlignTargets`,
`alignMove`, `alignmentOverlay`). Pieces level at one value are one target, the first in document
order — the one a tie would choose — so a row of level pieces costs a move one comparison. Not yet
built: dropping targets far outside the visible board (§5), and any label on an alignment line;
the words for them arrive with 3.17's readout.

*As built in 3.18:* `collectHostTargets` in `align.ts`, chosen by the Select tool when every
feature moved lies in one part and none is its outline. The host's centre lines (`host-centre`),
its straight extent edges (`host-edge`), the centres of its other hardware holes, hole rows,
cut-outs and labels (`feature-centre`, rank 5 above) and the axis-aligned guides; what moves is
excluded, and so is what moves with it (`dependentsOf`: a rivet's counterpart mirrored across a
fold), whose place now is not a place to line up with. A single circle — a hardware hole, a drawn
circle — lines up by its centre alone (`alignMove`'s `centreOnly`); anything else by its extent's
three values, so a fold carried near the middle lands on it. *Centre or centre of its extent* is
decided per axis by whether the outline is its own mirror image about that line: every segment,
reflected, is a segment of the outline, matched by five points along it. So the key fob's strap
says *Centre* on both, an isosceles gusset on its upright line only, and a turned rectangle — not
mirrored about an upright or level line through its middle — says *Centre of its extent*. The
test is conservative: an outline split at places not mirrored to each other reads as not mirrored,
and its label, *of its extent*, is still true. The words are the app's (`alignment.*`, through
`ToolContext.alignmentWords`), drawn in the board's value voice past the far end of the line, for
the host's centre only; the other guides stay unlabelled until 3.17's readout. Collecting the host's
targets on the 1,000-point traced outline, mirrored both ways, costs 5.2 ms once per drag
(`editor/align-collect-host-traced-1000`; matched by a binary search on the segments' midpoints,
a scan of every pair cost 292 ms); a move costs 0.3 µs (`editor/align-drag-host-traced-1000`).

**Locks and refusals.** A move that `transformRefusal` refuses shows its notice and no guides,
because nothing would move to them. Linked features move with their piece as today; a derived line
dragged alone stays refused.

## 7. Live distances and clearance (3.17)

While a move is under way:

- **The move itself:** Δx and Δy in millimetres beside the cursor, in the value-chip style (U.14),
  one decimal as the chips show, and in the status bar's readout.
- **Features inside a piece:** the distance from the selection to the piece's outline along the
  four world axes — a ray from the selection's extent side (or a hole's rim) to the nearest crossing
  with the outline. Real geometry, not the extent, so a curved flap reads true.
- **Clearance:** for a hardware hole, row hole or stitch hole set being moved, the **minimum**
  distance to any edge (outline or cut-out), from the rim, computed by the **same function**
  `HOLE_TOO_CLOSE_TO_EDGE` uses (Q33's exact rim test in `packages/domain/src/validate.ts`),
  exported for the purpose rather than re-implemented. Below the rule's 1.5 mm it is drawn in the
  warning tone with the rule's short name, so what the readout warns about is what Problems will
  list after the drop. A property test holds the two equal.

Labels hide when the gap they measure is under 24 CSS px on screen, so a zoomed-out board is not
covered in numbers.

*As built in 3.17:* `packages/editor/src/distances.ts`. The move's Δ and a hole's clearance are in
a chip beside the pointer (the DOM, in the value chips' pill and the ground's ink), Δ also in the
status bar beside the cursor's place; the four gaps are drawn on the board, in the tools' live
colour, each label left of an upright line so the chip does not cover it. A ray is cast from the
middle of each side of the extent, or for a single hole from its centre, less its radius, so a rim
on the edge still finds it; it crosses the outline only, not cut-outs. The clearance is
`edgeClearance`, exported from `validate.ts` and now the one judgement `OUTSIDE_PART` (holes) and
`HOLE_TOO_CLOSE_TO_EDGE` are made from, read from the previewed document — what moves and what
moves with it, a rivet's counterpart across a fold included — so the readout and Problems agree by
construction; a property drives the Select tool to random drops and holds them equal. Its states:
*N mm from the edge*, *N mm from the edge · Too near the edge* in the ground's warning tone, and
*Off the material* for a hole whose cut leaves the leather — a rim, or since Q46 a stitch tooth, through an edge. A whole piece reads its Δ alone: its
holes' clearance does not change as it moves. Work per move: four ray crossings, each a scan of
the outline's segment boxes and the exact crossing of those that meet the ray, and one clearance
per moved hole; on the 1,000-point traced outline 1.98 ms a move
(`editor/readout-drag-host-traced-1000`, one run on the Linux development machine), beside the
5.9 ms a piece carried beside that outline already pays to evaluate and index its snaps
(`editor/snap-drag-beside-traced`, the same run).

## 8. Equal spacing (3.19)

When a piece (or a feature inside a piece) is moved along one axis between two neighbours whose
extents overlap it in the other axis, and the two gaps come within tolerance of each other, the
move snaps to equal gaps and both gaps are labelled with the same number. Also offered: the gap
of an existing pair repeated (three card slots 15 mm apart, the third placed by the first two).

- Gaps are measured between exact extents, as Distribute measures them, so the guide and the
  command agree.
- Not offered when either neighbour is turned or irregular in that axis (its extent is not a face
  the gap is measured from), because the label would promise something the leather does not show.
- Distribute (3.10) stays the exact, keyboard way to do it.

*As built in 3.19:* `packages/editor/src/spacing.ts`, called from `alignMove`. A neighbour is
the nearest extent below or above the moved one that overlaps it across — within reach, so a
piece carried a little into its neighbour still has it; the repeated gap is that neighbour's own
nearest neighbour's. Faces are other pieces' outlines for a whole piece, the host's cut-outs for
a feature inside one; holes and labels are none, and a single hole is not spaced. Both labels
show the candidate's one gap value, not each drawn gap measured again.

## 9. What is drawn

- Overlay display items only (the tool's `buildOverlay`), never document geometry, exports,
  thumbnails or Sheets. A persisted guide is still made only by the Guides tool or a ruler.
- **Lines:** thin, solid, in the existing snap colour (`CANVAS.overlay.snap`, the one hue no layer
  role uses), spanning from the reference to the farthest matching target. A small × at each
  matched point. Screen-constant widths in CSS px, multiplied by the display ratio once in the
  backends (CLAUDE.md).
- **Labels:** the value-chip pill, the words from `en.json` through the app (no sentence below
  `apps/desktop`; the editor reports `{ kind, valueMm, source }`).
- Frames: an overlay change invalidates the board through the existing `ctx.invalidate()`; idle
  frames stay unscheduled (PERF-014) and the pattern layer stays cached (PERF-008).

## 10. Keys and modifiers

| While moving | Does |
|---|---|
| Ctrl (held) | Suspends every snap and guide |
| Shift (held) | Keeps the move on the axis it started along (horizontal or vertical) |
| Escape | Cancels the move; the piece goes back; no history |
| Alt | Pans, as today — not a move modifier |
| Arrow keys (board focused, nothing being dragged) | Nudge 1 mm · Shift 10 mm · Alt 0.1 mm |

On macOS Ctrl stays the suspension key, because ⌘-drag is the system's. U.12 makes every one of
these rebindable except Escape.

## 11. Accessibility

Guides are a pointer convenience. Every placement they make is also reachable by keyboard: select
by Tab and the Parts tree, nudge (3.14), type X/Y or Move by (3.15), Align and Distribute (3.10),
and a hardware hole's typed centre. When a move commits, the existing announcer says what moved
and where it ended ("Rivet moved 12.0 mm right; 3.5 mm from the edge"). Colour is never the only
sign: a warning label carries the rule's words, not only the tone.

*As built in 3.17:* the live region is the board's own (`move-announcer`, polite), beside the
project bar's: a kept drag or nudge says "Moved 12.0 mm right and 3.0 mm down; 3.50 mm from the
edge." — the directions, and the clearance in the readout's words when holes moved inside a piece.
What moved is not named: the selection says it, and a piece and a feature would need two
sentences for no new fact. Each announcement is a new node, so two equal nudges are both said. A
refused move says its refusal, as before, and nothing more.

## 12. Correctness rules

- Millimetres in, millimetres out: the editor converts pixels once, through the viewport.
- The committed command is the existing `translateFeatures`; history holds one step per gesture.
- Nothing the overlay shows is persisted; `smartGuides` is an application preference.
- Snapping is a proposal: quantisation happens when the value enters the document (invariant 8).

## 13. Tests

**Unit and property (editor, synthetic events — `docs/testing.md` §5.3):**

- *Exact:* for random extents and a raw delta within tolerance of a target, the committed delta
  puts the reference on the target within the storage quantum.
- *Idempotent:* aligning an already aligned move returns the same delta.
- *Tolerance:* nothing is caught beyond tolerance; widening the tolerance never loses a catch.
- *Translation invariant:* moving the whole scene by a vector moves every result by it.
- *Priority:* a point snap within tolerance always wins both axes; within a rank the nearest wins;
  ties resolve by document order regardless of input order.
- *Hysteresis:* a caught candidate is kept until 1.5 × tolerance; a higher rank still takes over.
- *Zoom:* the same screen-pixel gesture catches the same target at any `cssPxPerMm`.
- *Clearance:* the readout's warning ⇔ `HOLE_TOO_CLOSE_TO_EDGE` for the dropped position.
- *Body pick:* a point inside the material and farther than tolerance from every line picks the
  piece; inside a cut-out picks nothing; on a line picks the line.
- *Nudge:* one press, one history entry; a held key, one; a locked piece refused with its notice.

**E2E:** centre a rivet on the key fob's strap end by dragging near the centre — Properties then
read the exact centre; Ctrl-drag does not align; Escape cancels; undo is one step; nudge with each
modifier; Ctrl+A; X/Y and Move by; a hole dragged near an edge shows the warning label.

**Pixels:** one baseline of a move with an alignment line and a distance label (`pnpm
test:visual`).

**Performance:** a benchmark of a drag among 200 pieces and of a hole inside the 1,000-point
traced outline (`fixtures/perf/traced-1000.lcp`); a work bound that targets are collected once per
gesture and at most four ray crossings are computed per pointer move. PERF-004's crossing cache,
PERF-008's cached pattern and PERF-014's idle frames are left as they are.

## 14. Not in 1.7

Alignment while drawing (tracking lines from corners); alignment to inclined edges; matching
another piece's size by drag (there are no resize handles, and drag handles for typed values are
*Not planned*); Alt-drag duplication (Alt pans); a tolerance setting.
