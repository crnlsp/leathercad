import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ARRANGE_ICON, FLIP_ICON, MIRROR_ICON } from './arrange.js';
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

describe('the faces of Align and Distribute (U.24c)', () => {
  const modes = ['min', 'centre', 'max', 'distribute'] as const;
  const quarter = 'transform="rotate(-90 8 8)"';

  it('the vertical row is the horizontal row turned a quarter, so left comes round to the bottom', () => {
    for (const mode of modes) {
      const across = markup(ARRANGE_ICON.x[mode]);
      const up = markup(ARRANGE_ICON.y[mode]);
      expect(across).not.toContain('rotate(');
      expect(up).toContain(quarter);
      // The same drawing inside the turn.
      const inner = (svg: string) =>
        svg.replace(/<g transform="rotate\(-90 8 8\)">|<\/g>| data-icon="[^"]*"/g, '');
      expect(inner(up)).toBe(inner(across));
    }
  });

  it('left aligns against an edge on the left, right against one on the right', () => {
    expect(markup(ARRANGE_ICON.x.min)).toContain('d="M2.25 1.75v12.5"');
    expect(markup(ARRANGE_ICON.x.max)).toContain('d="M13.75 1.75v12.5"');
  });

  it('a centre is drawn about a centre line, in the dash-dot of an axis', () => {
    expect(markup(ARRANGE_ICON.x.centre)).toContain('stroke-dasharray="2.5 1 .75 1"');
  });

  it('every face is its own', () => {
    const faces = modes.flatMap((mode) => [ARRANGE_ICON.x[mode], ARRANGE_ICON.y[mode]]);
    expect(new Set(faces.map(markup)).size).toBe(faces.length);
  });
});
