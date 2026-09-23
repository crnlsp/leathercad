import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { FONT_FAMILY } from '@leathercad/typography';
import { describe, expect, it } from 'vitest';

import { DEFAULT_RULER_STYLE } from './canvas2d/grid.js';
import { vendoredFamily } from './canvas2d/backend.js';

/**
 * Nothing this package draws may depend on a font the host happens to have.
 *
 * Two reasons, and the second is the one that bites. **Determinism:** a
 * rendered reference that names `system-ui` is a different picture on every
 * machine, so a snapshot proves nothing. **Fidelity:** the exporters fill every
 * string from the vendored outlines, so a screen path that reaches for a
 * platform font shows the same millimetre value in one face on screen and
 * another on paper — which is the thing this whole layer exists to prevent.
 *
 * Three paths were doing it: the ruler asked for a platform monospace, and both
 * the canvas and SVG backends defaulted overlay text to `system-ui`. That
 * covered the live dimension while drawing, the part captions and the ruler —
 * so most of the numbers on screen were not in the typeface the pattern prints
 * in.
 */

const HERE = resolve(import.meta.dirname);

/** Family names that mean "whatever this machine has". */
const PLATFORM_FAMILIES = [
  'system-ui',
  'ui-monospace',
  'ui-sans-serif',
  'ui-serif',
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI',
  'Helvetica',
  'Arial',
  'JetBrains Mono',
  'monospace',
];

function sourcesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourcesUnder(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

describe('the renderer names one family, and it is the vendored one', () => {
  it.each(sourcesUnder(HERE).map((p) => [relative(HERE, p), p] as const))(
    '%s asks for no platform font',
    (_name, path) => {
      const text = readFileSync(path, 'utf8')
        // Prose may name what was removed and why; code may not ask for it.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

      expect(PLATFORM_FAMILIES.filter((family) => text.includes(family))).toEqual([]);
    },
  );

  it('defaults to the vendored family, quoted for a CSS font shorthand', () => {
    expect(vendoredFamily()).toBe(`"${FONT_FAMILY}", sans-serif`);
    expect(FONT_FAMILY).toBe('IBM Plex Sans');
  });

  it('draws the ruler in it too', () => {
    // The ruler is where a maker checks the millimetre claim on screen. It read
    // in a different face from every other number in the application.
    expect(DEFAULT_RULER_STYLE.fontFamily).toBe(vendoredFamily());
  });
});
