import { evaluate, type FeatureId, type Project } from '@leathercad/domain';
import { PathOps, RectOps, type Rect } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addCutOut,
  addFoldLine,
  addHardwareHole,
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
  rectShape,
  rectanglePart,
  setFeatureLocked,
  type FlipAxis,
} from './commands.js';
import type { Command, Document } from './document.js';

/**
 * Q28: flipping a piece flips all of it. A 100 × 60 panel at the origin, its
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
    label: 'turn',
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
