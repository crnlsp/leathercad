import { command, type Fix } from '@leathercad/document';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { fixText } from './fixText.js';

const { t } = createI18n('en');
const base = {
  problemKey: 'k',
  featureId: 'line',
  featureName: 'Stitch line',
  edit: command({ action: 'move-point' }, (d) => d),
};

describe('a fix, in words (9.17)', () => {
  it.each([
    [-0.605314, 'Shorten Stitch line by 0.61 mm'],
    [0.2501, 'Lengthen Stitch line by 0.25 mm'],
  ])('says which way a seam length of %s moves the stitching', (changeMm, words) => {
    const fix: Fix = { ...base, kind: 'seam-length', changeMm, vertex: 0, to: { x: 0, y: 0 } };
    expect(fixText(fix, t)).toBe(words);
  });

  it('names the margin an edge fix moves the stitching to', () => {
    expect(fixText({ ...base, kind: 'edge-margin', marginMm: 1.5001 }, t)).toBe(
      'Move Stitch line 1.50 mm in',
    );
  });
});
