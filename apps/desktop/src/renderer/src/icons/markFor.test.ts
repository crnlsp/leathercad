import type { Feature } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { MARKS, markFor } from './markFor.js';

const base = { id: 'f', name: 'F', visible: true, locked: false } as const;
const path = { kind: 'path', path: { closed: true, segments: [] } } as const;

describe('markFor', () => {
  it('names each feature by the line it is, not by its kind alone', () => {
    const outline = { ...base, kind: 'cut-contour', role: 'outer', source: path } as Feature;
    const cutOut = { ...base, kind: 'cut-contour', role: 'inner', source: path } as Feature;
    expect(markFor(outline)).toBe('cut-edge');
    // Opposite ideas — the edge of the piece, and removal from inside it —
    // so they must never share a mark (UI Foundations §8.2).
    expect(markFor(cutOut)).toBe('cut-out');
  });

  it('marks an edge grown outward from its stitching as a seam allowance', () => {
    const allowance = {
      ...base,
      kind: 'cut-contour',
      role: 'outer',
      source: {
        kind: 'derived',
        sourceId: 's',
        op: { type: 'offset', distanceMm: 5, side: 'outward', run: { kind: 'whole' } },
      },
    } as Feature;
    expect(markFor(allowance)).toBe('seam-allowance');
  });

  it('tells a valley fold from a mountain fold', () => {
    const fold = (direction: 'valley' | 'mountain') =>
      ({ ...base, kind: 'fold-line', direction, source: path }) as unknown as Feature;
    expect(markFor(fold('valley'))).toBe('fold-valley');
    expect(markFor(fold('mountain'))).toBe('fold-mountain');
  });

  it('gives every other kind its mark, and a label none of its own', () => {
    const of = (kind: string) => markFor({ ...base, kind, source: path } as unknown as Feature);
    expect(of('stitch-line')).toBe('stitch-line');
    expect(of('stitch-hole-set')).toBe('stitch-holes');
    expect(of('marking-line')).toBe('marking');
    expect(of('hardware-hole')).toBe('hardware-hole');
    expect(of('measurement')).toBe('measurement');
    // Text is a generic thing, set in type: Tier 1, not a leather mark.
    expect(of('text-label')).toBeNull();
  });

  it('knows every mark the spec lists', () => {
    expect([...MARKS].sort()).toEqual(
      [
        'piece',
        'cut-edge',
        'cut-out',
        'stitch-line',
        'stitch-holes',
        'fold-valley',
        'fold-mountain',
        'marking',
        'seam-allowance',
        'mirror-across-fold',
        'hardware-hole',
        'measurement',
      ].sort(),
    );
  });
});
