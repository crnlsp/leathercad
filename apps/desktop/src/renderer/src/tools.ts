export interface ToolEntry {
  readonly id: string;
  readonly label: string;
  /** Single-letter shortcut, shown on the button. */
  readonly key: string;
  /**
   * How the tool is used, in one line — shown in the header while it is the
   * active mode, and in its tooltip. It replaced a permanent "drag to draw"
   * that was wrong for five of the tools (F.1), so each line has to be true of
   * its own tool and no other.
   */
  readonly howTo: string;
}

export interface ToolGroup {
  /** Null for the ungrouped lead entry — Select stands on its own. */
  readonly label: string | null;
  readonly tools: readonly ToolEntry[];
}

/**
 * Modes, grouped by what the user is doing: drawing something out, placing
 * something with a click, or changing something that exists. That is the CAD convention — Line, Circle, Arc and
 * Polyline together under drawing, modification separate — and it is why
 * rectangle does not sit apart from polyline despite being parametric. The
 * parametric difference is met in the property panel, not here.
 *
 * Only modes belong in this list. Undo, save and delete are actions: they fire
 * once, and a palette that mixes the two teaches nothing about either.
 *
 * Groups with no tools yet are not rendered. An empty heading is noise.
 */
export const TOOL_GROUPS: readonly ToolGroup[] = [
  {
    label: null,
    tools: [
      {
        id: 'select',
        label: 'Select',
        key: 'V',
        howTo:
          'Click to select · Shift-click adds or removes · drag on empty space to box-select · drag a selection to move it · Del removes',
      },
    ],
  },
  {
    label: 'Draw',
    tools: [
      {
        id: 'rectangle',
        label: 'Rectangle',
        key: 'R',
        howTo: 'Drag corner to corner, or click both corners · Shift keeps it square',
      },
      {
        id: 'circle',
        label: 'Circle',
        key: 'C',
        howTo: 'Drag out from the centre, or click the centre and then the rim',
      },
      {
        id: 'arc',
        label: 'Arc',
        key: 'A',
        howTo: 'Click the start, the end, then a point the arc passes through',
      },
      {
        id: 'line',
        label: 'Line',
        key: 'L',
        howTo: 'Drag end to end, or click both ends · Shift holds 15° steps',
      },
      {
        id: 'polyline',
        label: 'Polyline',
        key: 'P',
        howTo:
          'Click each point · A arcs the next segment: click its end, then a point on it · L goes straight · click the first to close · Enter finishes · Backspace takes one back',
      },
    ],
  },
  {
    // Put down with one click at a size you choose, rather than drawn out.
    // Grouped by how the tool is used, which is the fact the old single Draw
    // group hid (UI Foundations decisions §2.1).
    label: 'Place',
    tools: [
      // Hardware is its own mode rather than a "draw as" option, because it is
      // the only one placed by a click at a chosen size rather than drawn.
      {
        id: 'hardware',
        label: 'Hardware',
        key: 'H',
        howTo: 'Click to punch a hole in the selected part, at the size chosen above',
      },
      // X rather than T, which Rotate has for "turn". A label is placed with
      // one click and then typed in the panel.
      {
        id: 'text',
        label: 'Text',
        key: 'X',
        howTo: 'Click to place a label on the selected part, then type it in the panel',
      },
      // A dimension is placed by naming two corners. It reads the drawing and
      // never changes it, which is why it is not under Modify.
      {
        id: 'measure',
        label: 'Measure',
        key: 'M',
        howTo: 'Click two corners to dimension the distance between them',
      },
    ],
  },
  {
    label: 'Modify',
    tools: [
      // Move is not here on purpose. The select tool already moves a selection
      // by dragging it, and a second mode that did the same thing would teach
      // the user that modes are not distinct — the opposite of what this
      // palette exists to say. Reserved keys remaining: N, G.
      {
        id: 'rotate',
        label: 'Rotate',
        key: 'T',
        howTo: 'Drag around the selection to turn it about its centre',
      },
      {
        id: 'scale',
        label: 'Scale',
        key: 'S',
        howTo: 'Drag to resize the selection about its centre · Shift holds the proportions',
      },
    ],
  },
];

export const ALL_TOOLS: readonly ToolEntry[] = TOOL_GROUPS.flatMap((g) => g.tools);
