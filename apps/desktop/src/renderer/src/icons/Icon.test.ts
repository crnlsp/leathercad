import { NOMINAL_IRON } from '@leathercad/render';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Icon } from './Icon.js';
import { ICON_NAMES, type IconName } from './names.js';

const markup = (name: IconName): string => renderToStaticMarkup(createElement(Icon, { of: name }));

/** The `M… L…` segments of every path that draws slits: the butt-capped ones. */
function slits(name: IconName): [number, number, number, number][] {
  const found: [number, number, number, number][] = [];
  for (const [, d] of markup(name).matchAll(/d="([^"]+)"[^>]*stroke-linecap="butt"/g)) {
    for (const [, x1, y1, x2, y2] of d!.matchAll(/M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)/g)) {
      found.push([Number(x1), Number(y1), Number(x2), Number(y2)]);
    }
  }
  return found;
}

describe('the icon set', () => {
  it.each(ICON_NAMES)('%s draws something, with every number a number', (name) => {
    const svg = markup(name);
    expect(svg).toContain('viewBox="0 0 16 16"');
    expect(svg).toMatch(/<(path|circle|rect)/);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it.each(['squeezed', 'stretched', 'delete', 'spinner'] as const)(
    "%s's slits lean at the iron's slant",
    (name) => {
      const found = slits(name);
      expect(found.length).toBeGreaterThanOrEqual(3);
      for (const [x1, y1, x2, y2] of found) {
        // SVG Y points down: a slit leaning right rises as it goes right.
        expect(Math.atan2(y1 - y2, x2 - x1)).toBeCloseTo(NOMINAL_IRON.slantRad, 1);
      }
    },
  );
});
