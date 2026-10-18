import type { FlipAxis, MirrorDirection } from '@leathercad/document';
import {
  SquareCenterlineDashedHorizontal,
  SquareCenterlineDashedVertical,
  TrianglesCenterlineDashedHorizontal,
  TrianglesCenterlineDashedVertical,
  type LucideIcon,
} from 'lucide-react';

/**
 * The faces of Flip and Mirror (R-05), wherever they are offered: Arrange in
 * Properties, and the right-click menu.
 *
 * Picked by what they draw, not by Lucide's names. Since Lucide 1.x
 * `FlipHorizontal2` is `TrianglesCenterlineDashedHorizontal` — a line drawn
 * across, a shape above it and its reflection below: a flip top to bottom.
 * The menu's Flip horizontal showed that, and the parts list's mirror mark.
 *
 * Flip turns the shape itself over (triangles); Mirror makes a counterpart
 * beside it (a shape split by the line it is mirrored across).
 */
export const FLIP_ICON: Readonly<Record<FlipAxis, LucideIcon>> = {
  horizontal: TrianglesCenterlineDashedVertical,
  vertical: TrianglesCenterlineDashedHorizontal,
};

export const MIRROR_ICON: Readonly<Record<MirrorDirection, LucideIcon>> = {
  horizontal: SquareCenterlineDashedHorizontal,
  vertical: SquareCenterlineDashedVertical,
};
