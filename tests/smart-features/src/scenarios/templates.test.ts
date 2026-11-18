import { describe, expect, it } from 'vitest';

import { holdsCard, resize } from '../harness/actions.js';
import { checkMatrixClaims } from '../harness/coverage.js';
import { Bench } from '../harness/bench.js';
import type { Expected } from '../harness/expectDiagnostics.js';

/**
 * The built-in templates (I), opened as the app opens them: from the files in
 * fixtures/projects that the app ships. A template is not assumed correct; what
 * is checked is what it says, and what it says when a maker states a purpose.
 */

checkMatrixClaims();

const TEMPLATES = ['bifold-wallet', 'card-holder', 'key-fob', 'coaster'] as const;
const POCKET_STITCH = 'pocket-stitch';

describe('I — the built-in templates', () => {
  it.each(TEMPLATES)('SF-I1 · %s opens saying nothing at all', (name) => {
    Bench.open(name).expect([]);
  });

  /**
   * Characterises a gap (docs/smart-features.md §5): the two templates made
   * for cards ship with their pockets' purpose unstated, so DR8 checks
   * nothing on them until the maker says what they hold.
   */
  it('SF-I2 · no template states what its pockets hold', () => {
    for (const name of TEMPLATES) {
      const stated = Bench.open(name)
        .project.parts.flatMap((part) => part.features)
        .filter((f) => f.kind === 'stitch-line' && f.holds !== undefined);
      expect(stated, name).toEqual([]);
    }
  });

  it('SF-I3 · the card holder holds a card with 4 mm of ease, standing proud; held fully it is too shallow', () => {
    // 99.0 mm between stitch lines; 44.3487 mm below its opening (D19).
    Bench.open('card-holder')
      .do(holdsCard(POCKET_STITCH, 4))
      .expect([], 'standing proud')
      .do(holdsCard(POCKET_STITCH, 4, true))
      .expect(
        [
          {
            code: 'POCKET_TOO_SHALLOW',
            severity: 'warning',
            on: POCKET_STITCH,
            facts: { depthMm: 44.3487, neededMm: 53.98 },
          },
        ],
        'held fully',
      );
  });

  it('SF-I5 · narrowing the card holder’s pocket by 6 mm breaks its bottom seam, and only that', () => {
    // The pocket's sides keep their length, so the side seams still pair; its
    // bottom loses 6 mm of stitching and two holes against the outer's 27. The
    // card still fits: 93 mm between stitch lines against 89.6 mm.
    Bench.open('card-holder')
      .do(holdsCard(POCKET_STITCH, 4), resize('pocket', { width: 99 }))
      .expect([
        {
          code: 'SEAM_HOLE_COUNT_MISMATCH',
          severity: 'error',
          on: 'pocket-holes',
          related: ['outer-holes'],
          facts: {
            seamId: 'pocket-bottom-seam',
            a: { partId: 'pocket', count: 25 },
            b: { partId: 'outer', count: 27 },
          },
        },
      ]);
  });

  it('SF-I4 · the bifold’s pockets are too narrow for a card with 4 mm of ease, wide enough with 2, deep enough either way', () => {
    // 89.0 mm between stitch lines (D20); 57 mm below the opening.
    const narrow: Expected = {
      code: 'POCKET_TOO_NARROW',
      severity: 'warning',
      on: POCKET_STITCH,
      facts: { widthMm: 89, neededMm: 89.6, easeMm: 4 },
    };
    Bench.open('bifold-wallet')
      .do(holdsCard(POCKET_STITCH, 4, true))
      .expect([narrow], 'with 4 mm of ease')
      .do(holdsCard(POCKET_STITCH, 2, true))
      .expect([], 'with 2 mm of ease');
  });
});
