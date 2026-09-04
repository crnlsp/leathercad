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
      { id: 'line', label: 'Line', key: 'L' },
      { id: 'polyline', label: 'Polyline', key: 'P' },
    ],
  },
  // Filled by slices 3.6 (circle, arc), 3.7 (move, rotate, scale) and 3.9
  // (vertex). Reserved keys: C, A, M, T, S, N, G.
  { label: 'Modify', tools: [] },
];

export const ALL_TOOLS: readonly ToolEntry[] = TOOL_GROUPS.flatMap((g) => g.tools);
