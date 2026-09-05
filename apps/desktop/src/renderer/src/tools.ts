export interface ToolEntry {
  readonly id: string;
  readonly label: string;
  /** Single-letter shortcut, shown on the button. */
  readonly key: string;
}

export interface ToolGroup {
  /** Null for the ungrouped lead entry — Select stands on its own. */
  readonly label: string | null;
  readonly tools: readonly ToolEntry[];
}

/**
 * Modes, grouped by what the user is doing: making something, or changing
 * something that exists. That is the CAD convention — Line, Circle, Arc and
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
  { label: null, tools: [{ id: 'select', label: 'Select', key: 'V' }] },
  {
    label: 'Draw',
    tools: [
      { id: 'rectangle', label: 'Rectangle', key: 'R' },
      { id: 'circle', label: 'Circle', key: 'C' },
      { id: 'arc', label: 'Arc', key: 'A' },
      { id: 'line', label: 'Line', key: 'L' },
      { id: 'polyline', label: 'Polyline', key: 'P' },
    ],
  },
  {
    label: 'Modify',
    tools: [
      // Move is not here on purpose. The select tool already moves a selection
      // by dragging it, and a second mode that did the same thing would teach
      // the user that modes are not distinct — the opposite of what this
      // palette exists to say. Reserved keys remaining: M, N, G.
      { id: 'rotate', label: 'Rotate', key: 'T' },
      { id: 'scale', label: 'Scale', key: 'S' },
    ],
  },
];

export const ALL_TOOLS: readonly ToolEntry[] = TOOL_GROUPS.flatMap((g) => g.tools);
