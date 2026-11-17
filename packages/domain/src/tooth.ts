import { EPS_LENGTH, approxZero, quantise, type Mm } from '@leathercad/core';
import { circle, polyline, type Path, type Vec2 } from '@leathercad/geometry';

import type { Tooth } from './feature.js';

/**
 * The irons a maker can say they own (9.26): which values fill a tooth. Not
 * words — the app names them — and never stored in a project (D25): a hole set
 * keeps the tooth's values, as it keeps the pitch and not the iron.
 */
export const IRON_STYLES = ['french', 'japanese', 'round'] as const;
export type IronStyle = (typeof IRON_STYLES)[number];

/**
 * What each style's tooth is, from what makers publish (docs/glossary.md,
 * *Stitch hole*). Where makers disagree the commoner value is taken, and the
 * maker edits it.
 *
 * - **French** is F.7's nominal iron: a tooth half the pitch long (Pro Atelier
 *   Plus lists 1.6 mm at 3.0 and 1.9 at 3.85), a 0.4 mm blade, cut at 45° (43°
 *   published).
 * - **Japanese** teeth are longer diamonds: Sinabroks lists 2.4 mm at 3.85,
 *   0.62 of the pitch; Craft-sha's are half the pitch. No Japanese maker found
 *   publishes a slant or a blade, so French's are kept.
 * - **Round** prongs are 1.0–1.3 mm (WUTA) and 1.2–1.4 mm (KemovanCraft), at
 *   every pitch.
 */
const SLIT_PER_PITCH = { french: 0.5, japanese: 0.62 } as const;
const BLADE_MM: Mm = 0.4;
const SLANT_DEG = 45;
const ROUND_PRONG_MM: Mm = 1.2;

/** The tooth a style fills, for an iron of this pitch: quantised, as typed values are. */
export function toothOfStyle(style: IronStyle, pitchMm: Mm): Tooth {
  if (style === 'round') return { kind: 'round', diameterMm: ROUND_PRONG_MM };
  return {
    kind: 'slit',
    lengthMm: quantise(SLIT_PER_PITCH[style] * pitchMm),
    widthMm: BLADE_MM,
    slantDeg: SLANT_DEG,
  };
}

/**
 * The hole one tooth cuts, centred on the hole: a lozenge for a slit, its long
 * axis at the slant to the hole's tangent, or a circle for a round prong.
 *
 * A slit is a line through the hole, so a line drawn the other way gives the
 * same outline. A hole with no direction — a degenerate run — still gets one,
 * measured from +X, as the board's slits are. The lozenge runs tip, side, tip,
 * side, counter-clockwise.
 */
export function toothOutline(
  hole: { readonly point: Vec2; readonly tangent: Vec2 },
  tooth: Tooth,
): Path {
  const { point, tangent } = hole;
  if (tooth.kind === 'round') return circle(point, tooth.diameterMm / 2);

  const length = Math.hypot(tangent.x, tangent.y);
  const none = approxZero(length, EPS_LENGTH);
  const tx = none ? 1 : tangent.x / length;
  const ty = none ? 0 : tangent.y / length;
  const slant = (tooth.slantDeg * Math.PI) / 180;
  const ux = tx * Math.cos(slant) - ty * Math.sin(slant);
  const uy = tx * Math.sin(slant) + ty * Math.cos(slant);
  const a = tooth.lengthMm / 2;
  const b = tooth.widthMm / 2;
  return polyline(
    [
      { x: point.x + ux * a, y: point.y + uy * a },
      { x: point.x - uy * b, y: point.y + ux * b },
      { x: point.x - ux * a, y: point.y - uy * a },
      { x: point.x + uy * b, y: point.y - ux * b },
    ],
    true,
  );
}
