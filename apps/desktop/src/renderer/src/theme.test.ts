/// <reference types="node" />
// A test, run by Vitest in Node: it reads the stylesheet from disk. Vite's
// `?raw` would be tidier, but Vitest stubs CSS imports to an empty string, and
// an audit of an empty stylesheet passes everything.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { cssVariables } from '@leathercad/render';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8');

/**
 * The stylesheet's half of the audit that screen and paper agree (F.4).
 *
 * Every token the stylesheet reads comes from `packages/render/src/theme`, the
 * module the canvas and the exporter read — so it cannot drift from them. The
 * only custom properties it may define itself are layout: the frame's column
 * widths, which are about arranging the window rather than how anything looks.
 */
// Comments may name anything, including the colours they explain.
const css = stylesheet.replace(/\/\*[\s\S]*?\*\//g, '');

const THEME = new Set(Object.keys(cssVariables('comfortable')));
const LOCAL = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
const READ = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]!));

describe('the stylesheet reads the theme', () => {
  it('is actually read', () => {
    expect(css.length).toBeGreaterThan(10_000);
  });

  it('reads no token the theme does not define', () => {
    const unknown = [...READ].filter((name) => !THEME.has(name) && !LOCAL.has(name));
    expect(unknown).toEqual([]);
  });

  it('defines no token of its own except the layout it arranges', () => {
    expect([...LOCAL].sort()).toEqual(['--parts-w', '--properties-w', '--rail-w']);
    for (const name of LOCAL) expect(THEME.has(name), name).toBe(false);
  });

  it('writes no colour of its own', () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css.match(/\brgba?\(/g) ?? []).toEqual([]);
  });

  it('uses the three radii and nothing else', () => {
    expect(css.match(/border-radius:\s*\d/g) ?? []).toEqual([]);
  });
});
