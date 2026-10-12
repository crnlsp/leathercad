import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FLIP_ICON, MIRROR_ICON } from './arrange.js';

/**
 * A left-to-right flip or mirror is drawn about an upright line, a
 * top-to-bottom one about a level line — read from what the icon draws, since
 * Lucide's names stopped saying it (`FlipHorizontal2` draws a level line).
 */
const markup = (icon: (typeof FLIP_ICON)['horizontal']): string =>
  renderToStaticMarkup(createElement(icon));

/** The dashed centre line's dashes: `M12 …v2` upright, `M… 12H…`/`h-2` level. */
const upright = /d="M12 \d+v2"/;
const level = /d="M\d+ 12[Hh]-?\d+"/;

describe('the faces of Flip and Mirror', () => {
  for (const [name, icons] of [
    ['Flip', FLIP_ICON],
    ['Mirror', MIRROR_ICON],
  ] as const) {
    it(`${name} ↔ is drawn about an upright line, and ↕ about a level one`, () => {
      expect(markup(icons.horizontal)).toMatch(upright);
      expect(markup(icons.horizontal)).not.toMatch(level);
      expect(markup(icons.vertical)).toMatch(level);
      expect(markup(icons.vertical)).not.toMatch(upright);
    });
  }
});
