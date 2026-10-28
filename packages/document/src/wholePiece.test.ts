import { QUANTUM_MM } from '@leathercad/core';
import { evaluate, type FeatureId, type Project } from '@leathercad/domain';
import { MatOps, PathOps, RectOps, Shapes, type Rect, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addAllowancePart,
  addCutOut,
  addFoldLine,
  addHardwareHole,
  addHoleRow,
  addMarkingLine,
  addPart,
  addStitchHoles,
  addStitchLine,
  addTextLabel,
  emptyDocument,
  flipFeatures,
  flipRefusal,
  mirrorAcrossFold,
  mirrorFeatures,
  pieceScope,
  rectShape,
  rectanglePart,
  scaleFeatures,
  scaleRefusal,
  setFeatureLocked,
  setFeatureVisible,
  setShape,
  transformFeatures,
  transformRefusal,
  translateFeatures,
  type FlipAxis,
} from './commands.js';
import {
  partSelectionOf,
  selectedFeatureIds,
  selectionOf,
  type Command,
  type Document,
} from './document.js';

/**
 * A piece's outline stands for the piece: flipping it (Q28), moving or
 * turning it (Q30) takes all of it. A 100 × 60 panel at the origin, its
 * centre at (50, 30), with a slot near its left edge, the slot's mirror
 * across a fixed line and across a fold, a rivet and a marking near its
 * right, and a label.
 */
function piece(slot = { x: 10, y: 20, width: 20, height: 6 }, foldX = 40, turn = 0): Document {
  let document = emptyDocument('doc');
  const apply = (c: Command): void => {
    document = c.apply(document);
  };
  const line = (x0: number, y0: number, x1: number, y1: number) => ({
    kind: 'path' as const,
    path: PathOps.polyline([
      { x: x0, y: y0 },
      { x: x1, y: y1 },
    ]),
  });

  apply(addPart(rectanglePart('p', 'outline', 'Gusset', rectShape({ x: 0, y: 0 }, 100, 60, 4))));
  apply(addStitchLine('p', 'stitch', 'outline', 3));
  apply(addStitchHoles('p', 'holes', 'stitch'));
  apply(
    addCutOut('p', 'slot', {
      kind: 'shape',
      shape: rectShape({ x: slot.x, y: slot.y }, slot.width, slot.height),
    }),
  );
  apply(mirrorFeatures(['slot'], ['slot-m'], { origin: { x: 0, y: 45 }, angleRad: 0 }));
  apply(addFoldLine('p', 'fold', line(foldX, 0, foldX, 60)));
  apply(mirrorAcrossFold(['slot'], ['slot-f'], 'fold'));
  apply(addHardwareHole('p', 'rivet', { x: 85, y: 45 }, 2));
  apply(addMarkingLine('p', 'mark', line(60, 10, 90, 10)));
  apply(addTextLabel('p', 'label', { x: 5, y: 52 }, 'Left'));
  apply(addTextLabel('p', 'edge', { x: 3, y: 10 }, 'Grain'));
  // Turned, as a label run along an edge is.
  apply({
    label: { action: 'transform' },
    apply: (d) => ({
      project: {
        ...d.project,
        parts: d.project.parts.map((part) => ({
          ...part,
          features: part.features.map((f) =>
            f.id === 'edge' && f.source.kind === 'text'
              ? ({ ...f, source: { ...f.source, rotationRad: turn } } as typeof f)
              : f,
          ),
        })),
      },
    }),
  });
  return document;
}

const GEOMETRY = [
  'outline',
  'stitch',
  'holes',
  'slot',
  'slot-m',
  'slot-f',
  'fold',
  'rivet',
  'mark',
  'label',
  'edge',
];
const EVERYTHING = GEOMETRY as FeatureId[];

function boxes(project: Project): Map<string, Rect> {
  const found = new Map<string, Rect>();
  for (const entry of evaluate(project).parts.flatMap((part) => part.features)) {
    if (!entry.ok) throw new Error(`${entry.feature.id} failed to build`);
    const box = PathOps.bbox(entry.path);
    if (box !== null) found.set(entry.feature.id, box);
  }
  return found;
}

/** A box mirrored about (cx, cy) along one axis. */
function mirrored(box: Rect, axis: FlipAxis, cx: number, cy: number): Rect {
  return axis === 'horizontal'
    ? { minX: 2 * cx - box.maxX, maxX: 2 * cx - box.minX, minY: box.minY, maxY: box.maxY }
    : { minX: box.minX, maxX: box.maxX, minY: 2 * cy - box.maxY, maxY: 2 * cy - box.minY };
}

function expectBoxClose(actual: Rect | undefined, expected: Rect, what: string): void {
  expect(actual, what).toBeDefined();
  for (const side of ['minX', 'maxX', 'minY', 'maxY'] as const) {
    expect(actual![side], `${what} ${side}`).toBeCloseTo(expected[side], 6);
  }
}

const featureIn = (document: Document, id: string) =>
  document.project.parts.flatMap((part) => part.features).find((f) => f.id === id)!;

describe('flipping a piece flips all of it (Q28)', () => {
  it('takes the slot near the left edge to the right edge, with its mirrors, rivet and marking', () => {
    const next = flipFeatures(['outline'], 'horizontal').apply(piece());
    const after = boxes(next.project);

    // Slot 10–30 about the outline's centre, x = 50: now 70–90.
    expectBoxClose(after.get('slot'), { minX: 70, maxX: 90, minY: 20, maxY: 26 }, 'slot');
    expectBoxClose(after.get('rivet'), { minX: 13, maxX: 17, minY: 43, maxY: 47 }, 'rivet');
    expectBoxClose(after.get('mark'), { minX: 10, maxX: 40, minY: 10, maxY: 10 }, 'mark');
    expectBoxClose(after.get('fold'), { minX: 60, maxX: 60, minY: 0, maxY: 60 }, 'fold');
    // And the outline stayed where it was.
    expectBoxClose(after.get('outline'), { minX: 0, maxX: 100, minY: 0, maxY: 60 }, 'outline');
  });

  it('keeps every part of the piece where the mirror of the piece puts it, either way', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<FlipAxis>('horizontal', 'vertical'),
        fc.record({
          x: fc.double({ min: 6, max: 40, noNaN: true }),
          y: fc.double({ min: 6, max: 30, noNaN: true }),
          width: fc.double({ min: 2, max: 20, noNaN: true }),
          height: fc.double({ min: 2, max: 10, noNaN: true }),
        }),
        fc.double({ min: 62, max: 94, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (axis, slot, foldX, turn) => {
          const document = piece(slot, foldX, turn);
          const before = boxes(document.project);

          const after = boxes(flipFeatures(['outline'], axis).apply(document).project);

          for (const id of GEOMETRY) {
            expectBoxClose(after.get(id), mirrored(before.get(id)!, axis, 50, 30), id);
          }
        },
      ),
    );
  });

  it('puts every stitch hole where the mirror puts it, so mating pieces still line up', () => {
    fc.assert(
      fc.property(fc.constantFrom<FlipAxis>('horizontal', 'vertical'), (axis) => {
        const holes = (document: Document) => {
          const entry = evaluate(document.project)
            .parts.flatMap((part) => part.features)
            .find((candidate) => candidate.feature.id === 'holes');
          if (entry?.ok !== true || entry.holes === undefined) throw new Error('no holes');
          return entry.holes.holes.map((hole) => hole.point);
        };
        const document = piece();
        const expected = holes(document).map((p) =>
          axis === 'horizontal' ? { x: 100 - p.x, y: p.y } : { x: p.x, y: 60 - p.y },
        );

        const actual = holes(flipFeatures(['outline'], axis).apply(document));

        expect(actual).toHaveLength(expected.length);
        for (const want of expected) {
          const miss = Math.min(...actual.map((got) => Math.hypot(got.x - want.x, got.y - want.y)));
          expect(miss).toBeLessThan(1e-6);
        }
      }),
    );
  });

  it('gives the piece back when flipped twice', () => {
    fc.assert(
      fc.property(fc.constantFrom<FlipAxis>('horizontal', 'vertical'), (axis) => {
        const document = piece();
        const once = flipFeatures(['outline'], axis).apply(document);
        const twice = boxes(flipFeatures(['outline'], axis).apply(once).project);

        for (const [id, box] of boxes(document.project)) expectBoxClose(twice.get(id), box, id);
      }),
    );
  });

  it('takes a label to its mirrored place still reading forwards, rather than refusing the piece', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<FlipAxis>('horizontal', 'vertical'),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        (axis, turn) => {
          const document = piece(undefined, undefined, turn);
          expect(flipRefusal(document.project, ['outline'], axis)).toBeNull();

          const next = flipFeatures(['outline'], axis).apply(document);

          const was = featureIn(document, 'edge').source;
          const now = featureIn(next, 'edge').source;
          if (was.kind !== 'text' || now.kind !== 'text') throw new Error('not a label');
          expect(now.text).toBe(was.text);
          expect(now.sizeMm).toBe(was.sizeMm);
          // Turned the other way, not mirrored: its tops still face the way
          // the mirror sends them, so a label along an edge still faces out.
          expect(now.rotationRad).toBeCloseTo(-turn, 9);
        },
      ),
    );
  });

  it('still refuses to flip a label on its own, which would read backwards', () => {
    expect(flipRefusal(piece().project, ['label'], 'horizontal')?.code).toBe(
      'TEXT_WOULD_READ_BACKWARDS',
    );
  });

  it('flips a piece picked by its heading exactly as one picked by its outline', () => {
    const document = piece();

    expect(flipFeatures(EVERYTHING, 'vertical').apply(document)).toEqual(
      flipFeatures(['outline'], 'vertical').apply(document),
    );
    expect(flipRefusal(document.project, EVERYTHING, 'vertical')).toBeNull();
  });

  it('refuses the whole piece when anything in it is locked, and says which', () => {
    const document = setFeatureLocked(['rivet'], true).apply(piece());

    expect(flipRefusal(document.project, ['outline'], 'horizontal')).toMatchObject({
      code: 'FEATURE_LOCKED',
      facts: { featureId: 'rivet' },
    });
    expect(flipFeatures(['outline'], 'horizontal').apply(document)).toBe(document);
  });

  it('still flips a cut-out alone, about its own centre, leaving the piece', () => {
    const document = piece();
    const next = flipFeatures(['slot'], 'horizontal').apply(document);

    expect(featureIn(next, 'outline')).toBe(featureIn(document, 'outline'));
    expect(featureIn(next, 'rivet')).toBe(featureIn(document, 'rivet'));
    expectBoxClose(
      boxes(next.project).get('slot'),
      { minX: 10, maxX: 30, minY: 20, maxY: 26 },
      'slot',
    );
  });

  it('flips two pieces about their joint centre, each whole', () => {
    let document = piece();
    document = addPart(
      rectanglePart('q', 'other', 'Back', rectShape({ x: 200, y: 0 }, 100, 60)),
    ).apply(document);
    const before = boxes(document.project);

    const after = boxes(flipFeatures(['outline', 'other'], 'horizontal').apply(document).project);

    // The two outlines span 0–300: the joint centre is x = 150.
    for (const id of [...GEOMETRY, 'other']) {
      expectBoxClose(after.get(id), mirrored(before.get(id)!, 'horizontal', 150, 30), id);
    }
    expect(RectOps.width(after.get('slot')!)).toBeCloseTo(20, 6);
  });
});

const outlineShape = (document: Document) => {
  const source = featureIn(document, 'outline').source;
  if (source.kind !== 'shape') throw new Error('outline is not a shape');
  return source.shape;
};

describe('what a gesture on a selection moves (Q30)', () => {
  it('makes a piece whole from its outline, hidden and label features included', () => {
    const document = setFeatureVisible(['mark'], false).apply(piece());

    const scope = pieceScope(document.project, ['outline']);

    expect(new Set(scope.features)).toEqual(new Set(EVERYTHING));
    expect(scope.about).toEqual(['outline']);
    expect(new Set(scope.labels)).toEqual(new Set(['label', 'edge']));
  });

  it('makes the same piece from a part picked by its heading', () => {
    expect(new Set(pieceScope(piece().project, EVERYTHING).features)).toEqual(new Set(EVERYTHING));
    expect(pieceScope(piece().project, EVERYTHING).about).toEqual(['outline']);
  });

  it('takes a part picked by its heading as every feature in it, for Rotate and the board', () => {
    const project = piece().project;

    expect(new Set(selectedFeatureIds(project, partSelectionOf(['p'])))).toEqual(
      new Set(EVERYTHING),
    );
    expect(selectedFeatureIds(project, selectionOf(['slot', 'rivet']))).toEqual(['slot', 'rivet']);
  });

  it('leaves anything but an outline on its own', () => {
    expect(pieceScope(piece().project, ['slot'])).toEqual({
      features: ['slot'],
      labels: [],
      about: ['slot'],
    });
  });
});

describe('a gesture something refuses changes nothing (Q30)', () => {
  const stretch = MatOps.composeAll(
    MatOps.fromTranslation({ x: -50, y: -30 }),
    MatOps.fromScale(1.5, 1),
    MatOps.fromTranslation({ x: 50, y: 30 }),
  );

  it('stretches nothing rather than leaving the rivet and the labels behind', () => {
    const document = piece();

    expect(transformFeatures(EVERYTHING, stretch).apply(document)).toBe(document);
    expect(transformRefusal(document.project, EVERYTHING, stretch)?.code).toBe(
      'WOULD_BECOME_ELLIPSE',
    );
  });

  it('gives the lock as the reason first, since it refuses the whole gesture', () => {
    const document = setFeatureLocked(['rivet'], true).apply(piece());
    const move = MatOps.fromTranslation({ x: 10, y: 0 });

    expect(transformRefusal(document.project, EVERYTHING, move)).toMatchObject({
      code: 'FEATURE_LOCKED',
      facts: { featureId: 'rivet' },
    });
    expect(transformFeatures(EVERYTHING, move).apply(document)).toBe(document);
  });

  it('says nothing about a piece that can move', () => {
    expect(
      transformRefusal(piece().project, EVERYTHING, MatOps.fromTranslation({ x: 1, y: 2 })),
    ).toBeNull();
  });
});

describe('typing where a piece’s outline is moves or turns the piece (Q30)', () => {
  const motions = fc
    .tuple(
      fc.integer({ min: -180, max: 180 }).map((deg) => (deg * Math.PI) / 180),
      fc.integer({ min: -2000, max: 2000 }).map((i) => i / 10),
      fc.integer({ min: -2000, max: 2000 }).map((i) => i / 10),
    )
    .map(([turn, x, y]) => ({ turn, x, y }));

  it('carries every part of the piece exactly as the outline went, hidden ones too', () => {
    fc.assert(
      fc.property(motions, ({ turn, x, y }) => {
        const document = setFeatureVisible(['mark'], false).apply(piece());
        const before = outlineShape(document);
        if (before.type !== 'rect') throw new Error('expected a rectangle');
        const typed = {
          ...before,
          origin: { x: before.origin.x + x, y: before.origin.y + y },
          rotation: before.rotation + turn,
        };

        const next = setShape('outline', typed).apply(document);

        // The outline holds exactly what was typed…
        expect(outlineShape(next)).toEqual(typed);
        // …and the piece is where turning and moving it by hand puts it.
        const motion = MatOps.composeAll(
          MatOps.fromRotationAround({ x: 50, y: 30 }, turn),
          MatOps.fromTranslation({ x, y }),
        );
        const byHand = boxes(transformFeatures(EVERYTHING, motion).apply(document).project);
        const now = boxes(next.project);
        for (const id of EVERYTHING) expectBoxClose(now.get(id), byHand.get(id)!, id);
        expect(featureIn(next, 'mark').visible).toBe(false);
      }),
    );
  });

  it('resizes the outline alone when its width is typed, which is a reshape, not a move', () => {
    const document = piece();
    const before = outlineShape(document);
    if (before.type !== 'rect') throw new Error('expected a rectangle');

    const next = setShape('outline', { ...before, width: 120 }).apply(document);

    expect(featureIn(next, 'slot')).toBe(featureIn(document, 'slot'));
    expect(featureIn(next, 'rivet')).toBe(featureIn(document, 'rivet'));
  });

  it('refuses the whole move when anything in the piece is locked', () => {
    const document = setFeatureLocked(['slot'], true).apply(piece());
    const before = outlineShape(document);
    if (before.type !== 'rect') throw new Error('expected a rectangle');

    const next = setShape('outline', { ...before, origin: { x: 5, y: 0 } }).apply(document);

    expect(next.project).toBe(document.project);
  });

  it('moves a cut-out typed on its own, and nothing else', () => {
    const document = piece();
    const slot = featureIn(document, 'slot').source;
    if (slot.kind !== 'shape' || slot.shape.type !== 'rect') throw new Error('no slot');

    const next = setShape('slot', { ...slot.shape, origin: { x: 50, y: 20 } }).apply(document);

    expect(featureIn(next, 'outline')).toBe(featureIn(document, 'outline'));
    expect(featureIn(next, 'rivet')).toBe(featureIn(document, 'rivet'));
  });
});

describe('a piece drawn stitch-first moves by its outline too (Q30)', () => {
  it('carries its stitch line, which the outline follows, instead of refusing', () => {
    let document = emptyDocument('doc');
    document = addAllowancePart('a', 'seam', 'edge', {
      kind: 'shape',
      shape: rectShape({ x: 0, y: 0 }, 80, 40),
    }).apply(document);
    document = addCutOut('a', 'hole', {
      kind: 'shape',
      shape: rectShape({ x: 10, y: 10 }, 10, 5),
    }).apply(document);
    const before = boxes(document.project);

    const { features } = pieceScope(document.project, ['edge']);
    const next = translateFeatures(features, { x: 25, y: 0 }).apply(document);

    const after = boxes(next.project);
    for (const id of ['edge', 'seam', 'hole']) {
      const was = before.get(id)!;
      expectBoxClose(after.get(id), { ...was, minX: was.minX + 25, maxX: was.maxX + 25 }, id);
    }
  });
});

describe('scaling a piece by its outline (Q31)', () => {
  const CENTRE = { x: 50, y: 30 };
  /** Where a scale by `factors` about the outline's centre sends a point. */
  const scaled = (factors: Vec2, p: Vec2): Vec2 => ({
    x: CENTRE.x + factors.x * (p.x - CENTRE.x),
    y: CENTRE.y + factors.y * (p.y - CENTRE.y),
  });
  const scaledBox = (factors: Vec2, box: Rect): Rect => {
    const a = scaled(factors, { x: box.minX, y: box.minY });
    const b = scaled(factors, { x: box.maxX, y: box.maxY });
    return {
      minX: Math.min(a.x, b.x),
      maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxY: Math.max(a.y, b.y),
    };
  };
  const scale = (document: Document, factors: Vec2, ids: readonly string[] = ['outline']) =>
    scaleFeatures(ids as FeatureId[], { pivot: CENTRE, factors }).apply(document);
  /** The piece with a row of 4 mm holes punched along its marking. */
  const withRow = (document = piece()) => addHoleRow('p', 'row', 'mark').apply(document);

  /** Growing, shrinking or stretching, but never turning it over. */
  const factors = fc.record({
    x: fc.double({ min: 0.4, max: 3, noNaN: true }),
    y: fc.double({ min: 0.4, max: 3, noNaN: true }),
  });
  const even = fc.double({ min: 0.4, max: 3, noNaN: true }).map((k) => ({ x: k, y: k }));
  const anyScale = fc.oneof(factors, even);

  const radiusOf = (document: Document, id: string): number => {
    const source = featureIn(document, id).source;
    if (source.kind === 'shape' && source.shape.type === 'circle') return source.shape.radius;
    if (source.kind === 'derived' && source.op.type === 'hole-row') return source.op.radiusMm;
    throw new Error(`${id} is not a hole`);
  };
  const centreOf = (box: Rect): Vec2 => RectOps.centre(box);
  const expectNear = (actual: Vec2, expected: Vec2, what: string): void => {
    expect(actual.x, `${what} x`).toBeCloseTo(expected.x, 9);
    expect(actual.y, `${what} y`).toBeCloseTo(expected.y, 9);
  };

  it('keeps a 4 mm rivet hole 4 mm when the piece grows by half again', () => {
    const next = scale(piece(), { x: 1.5, y: 1.5 });

    expect(radiusOf(next, 'rivet')).toBe(2);
    expect(RectOps.width(boxes(next.project).get('rivet')!)).toBeCloseTo(4, 9);
    // And the piece did grow.
    expect(RectOps.width(boxes(next.project).get('outline')!)).toBeCloseTo(150, 9);
  });

  it('keeps every hardware hole and every hole in a row its diameter, however it is scaled', () => {
    fc.assert(
      fc.property(anyScale, (by) => {
        const next = scale(withRow(), by);

        expect(radiusOf(next, 'rivet')).toBe(2);
        expect(radiusOf(next, 'row')).toBe(2);
      }),
    );
  });

  it('puts each thing made to a size where the scale sends its middle', () => {
    fc.assert(
      fc.property(anyScale, (by) => {
        const document = piece();
        const before = boxes(document.project);

        const after = boxes(scale(document, by).project);

        for (const id of ['rivet', 'slot', 'label', 'edge']) {
          const was = before.get(id)!;
          const now = after.get(id)!;
          expectNear(centreOf(now), scaled(by, centreOf(was)), id);
          expect(RectOps.width(now), `${id} width`).toBeCloseTo(RectOps.width(was), 9);
          expect(RectOps.height(now), `${id} height`).toBeCloseTo(RectOps.height(was), 9);
        }
      }),
    );
  });

  it('scales what is drawn by the factor, and keeps the stitching its margin from the edge', () => {
    fc.assert(
      fc.property(anyScale, (by) => {
        const document = piece();
        const before = boxes(document.project);

        const after = boxes(scale(document, by).project);

        for (const id of ['outline', 'fold', 'mark']) {
          expectBoxClose(after.get(id), scaledBox(by, before.get(id)!), id);
        }
        const edge = after.get('outline')!;
        expectBoxClose(
          after.get('stitch'),
          { minX: edge.minX + 3, maxX: edge.maxX - 3, minY: edge.minY + 3, maxY: edge.maxY - 3 },
          'stitch',
        );
      }),
    );
  });

  it('punches the row along the scaled line, from end to end, at the same pitch', () => {
    fc.assert(
      fc.property(anyScale, (by) => {
        const next = scale(withRow(), by);

        const entry = evaluate(next.project)
          .parts.flatMap((part) => part.features)
          .find((candidate) => candidate.feature.id === 'row');
        if (entry?.ok !== true || entry.holes === undefined) throw new Error('no row');
        const holes = entry.holes.holes.map((hole) => hole.point);
        expectNear(holes[0]!, scaled(by, { x: 60, y: 10 }), 'first hole');
        expectNear(holes.at(-1)!, scaled(by, { x: 90, y: 10 }), 'last hole');
        const row = featureIn(next, 'row').source;
        expect(row.kind === 'derived' && row.op.type === 'hole-row' && row.op.pitchMm).toBe(25);
      }),
    );
  });

  it('gives the piece back when scaled by k and then by 1/k', () => {
    fc.assert(
      fc.property(anyScale, (by) => {
        const document = withRow();
        const there = scale(document, by);

        const back = boxes(scale(there, { x: 1 / by.x, y: 1 / by.y }).project);

        for (const [id, box] of boxes(document.project)) {
          const now = back.get(id)!;
          for (const side of ['minX', 'maxX', 'minY', 'maxY'] as const) {
            expect(Math.abs(now[side] - box[side]), `${id} ${side}`).toBeLessThan(QUANTUM_MM);
          }
        }
      }),
    );
  });

  it('refuses the whole scale when anything in the piece is locked, and says which', () => {
    fc.assert(
      fc.property(fc.constantFrom(...EVERYTHING), anyScale, (locked, by) => {
        const document = setFeatureLocked([locked], true).apply(piece());

        expect(scaleRefusal(document.project, ['outline'], { pivot: CENTRE, factors: by })).toEqual(
          { code: 'FEATURE_LOCKED', facts: expect.objectContaining({ featureId: locked }) },
        );
        expect(scale(document, by)).toBe(document);
      }),
    );
  });

  it('keeps a card slot 86 × 54 while the piece around it grows', () => {
    let document = emptyDocument('doc');
    document = addPart(
      rectanglePart('w', 'wallet', 'Wallet', rectShape({ x: 0, y: 0 }, 120, 80)),
    ).apply(document);
    document = addCutOut('w', 'card', {
      kind: 'shape',
      shape: rectShape({ x: 17, y: 13 }, 86, 54),
    }).apply(document);

    const next = scaleFeatures(['wallet'], {
      pivot: { x: 60, y: 40 },
      factors: { x: 1.25, y: 1.25 },
    }).apply(document);

    const card = featureIn(next, 'card').source;
    expect(card.kind === 'shape' && card.shape).toMatchObject({
      type: 'rect',
      width: 86,
      height: 54,
    });
    expect(RectOps.width(boxes(next.project).get('wallet')!)).toBeCloseTo(150, 9);
  });

  it('throws on a factor that is not a number, naming it, rather than drawing nothing', () => {
    expect(() => scale(piece(), { x: Number.NaN, y: 1 })).toThrow(RangeError);
    expect(() => scale(piece(), { x: 1, y: Number.POSITIVE_INFINITY })).toThrow(/scale factors/);
  });

  it('refuses to flatten a piece to nothing, its rivet included', () => {
    const document = piece();
    const flat = { pivot: CENTRE, factors: { x: 0, y: 1 } };

    expect(scaleRefusal(document.project, ['outline'], flat)?.code).toBe('TRANSFORM_FLATTENS');
    expect(scale(document, flat.factors)).toBe(document);
  });

  it('keeps a label its text size', () => {
    const next = scale(piece(), { x: 2, y: 2 });

    const label = featureIn(next, 'label').source;
    expect(label.kind === 'text' && label.sizeMm).toBe(3);
  });

  it('scales a cut-out drawn by hand with the piece, since nothing gave it a size', () => {
    const document = addCutOut('p', 'window', {
      kind: 'path',
      path: Shapes.rect({ x: 40, y: 20 }, 10, 8),
    }).apply(piece());

    const after = boxes(scale(document, { x: 2, y: 2 }).project);

    expectBoxClose(after.get('window'), { minX: 30, maxX: 50, minY: 10, maxY: 26 }, 'window');
  });

  it('stretches a piece with a rivet and labels, the rivet still round', () => {
    const document = piece();
    expect(
      scaleRefusal(document.project, ['outline'], { pivot: CENTRE, factors: { x: 2, y: 1 } }),
    ).toBeNull();

    const next = scale(document, { x: 2, y: 1 });

    expect(featureIn(next, 'rivet').source).toMatchObject({
      shape: { type: 'circle', radius: 2, centre: { x: 120, y: 45 } },
    });
  });

  it('scales a part picked by its heading exactly as one picked by its outline', () => {
    const document = withRow();
    const by = { x: 1.5, y: 0.8 };

    expect(scale(document, by, [...EVERYTHING, 'row'])).toEqual(scale(document, by));
  });

  it('still scales a rivet or a cut-out picked on its own, as before', () => {
    const document = piece();

    const next = scaleFeatures(['rivet'] as FeatureId[], {
      pivot: { x: 85, y: 45 },
      factors: { x: 1.5, y: 1.5 },
    }).apply(document);

    expect(radiusOf(next, 'rivet')).toBeCloseTo(3, 9);
    expect(featureIn(next, 'outline')).toBe(featureIn(document, 'outline'));
  });

  it('still refuses to stretch a turned piece, which would shear its outline', () => {
    const turned = transformFeatures(EVERYTHING, MatOps.fromRotationAround(CENTRE, 0.3)).apply(
      piece(),
    );

    expect(
      scaleRefusal(turned.project, ['outline'], { pivot: CENTRE, factors: { x: 2, y: 1 } })?.code,
    ).toBe('WOULD_SHEAR');
    expect(scale(turned, { x: 2, y: 1 })).toBe(turned);
  });

  it('refuses to turn a piece over by scaling it, which would read its labels backwards', () => {
    const document = piece();

    expect(
      scaleRefusal(document.project, ['outline'], { pivot: CENTRE, factors: { x: -1.5, y: 1 } })
        ?.code,
    ).toBe('TEXT_WOULD_READ_BACKWARDS');
  });

  it('turns over what keeps its size where it stands, when the piece is turned over by a scale', () => {
    let document = emptyDocument('doc');
    document = addPart(
      rectanglePart('p', 'outline', 'Tab', rectShape({ x: 0, y: 0 }, 100, 60)),
    ).apply(document);
    document = addHardwareHole('p', 'rivet', { x: 85, y: 45 }, 2).apply(document);

    const next = scale(document, { x: -1.5, y: 1 });

    expect(featureIn(next, 'rivet').source).toMatchObject({
      shape: { type: 'circle', radius: 2, centre: { x: -2.5, y: 45 } },
    });
  });
});
