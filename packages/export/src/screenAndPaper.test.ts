import { LAYER_ROLES } from '@leathercad/domain';
import { ROLE_STROKES, ROLE_STYLES } from '@leathercad/render';
import { describe, expect, it } from 'vitest';

import { PRINT_STYLES } from './scene.js';

/**
 * The audit that screen and paper agree (UI Foundations §2, F.4).
 *
 * Before F.4 a marking line was solid on screen and dotted on the pattern, and
 * the stitch and fold rhythms differed between the two — a canvas that claimed
 * to preview the paper and did not. Now both read one role table, and this
 * holds them to it: a drift fails the build rather than waiting for someone to
 * notice a dotted line on paper.
 */
describe('screen and paper', () => {
  it('style every layer role, in both media', () => {
    for (const role of LAYER_ROLES) {
      expect(ROLE_STROKES[role], `screen style for ${role}`).toBeDefined();
      expect(PRINT_STYLES[role], `print style for ${role}`).toBeDefined();
    }
  });

  it('draw every role with the same dash rhythm — the very same array', () => {
    for (const role of LAYER_ROLES) {
      expect(ROLE_STROKES[role].dashMm, role).toBe(PRINT_STYLES[role].dashMm);
      expect(PRINT_STYLES[role].dashMm, role).toBe(ROLE_STYLES[role].dashMm);
    }
  });

  it('agree on which roles are dashed at all', () => {
    // The old defect in its plainest form: dotted on paper, solid on screen.
    for (const role of LAYER_ROLES) {
      const onScreen = (ROLE_STROKES[role].dashMm ?? []).length > 0;
      const onPaper = PRINT_STYLES[role].dashMm.length > 0;
      expect(onScreen, role).toBe(onPaper);
    }
  });
});
