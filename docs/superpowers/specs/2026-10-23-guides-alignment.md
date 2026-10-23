# 3.10 — Guides, alignment and distribution

Construction guides help place a fold, hole or pocket without putting another line on the printed
pattern. Aligning and distributing independent pieces uses the same document commands as moving
them, so the operation is one undo step and preserves the piece's internal relationships.

## Acceptance criteria

- Drag from the top ruler for a horizontal guide, or the left ruler for a vertical one. A release
  back on the rulers or outside the board cancels creation, as do Escape and pointer cancellation.
  Undo during the drag cancels it without creating a later history entry.
- The Guides tool places a horizontal guide; the modifier shown in its hint places a vertical one.
  Properties can also add either orientation without the pointer. A guide's origin and angle can
  be typed, including diagonal angles, and the guide can be selected, moved, deleted and restored
  by undo. A feature at the same point remains selectable ahead of the guide.
- Drawing and moving snap to infinite guide lines, crossings between guides, and crossings with
  drawn geometry. The existing snap-suspension modifier works; a guide being moved excludes its
  own line and intersections. Guide positions remain world millimetres at every zoom and ratio.
- A multi-selection offers left/centre/right, bottom/centre/top, and equal horizontal/vertical
  gaps in Properties. Alignment needs two independent items; distribution needs three. The
  disabled action says why. Both are single undoable commands.
- An outline stands for its whole piece, including hidden children. An outline and its selected
  children count once. Locked, unresolved or separately linked items refuse the entire action.
- Guides survive save/open and do not enter exported content, export bounds, thumbnails or the
  Sheets view. Every older format fixture still opens. Existing guides and ordinary in-place edits
  preserve unknown fields.

## Decisions

Guides are a project-level array of `{ id, origin, angleRad }`, not features in a leather piece.
An absent array means no guides. Selection can name one guide, independently of feature/part
selection, and history restores that selection. The initial UI has no guide names, visibility
flags, locks or groups: exact position, angle and deletion are sufficient for this slice.

A line's origin is not canonicalised: it is the point the maker placed and can retype. Angles are
stored exactly, like path geometry, so a save does not tilt a vertical guide or move a diagonal
snap. Position input is quantised with the existing storage quantum.

The format moves to **10**: guides change what the board draws, so file-format §4.5 requires an
older reader to ask for an update. The v9→v10 migration is an identity; old projects had no guides.
A new fixture records all three orientations, and no old fixture or migration is rewritten.

Alignment uses the union of the selected world-axis bounding boxes. A whole piece is measured by
its outline, as the existing transform scope does. Distribution sorts by the lower bound on the
chosen axis, holds the first and last items fixed and divides the available edge-to-edge space
equally. When the span is too small, equal gaps can be negative: the overlap is distributed evenly
while preserving item order. If the sizes would reverse that order, the action explains why the
outer items must be moved farther apart first.
Translation uses the storage quantum, so gaps and alignment agree to that precision.

Independent units which reference one another are refused. Applying different translations to a
source and its result would otherwise move the result through both its source and its own
placement. References within a whole piece stay together, through the existing transform rules.

## Verification

Co-located tests cover projection/crossing properties, arrangement and history, snap priority and
exclusions, schema rejection, the full old format corpus, exact guide round trips and export
exclusion. `e2e/guides-alignment.spec.ts` exercises the user workflows and accessibility. The
standard app, visual and packaged suites cover the rest of the shell.
