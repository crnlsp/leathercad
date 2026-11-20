import type { ArrangeAxis, ArrangeMode, FlipAxis, MirrorDirection } from '@leathercad/document';

import type { IconName } from './names.js';

/**
 * The faces of Flip and Mirror (R-05), wherever they are offered: Arrange in
 * Properties, and the right-click menu.
 *
 * Both are drawn about an axis in the fold's rhythm. Flip turns the piece
 * itself over, so one side is solid and the other open, where it goes; Mirror
 * makes a counterpart, so both sides are drawn. `horizontal` is left to right,
 * about an upright axis, for both.
 */
export const FLIP_ICON: Readonly<Record<FlipAxis, IconName>> = {
  horizontal: 'flip-lr',
  vertical: 'flip-ud',
};

export const MIRROR_ICON: Readonly<Record<MirrorDirection, IconName>> = {
  horizontal: 'mirror-lr',
  vertical: 'mirror-ud',
};

/**
 * The faces of Align and Distribute (U.24c), one row per axis. `min` on the
 * vertical row is the bottom, as the board's Y goes up: the same drawing as
 * the left, turned a quarter.
 */
export const ARRANGE_ICON: Readonly<Record<ArrangeAxis, Readonly<Record<ArrangeMode, IconName>>>> =
  {
    x: {
      min: 'align-left',
      centre: 'align-centre-x',
      max: 'align-right',
      distribute: 'distribute-x',
    },
    y: {
      min: 'align-bottom',
      centre: 'align-centre-y',
      max: 'align-top',
      distribute: 'distribute-y',
    },
  };
