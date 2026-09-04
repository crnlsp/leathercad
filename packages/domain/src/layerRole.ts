/**
 * The semantic category a piece of geometry belongs to.
 *
 * This is what separates the application from a generic vector editor. A path
 * is not "a black stroke"; it is a cut contour or a stitch line, and its
 * appearance, its export layer and its validation rules all follow from that.
 *
 * Fixed by the domain, not user-managed — there is no layer stack to organise,
 * which is one less concept for the user to carry. See docs/domain-model.md §5.
 */
export type LayerRole =
  'cut' | 'stitch' | 'stitch-holes' | 'fold' | 'mark' | 'hardware' | 'annotation' | 'construction';

export const LAYER_ROLES: readonly LayerRole[] = [
  'cut',
  'stitch',
  'stitch-holes',
  'fold',
  'mark',
  'hardware',
  'annotation',
  'construction',
];

/** Human label, for panels and problem messages. */
export const LAYER_ROLE_LABELS: Readonly<Record<LayerRole, string>> = {
  cut: 'Cut line',
  stitch: 'Stitch line',
  'stitch-holes': 'Stitch holes',
  fold: 'Fold line',
  mark: 'Marking line',
  hardware: 'Hardware',
  annotation: 'Annotation',
  construction: 'Construction',
};

/**
 * Whether a role represents material actually removed from the hide.
 *
 * Drives the cutting export preset: a laser file wants the cut outline and the
 * hardware holes, and nothing else. See docs/domain-model.md §5.
 */
export function isCutting(role: LayerRole): boolean {
  return role === 'cut' || role === 'hardware';
}
