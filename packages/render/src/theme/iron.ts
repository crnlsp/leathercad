/**
 * The pricking iron a slit is drawn from, until the model knows the maker's own
 * (UI Foundations §8.1, §9.3; F.7).
 *
 * A hole set stores only its pitch and a cosmetic label, so the shape of the
 * slit is **nominal**: a standard French-style iron, from what makers publish.
 * The iron library is where a preset will carry its own tooth width and angle,
 * and the renderer will read those instead. See the F.7 design, §3.1.
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
