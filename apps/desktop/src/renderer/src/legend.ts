import type { Project } from '@leathercad/domain';

import { MARKS, markFor, type Mark } from './icons/markFor.js';

/**
 * A row of the canvas legend: a mark, or the link tick that derived lines wear.
 */
export type LegendKey = Mark | 'linked';

/**
 * What each mark is called in the legend: the maker's words, the ones the
 * panels already use — *Outline*, not *cut line (outer)* (F.1).
 */
export const LEGEND_NAMES: Readonly<Record<LegendKey, string>> = {
  piece: 'Piece',
  'cut-edge': 'Outline',
  'cut-out': 'Cut-out',
  'stitch-line': 'Stitch line',
  'stitch-holes': 'Stitch holes',
  'fold-valley': 'Valley fold',
  'fold-mountain': 'Mountain fold',
  marking: 'Marking line',
  'seam-allowance': 'Seam allowance',
  'mirror-across-fold': 'Mirror across fold',
  'hardware-hole': 'Hardware hole',
  measurement: 'Dimension',
  linked: 'Follows or mirrors another line',
};

/**
 * The legend's rows: one per mark among the features that are drawn, in the
 * marks' own order, and the link tick last when anything drawn is derived
 * (UI Foundations §8.6, F.7).
 *
 * The key to *this* drawing, not to every line the product can make: a legend
 * listing a fold on a piece with no fold teaches nothing. A hidden feature is
 * not drawn, so it is not listed. A hole set is always derived and wears no
 * tick, so it never adds the link row on its own.
 */
export function legendEntries(project: Project): readonly LegendKey[] {
  const present = new Set<LegendKey>();
  for (const part of project.parts) {
    for (const feature of part.features) {
      if (!feature.visible) continue;
      const mark = markFor(feature);
      if (mark !== null) present.add(mark);
      if (feature.source.kind === 'derived' && feature.kind !== 'stitch-hole-set') {
        present.add('linked');
      }
    }
  }
  return [...MARKS, 'linked' as const].filter((key) => present.has(key));
}
