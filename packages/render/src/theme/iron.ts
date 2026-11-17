/**
 * The pricking iron a slit is drawn from when a hole set's iron was not said
 * (UI Foundations §8.1, §9.3; F.7; 9.26, D26), and the slant the stitch icons
 * take.
 *
 * A hole set given a tooth is drawn from its tooth (`slitsFor`). One without
 * stores only its pitch, so its slit is **nominal**: a standard French-style
 * iron, from what makers publish — the same values as the domain's French
 * style, which `leather.test.ts` holds them to.
 *
 * A **rendering convention, never model data**: worked out from the stored
 * pitch while drawing, never persisted, and never exported — paper keeps its
 * centre circles.
 */
export const NOMINAL_IRON = {
  /**
   * A tooth is about half as wide as the pitch: makers list 1.6 mm at 3.0,
   * 1.75 at 3.38 and 1.9 at 3.85 — 0.53, 0.52 and 0.49 of the pitch.
   */
  toothPerPitch: 0.5,
  /**
   * The slit's angle to the stitch line, counter-clockwise from the direction
   * of travel: `/` on a line drawn left to right, as a standard (not inverse)
   * iron leans. Makers publish cutting angles of 40–43°.
   */
  slantRad: Math.PI / 4,
  /** How thick the blade cuts, drawn only where it can be seen (the detail band). */
  bladeMm: 0.4,
} as const;
