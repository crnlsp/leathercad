import { NOMINAL_IRON } from '@leathercad/render';

/**
 * The stitch-holes mark's three slits, in its 16 px box, at the slant the
 * canvas draws (F.7).
 *
 * Computed from the one constant rather than drawn by hand: F.6 drew them at
 * about 72°, the canvas now draws the iron's 45°, and the legend sets the mark
 * beside the canvas it explains. Three here, eighty on the canvas; the slant is
 * the invariant (decisions §3).
 */
export function slitMarkPath(): string {
  const half = 3;
  // SVG Y points down, so a slit leaning right rises to the right.
  const dx = round(half * Math.cos(NOMINAL_IRON.slantRad));
  const dy = round(half * Math.sin(NOMINAL_IRON.slantRad));
  return [4, 8, 12]
    .map((cx) => `M${fmt(cx - dx)} ${fmt(8 + dy)} ${fmt(cx + dx)} ${fmt(8 - dy)}`)
    .join('');
}

const round = (value: number): number => Math.round(value * 100) / 100;
const fmt = (value: number): string => String(round(value));
