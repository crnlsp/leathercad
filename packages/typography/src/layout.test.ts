import { PathOps } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  FONT,
  hasGlyph,
  layoutText,
  missingGlyphs,
  outlinesOf,
  placeText,
  placedText,
  textWidthMm,
} from './index.js';

const boundsOf = (text: string, sizeMm: number) => {
  const paths = outlinesOf(placedText(text, sizeMm, { x: 0, y: 0 }));
  return PathOps.bbox(paths[0]!) === null ? null : unionBounds(paths);
};

function unionBounds(paths: ReturnType<typeof outlinesOf>) {
  const boxes = paths.flatMap((p) => {
    const box = PathOps.bbox(p);
    return box === null ? [] : [box];
  });
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

describe('the declared character set', () => {
  // The defect ADR 0011 exists for: pdf-lib's Helvetica cannot encode these,
  // so a project named with them could not be exported at all.
  it.each(['Przegroda główna', 'Pasek zapięcia', 'Łódź', 'Ćwiek', 'Żabka', 'Źródło'])(
    'covers %s',
    (name) => {
      expect(missingGlyphs(name)).toEqual([]);
    },
  );

  it('covers what a dimension is written with', () => {
    expect(missingGlyphs('105 mm × 75 mm — Ø4 · 45° ±0.5 ≈ ½')).toEqual([]);
  });

  it('does not pretend to cover what it has no glyph for', () => {
    expect(hasGlyph('漢')).toBe(false);
    expect(missingGlyphs('a漢b漢')).toEqual(['漢']);
  });
});

describe('layoutText', () => {
  it('places the first glyph at the start of the run', () => {
    expect(layoutText('mm', 3).glyphs[0]).toMatchObject({ character: 'm', xMm: 0, missing: false });
  });

  it('advances by the glyph width, in millimetres', () => {
    const layout = layoutText('mm', 3);
    const advance = (FONT.glyphs['m']!.advance / FONT.unitsPerEm) * 3;

    expect(layout.glyphs[1]!.xMm).toBeCloseTo(advance, 9);
    expect(layout.widthMm).toBeCloseTo(advance * 2, 9);
  });

  it('kerns, so a pair sits closer than two advances would put it', () => {
    // AV is the textbook pair, and IBM Plex kerns it by -41 units.
    const kerned = textWidthMm('AV', 10);
    const unkerned = textWidthMm('A', 10) + textWidthMm('V', 10);

    expect(kerned).toBeLessThan(unkerned);
    expect(unkerned - kerned).toBeCloseTo((41 / FONT.unitsPerEm) * 10, 9);
  });

  it('measures nothing as nothing', () => {
    const layout = layoutText('', 5);
    expect(layout.glyphs).toEqual([]);
    expect(layout.widthMm).toBe(0);
  });

  it('gives a character it does not have the replacement box, and says so', () => {
    const layout = layoutText('漢', 4);

    expect(layout.missing).toEqual(['漢']);
    expect(layout.glyphs[0]).toMatchObject({ missing: true });
    // Advances by the replacement's width rather than collapsing to nothing,
    // and draws something the user can see.
    expect(layout.widthMm).toBeGreaterThan(0);
    expect(outlinesOf(placedText('漢', 4, { x: 0, y: 0 })).length).toBeGreaterThan(0);
  });

  it('scales linearly with the size asked for', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.5, max: 40, noNaN: true }), (size) => {
        const ratio =
          textWidthMm('Card holder — cut 2', size) / textWidthMm('Card holder — cut 2', 1);
        return Math.abs(ratio - size) < 1e-9;
      }),
    );
  });

  it('is the sum of its advances and kerning', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 24 }), (text) => {
        const layout = layoutText(text, 3.5);
        const last = layout.glyphs[layout.glyphs.length - 1]!;
        return Math.abs(layout.widthMm - (last.xMm + last.advanceMm)) < 1e-9;
      }),
    );
  });

  it('gives the same answer every time, which snapshots depend on', () => {
    expect(layoutText('Przegroda główna', 3)).toEqual(layoutText('Przegroda główna', 3));
  });
});

describe('placeText', () => {
  const layout = layoutText('105 mm', 3);

  it('starts the baseline at the anchor, left-aligned', () => {
    const placed = placeText(layout, { x: 10, y: 20 });
    expect(placed.origin).toEqual({ x: 10, y: 20 });
    expect(placed.glyphs[0]!.at).toEqual({ x: 10, y: 20 });
  });

  it('centres on the anchor', () => {
    const placed = placeText(layout, { x: 10, y: 20 }, { align: 'centre' });
    expect(placed.origin.x).toBeCloseTo(10 - layout.widthMm / 2, 9);
  });

  it('puts the right edge on the anchor', () => {
    const placed = placeText(layout, { x: 10, y: 20 }, { align: 'right' });
    expect(placed.origin.x).toBeCloseTo(10 - layout.widthMm, 9);
  });

  it('hangs from the anchor when the top is asked for', () => {
    // Y is up, so a top-aligned line sits below the anchor.
    const placed = placeText(layout, { x: 0, y: 0 }, { baseline: 'top' });
    expect(placed.origin.y).toBeCloseTo(-layout.ascentMm, 9);
  });

  it('sits on the anchor when the bottom is asked for', () => {
    const placed = placeText(layout, { x: 0, y: 0 }, { baseline: 'bottom' });
    expect(placed.origin.y).toBeCloseTo(layout.descentMm, 9);
  });
});

describe('outlines', () => {
  it('gives a letter with a counter two contours, both closed', () => {
    const paths = outlinesOf(placedText('o', 10, { x: 0, y: 0 }));

    expect(paths).toHaveLength(2);
    expect(paths.every((p) => p.closed)).toBe(true);
  });

  it('draws a capital at the typeface’s cap height', () => {
    const bounds = boundsOf('H', 10)!;
    expect(bounds.maxY).toBeCloseTo((FONT.capHeight / FONT.unitsPerEm) * 10, 6);
    expect(bounds.minY).toBeCloseTo(0, 6);
  });

  it('puts a descender below the baseline', () => {
    expect(boundsOf('p', 10)!.minY).toBeLessThan(0);
  });

  it('has nothing to draw for a space', () => {
    expect(outlinesOf(placedText('   ', 5, { x: 0, y: 0 }))).toEqual([]);
  });

  it('scales the shapes, not just the spacing', () => {
    const small = boundsOf('H', 5)!;
    const large = boundsOf('H', 10)!;

    expect(large.maxY / small.maxY).toBeCloseTo(2, 6);
    expect(large.maxX / small.maxX).toBeCloseTo(2, 6);
  });

  it('draws where it was placed', () => {
    const here = boundsOf('H', 10)!;
    const moved = unionBounds(outlinesOf(placedText('H', 10, { x: 100, y: 50 })));

    expect(moved.minX).toBeCloseTo(here.minX + 100, 6);
    expect(moved.minY).toBeCloseTo(here.minY + 50, 6);
  });

  it('keeps the ink about where the advances say, allowing for overhang', () => {
    // Not "strictly inside the advance width": a glyph may legitimately hang
    // over its own box, and this test found the example — Ł's bar crosses the
    // stem and pokes out to the left. What must hold is that the ink tracks
    // the advances rather than wandering, which is what a placement bug looks
    // like.
    fc.assert(
      fc.property(
        fc.constantFrom('Panel', 'Łódź', '105 mm × 75 mm', 'gjpqy'),
        fc.double({ min: 1, max: 20, noNaN: true }),
        (text, size) => {
          const placed = placedText(text, size, { x: 0, y: 0 });
          const bounds = unionBounds(outlinesOf(placed));
          const slack = size * 0.2;
          return bounds.minX >= -slack && bounds.maxX <= placed.layout.widthMm + slack;
        },
      ),
    );
  });

  it('lets Ł overhang to the left, which is the typeface’s business, not ours', () => {
    const placed = placedText('Ł', 10, { x: 0, y: 0 });
    const bounds = unionBounds(outlinesOf(placed));

    expect(bounds.minX).toBeLessThan(0);
    expect(bounds.minX).toBeGreaterThan(-0.5);
  });
});

describe('rotated text', () => {
  const layout = layoutText('AB', 10);

  it('leaves everything where it was at no rotation', () => {
    expect(placeText(layout, { x: 5, y: 7 }, { rotationRad: 0 })).toEqual(
      placeText(layout, { x: 5, y: 7 }),
    );
  });

  it('turns the run about the anchor the caller gave, not its own left end', () => {
    // A quarter turn counter-clockwise: the run that ran along +X now runs
    // along +Y, and the first glyph stays on the anchor.
    const placed = placeText(layout, { x: 0, y: 0 }, { rotationRad: Math.PI / 2 });

    expect(placed.glyphs[0]!.at.x).toBeCloseTo(0, 9);
    expect(placed.glyphs[0]!.at.y).toBeCloseTo(0, 9);
    expect(placed.glyphs[1]!.at.x).toBeCloseTo(0, 9);
    expect(placed.glyphs[1]!.at.y).toBeCloseTo(layout.glyphs[1]!.xMm, 9);
  });

  it('turns centred text about the anchor, not about its left end', () => {
    const straight = placeText(layout, { x: 20, y: 0 }, { align: 'centre' });
    const turned = placeText(layout, { x: 20, y: 0 }, { align: 'centre', rotationRad: Math.PI });

    // A half turn about the anchor puts the run's start where its end was.
    const endOfStraight = straight.origin.x + layout.widthMm;
    expect(turned.origin.x).toBeCloseTo(endOfStraight, 9);
  });

  it('turns the letters too, not only their positions', () => {
    const upright = outlinesOf(placedText('H', 10, { x: 0, y: 0 }));
    const turned = outlinesOf(
      placeText(layoutText('H', 10), { x: 0, y: 0 }, { rotationRad: Math.PI / 2 }),
    );

    const uprightBox = unionBounds(upright);
    const turnedBox = unionBounds(turned);

    // An upright H is taller than it is wide; turned a quarter, it is wider
    // than it is tall — the glyph itself rotated, not just where it sits.
    expect(uprightBox.maxY - uprightBox.minY).toBeGreaterThan(uprightBox.maxX - uprightBox.minX);
    expect(turnedBox.maxX - turnedBox.minX).toBeGreaterThan(turnedBox.maxY - turnedBox.minY);
  });

  it('keeps the run the same length whatever angle it is at', () => {
    fc.assert(
      fc.property(fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }), (angle) => {
        const placed = placeText(layout, { x: 3, y: 4 }, { rotationRad: angle });
        const first = placed.glyphs[0]!.at;
        const last = placed.glyphs[placed.glyphs.length - 1]!.at;
        const spanned = Math.hypot(last.x - first.x, last.y - first.y);
        return Math.abs(spanned - layout.glyphs[1]!.xMm) < 1e-9;
      }),
    );
  });
});
