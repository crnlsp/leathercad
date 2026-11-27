import type { DrawMode } from '@leathercad/editor';

/** A workshop step: what is cut, what is sewn, what is marked (MS.5). */
export type DrawGroup = 'cut' | 'stitch' | 'mark';

/**
 * *Draw as*, in the order the workshop works. One fixed result each (X4).
 * *Outline* and *Stitch + allowance* each make a new part and never read the
 * selection; the rest join the selected one — which each choice's tooltip says.
 *
 * *Stitch + allowance* dimensions the part from its **opening**: what is drawn
 * is the stitch line, and the cut edge is derived outward from it — the
 * direction a maker wants when the inside measurement is the one that matters
 * (§3.4). So it is sewn first, and sits with the stitch line.
 */
export const DRAW_GROUPS: readonly {
  readonly group: DrawGroup;
  readonly modes: readonly DrawMode[];
}[] = [
  { group: 'cut', modes: ['outline', 'cut-out'] },
  { group: 'stitch', modes: ['stitch', 'stitch-allowance'] },
  { group: 'mark', modes: ['fold', 'marking'] },
];
