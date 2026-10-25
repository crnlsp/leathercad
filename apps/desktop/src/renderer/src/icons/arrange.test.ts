import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FLIP_ICON, MIRROR_ICON } from './arrange.js';
import { Icon } from './Icon.js';
import type { IconName } from './names.js';

/**
 * A left-to-right flip or mirror is drawn about an upright axis, a
 * top-to-bottom one about a level axis: the same drawing turned a quarter.
 * Round 1 of the icon set had the two mirrors the wrong way round (ADR 0021).
 */
const markup = (name: IconName): string => renderToStaticMarkup(createElement(Icon, { of: name }));

const uprightAxis = 'd="M8 1.5v13"';
const turned = 'transform="rotate(90 8 8)"';

describe('the faces of Flip and Mirror', () => {
  for (const [name, icons] of [
    ['Flip', FLIP_ICON],
    ['Mirror', MIRROR_ICON],
  ] as const) {
    it(`${name} ↔ is drawn about an upright axis, and ↕ about a level one`, () => {
      expect(markup(icons.horizontal)).toContain(uprightAxis);
      expect(markup(icons.horizontal)).not.toContain(turned);
      expect(markup(icons.vertical)).toContain(turned);
    });
  }

  it('Flip fills the piece that moves; Mirror draws both, filling neither', () => {
    expect(markup(FLIP_ICON.horizontal)).toContain('fill="currentColor"');
    expect(markup(MIRROR_ICON.horizontal)).not.toContain('fill="currentColor"');
  });
});
