import { describe, expect, it } from 'vitest';

import { markerShape } from './marker.js';

describe('markerShape', () => {
  const at = { x: 100, y: 100 };

  it('sets the glyph off the evidence, joined by a short leader', () => {
    const shape = markerShape(at, 'error', 12, 14);
    expect(shape.leader[0]).toEqual(at);
    // Up and to the right, off the line it points at.
    expect(shape.leader[1]).toEqual({ x: 114, y: 86 });
  });

  it('gives each severity a shape of its own — colour is never the only carrier', () => {
    const error = markerShape(at, 'error', 12, 14).glyph;
    const warning = markerShape(at, 'warning', 12, 14).glyph;
    const info = markerShape(at, 'info', 12, 14).glyph;

    expect(error).toMatchObject({ kind: 'triangle', filled: true });
    expect(warning).toMatchObject({ kind: 'triangle', filled: false });
    expect(info).toMatchObject({ kind: 'dot' });
  });

  it('points its triangle up, centred on the end of the leader', () => {
    const glyph = markerShape(at, 'error', 12, 14).glyph;
    if (glyph.kind !== 'triangle') throw new Error('expected a triangle');
    const [apex, right, left] = glyph.points;
    expect(apex.y).toBeLessThan(right.y);
    expect(right.y).toBeCloseTo(left.y, 9);
    expect((right.x + left.x) / 2).toBeCloseTo(114, 9);
  });
});
