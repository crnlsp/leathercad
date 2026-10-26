import type { FlipAxis, MirrorDirection } from '@leathercad/document';

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
