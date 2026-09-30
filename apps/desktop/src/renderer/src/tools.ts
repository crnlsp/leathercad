export type ToolId =
  | 'select'
  | 'rectangle'
  | 'circle'
  | 'arc'
  | 'line'
  | 'polyline'
  | 'hardware'
  | 'text'
  | 'measure'
  | 'points'
  | 'rotate'
  | 'scale';

/**
 * A mode. Its words are the catalogue's (ADR 0018): `tools.<id>.name`, and
 * `tools.<id>.howTo` — how the tool is used, in one line, shown in the work
 * bar while it is the active mode and in its tooltip. That line replaced a
 * permanent "drag to draw" that was wrong for five of the tools (F.1), so each
 * has to be true of its own tool and no other.
 */
export interface ToolEntry {
  readonly id: ToolId;
  /** Single-letter shortcut, shown on the button. */
  readonly key: string;
}

export interface ToolGroup {
  /** Null for the ungrouped lead entry — Select stands on its own. */
  readonly id: 'draw' | 'place' | 'modify' | null;
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
  { id: null, tools: [{ id: 'select', key: 'V' }] },
  {
    id: 'draw',
    tools: [
      { id: 'rectangle', key: 'R' },
      { id: 'circle', key: 'C' },
      { id: 'arc', key: 'A' },
      { id: 'line', key: 'L' },
      { id: 'polyline', key: 'P' },
    ],
  },
  {
    // Put down with one click at a size you choose, rather than drawn out.
    // Grouped by how the tool is used, which is the fact the old single Draw
    // group hid (UI Foundations decisions §2.1).
    id: 'place',
    tools: [
      // Hardware is its own mode rather than a "draw as" option, because it is
      // the only one placed by a click at a chosen size rather than drawn.
      { id: 'hardware', key: 'H' },
      // X rather than T, which Rotate has for "turn". A label is placed with
      // one click and then typed in the panel.
      { id: 'text', key: 'X' },
      // A dimension is placed by naming two corners. It reads the drawing and
      // never changes it, which is why it is not under Modify.
      { id: 'measure', key: 'M' },
    ],
  },
  {
    id: 'modify',
    tools: [
      // Move is not here on purpose. The select tool already moves a selection
      // by dragging it, and a second mode that did the same thing would teach
      // the user that modes are not distinct — the opposite of what this
      // palette exists to say. Reserved key remaining: G.
      //
      // Edit Points changes the shape of one drawn path rather than moving the
      // selection whole (3.9c). N for "node", the drafting name for a point.
      { id: 'points', key: 'N' },
      { id: 'rotate', key: 'T' },
      { id: 'scale', key: 'S' },
    ],
  },
];

export const ALL_TOOLS: readonly ToolEntry[] = TOOL_GROUPS.flatMap((g) => g.tools);

/**
 * The tools that draw a new line — the ones *Draw as* applies to (F.8). The
 * work bar offers it only for these: for Select, Rotate or Scale it would be
 * a setting that does nothing.
 */
export const DRAWING_TOOL_IDS: ReadonlySet<string> = new Set(
  TOOL_GROUPS.filter((group) => group.id === 'draw').flatMap((group) =>
    group.tools.map((tool) => tool.id),
  ),
);
