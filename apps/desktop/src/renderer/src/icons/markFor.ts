import type { Feature } from '@leathercad/domain';

/**
 * The LeatherCAD marks (UI Foundations §10.3, F.6): the Tier 2 icons, each a
 * specimen of the geometry it names.
 */
export const MARKS = [
  'piece',
  'cut-edge',
  'cut-out',
  'stitch-line',
  'stitch-holes',
  'fold-valley',
  'fold-mountain',
  'marking',
  'seam-allowance',
  'mirror-across-fold',
  'hardware-hole',
  'measurement',
] as const;

export type Mark = (typeof MARKS)[number];

/**
 * Which mark names a feature — the same everywhere it is shown: the parts
 * tree, the property header, a problem row.
 *
 * By what the line *is*, which is more than its kind: an outline and a cut-out
 * are both cut contours and opposite ideas, and an edge grown outward from its
 * stitching is a seam allowance. A text label has no leather mark; it is type.
 */
export function markFor(feature: Feature): Mark | null {
  switch (feature.kind) {
    case 'cut-contour':
      if (
        feature.source.kind === 'derived' &&
        feature.source.op.type === 'offset' &&
        feature.source.op.side === 'outward'
      ) {
        return 'seam-allowance';
      }
      return feature.role === 'inner' ? 'cut-out' : 'cut-edge';
    case 'stitch-line':
      return 'stitch-line';
    case 'stitch-hole-set':
      return 'stitch-holes';
    case 'fold-line':
      return feature.direction === 'mountain' ? 'fold-mountain' : 'fold-valley';
    case 'marking-line':
      return 'marking';
    case 'hardware-hole':
      return 'hardware-hole';
    case 'measurement':
      return 'measurement';
    case 'text-label':
      return null;
  }
}
