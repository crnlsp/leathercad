import { EPS_POINT, QUANTUM_MM, quantise } from '@leathercad/core';
import {
  addPart,
  circleShape,
  emptyDocument,
  pathPart,
  rectShape,
  rectanglePart,
  shapePart,
  type Command,
} from '@leathercad/document';
import { evaluate } from '@leathercad/domain';
import { polyline, type Rect, type Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { alignMove, alignmentOverlay, collectAlignTargets, indexTargets } from './align.js';
import { isSpacing, type Face } from './spacing.js';

/**
 * 3.19: a piece moved between neighbours snaps so its gaps are equal, or so it
 * repeats the gap of the pair beside it (smart-guides spec §8). Dyadic numbers
 * — multiples of 1/16 mm — keep sums exact, as in `align.test.ts`.
 */

const TOL = 2;
const on = { toleranceMm: TOL, smartGuides: true } as const;

const dyadic = (lo: number, hi: number) =>
  fc.integer({ min: lo * 16, max: hi * 16 }).map((n) => n / 16);

const STRAIGHT = { low: true, high: true } as const;

/** A rectangle's face, every side straight, spanning y 0–40. */
function face(id: string, order: number, minX: number, maxX: number, y = [0, 40]): Face {
  return {
    featureId: id,
    order,
    box: { minX, maxX, minY: y[0]!, maxY: y[1]! },
    straight: { x: STRAIGHT, y: STRAIGHT },
  };
}

/** The mover, `w` wide, spanning y 10–30, its left side at `x`. */
const mover = (x: number, w: number): Rect => ({ minX: x, maxX: x + w, minY: 10, maxY: 30 });

const at = (b: Rect, raw: Vec2): Rect => ({
  minX: b.minX + raw.x,
  maxX: b.maxX + raw.x,
  minY: b.minY + raw.y,
  maxY: b.maxY + raw.y,
});

/** Two neighbours with room between them for a mover, and how far it is moved past centred. */
const between = fc
  .record({
    left: dyadic(-200, 200),
    leftWidth: dyadic(1, 60),
    // Wider than the reach: a piece no wider than the tolerance can be carried
    // right over a neighbour, and is then neither beside it nor between.
    w: dyadic(2 * TOL, 60),
    room: dyadic(0, 80),
    rightWidth: dyadic(1, 60),
    off: dyadic(-TOL, TOL),
  })
  .map(({ left, leftWidth, w, room, rightWidth, off }) => {
    const l = face('l', 0, left, left + leftWidth);
    const r0 = left + leftWidth + w + room;
    const r = face('r', 1, r0, r0 + rightWidth);
    const centred = left + leftWidth + room / 2;
    // The mover starts far below and is carried up and across to near centred.
    const b = mover(centred - 500, w);
    return { l, r, b, raw: { x: 500 + off, y: 0 } };
  });

/** A pair `gap` apart and a mover carried to `off` past repeating it on the right. */
const repeated = fc
  .record({
    first: dyadic(-200, 200),
    firstWidth: dyadic(1, 60),
    gap: dyadic(0, 40),
    secondWidth: dyadic(1, 60),
    w: dyadic(2 * TOL, 60),
    off: dyadic(-TOL, TOL),
  })
  .map(({ first, firstWidth, gap, secondWidth, w, off }) => {
    const a = face('a', 0, first, first + firstWidth);
    const b0 = first + firstWidth + gap;
    const b = face('b', 1, b0, b0 + secondWidth);
    const box = mover(0, w);
    return { a, b, gap, box, raw: { x: b0 + secondWidth + gap + off, y: 0 } };
  });

describe('equal spacing — smart-guides spec §8', () => {
  it('exact: a piece carried near the middle of two neighbours lands with equal gaps', () => {
    fc.assert(
      fc.property(between, ({ l, r, b, raw }) => {
        const result = alignMove(b, raw, indexTargets([], [l, r]), null, on);
        expect(result.snapped.x?.kind).toBe('equal-spacing');
        const landed = at(b, { x: quantise(result.delta.x), y: 0 });
        const low = landed.minX - l.box.maxX;
        const high = r.box.minX - landed.maxX;
        expect(Math.abs(low - high)).toBeLessThanOrEqual(QUANTUM_MM + EPS_POINT);
      }),
    );
  });

  it('exact: a piece carried near repeating the gap of the pair beside it repeats it', () => {
    fc.assert(
      fc.property(repeated, ({ a, b, gap, box, raw }) => {
        const result = alignMove(box, raw, indexTargets([], [a, b]), null, on);
        expect(result.snapped.x?.kind).toBe('equal-spacing');
        const landed = at(box, { x: quantise(result.delta.x), y: 0 });
        expect(Math.abs(landed.minX - b.box.maxX - gap)).toBeLessThanOrEqual(
          QUANTUM_MM / 2 + EPS_POINT,
        );
      }),
    );
  });

  it('idempotent: spacing an already spaced move gives the same delta', () => {
    fc.assert(
      fc.property(between, ({ l, r, b, raw }) => {
        const indexed = indexTargets([], [l, r]);
        const once = alignMove(b, raw, indexed, null, on);
        expect(alignMove(b, once.delta, indexed, null, on).delta).toEqual(once.delta);
      }),
    );
  });

  it('repeats the gap on the other side too: a piece placed left of a pair', () => {
    const a = face('a', 0, 100, 140);
    const b = face('b', 1, 155, 195);
    // 15 mm left of a, the mover's right side would be at 85: carried to 86.
    const result = alignMove(mover(0, 40), { x: 46, y: 0 }, indexTargets([], [a, b]), null, on);
    expect(result.snapped.x?.kind).toBe('equal-spacing');
    expect(result.delta.x).toBe(45);
  });

  it('works on y as it does on x', () => {
    const below: Face = {
      featureId: 'below',
      order: 0,
      box: { minX: 0, maxX: 40, minY: 0, maxY: 20 },
      straight: { x: STRAIGHT, y: STRAIGHT },
    };
    const above: Face = {
      ...below,
      featureId: 'above',
      order: 1,
      box: { ...below.box, minY: 60, maxY: 80 },
    };
    const b: Rect = { minX: 10, maxX: 30, minY: 0, maxY: 10 };
    // Centred, its bottom is at 35: carried to 36.
    const result = alignMove(b, { x: 0, y: 36 }, indexTargets([], [below, above]), null, on);
    expect(result.snapped.y?.kind).toBe('equal-spacing');
    expect(result.delta.y).toBe(35);
  });

  it('is not offered when a neighbour’s facing side is not straight: its extent is not a face', () => {
    fc.assert(
      fc.property(between, ({ l, r, b, raw }) => {
        const curved: Face = { ...l, straight: { ...l.straight, x: { low: true, high: false } } };
        const result = alignMove(b, raw, indexTargets([], [curved, r]), null, on);
        expect(result.snapped.x).toBeNull();
      }),
    );
  });

  it('is not offered when a neighbour does not overlap the piece on the other axis', () => {
    fc.assert(
      fc.property(between, ({ l, r, b, raw }) => {
        const aside: Face = { ...l, box: { ...l.box, minY: 30, maxY: 70 } };
        const result = alignMove(b, raw, indexTargets([], [aside, r]), null, on);
        expect(result.snapped.x).toBeNull();
      }),
    );
  });

  it('only the nearest neighbour counts: one behind it does not', () => {
    const near = face('near', 0, 40, 60);
    const far = face('far', 1, 0, 20);
    const right = face('right', 2, 120, 140);
    // Between `far` and `right` the mover (20 wide) would sit at 60–80, over
    // `near`; between `near` and `right` at 80–100.
    const result = alignMove(
      mover(0, 20),
      { x: 61, y: 0 },
      indexTargets([], [near, far, right]),
      null,
      on,
    );
    expect(result.snapped.x).toBeNull();
    const centred = alignMove(
      mover(0, 20),
      { x: 81, y: 0 },
      indexTargets([], [near, far, right]),
      null,
      on,
    );
    expect(centred.delta.x).toBe(80);
  });

  it('tolerance: nothing beyond it is caught', () => {
    fc.assert(
      fc.property(
        between,
        dyadic(TOL + 1 / 16, 3 * TOL),
        fc.boolean(),
        ({ l, r, b }, past, left) => {
          const far = { x: 500 + (left ? -past : past), y: 0 };
          const result = alignMove(b, far, indexTargets([], [l, r]), null, on);
          expect(result.snapped.x).toBeNull();
        },
      ),
    );
  });

  it('translation invariant: moving the whole scene moves nothing about the move', () => {
    fc.assert(
      fc.property(between, dyadic(-100, 100), dyadic(-100, 100), ({ l, r, b, raw }, dx, dy) => {
        const v = { x: dx, y: dy };
        const shift = (f: Face): Face => ({ ...f, box: at(f.box, v) });
        const once = alignMove(b, raw, indexTargets([], [l, r]), null, on);
        const moved = alignMove(at(b, v), raw, indexTargets([], [shift(l), shift(r)]), null, on);
        expect(moved.delta).toEqual(once.delta);
      }),
    );
  });

  it('priority: a piece edge within tolerance beats equal spacing', () => {
    const l = face('l', 0, 0, 20);
    const r = face('r', 1, 80, 100);
    // Carried to 41–61, the mover is 1 mm from centred (40–60) and its left
    // side 1 mm from an edge at 42: the edge ranks higher, and wins.
    const edge = {
      kind: 'piece-edge',
      axis: 'x',
      value: 42,
      featureId: 'e',
      order: 2,
      span: null,
    } as const;
    const result = alignMove(mover(0, 20), { x: 41, y: 0 }, indexTargets([edge], [l, r]), null, on);
    expect(result.snapped.x?.kind).toBe('piece-edge');
    expect(result.delta.x).toBe(42);
  });

  it('hysteresis: a caught spacing holds to 1.5 × tolerance', () => {
    const indexed = indexTargets([], [face('l', 0, 0, 20), face('r', 1, 80, 100)]);
    const caught = alignMove(mover(0, 20), { x: 41, y: 0 }, indexed, null, on);
    expect(caught.delta.x).toBe(40);
    // 2.5 mm past: beyond tolerance, within 1.5 × it.
    const held = alignMove(mover(0, 20), { x: 42.5, y: 0 }, indexed, caught.snapped, on);
    expect(held.delta.x).toBe(40);
    const fresh = alignMove(mover(0, 20), { x: 42.5, y: 0 }, indexed, null, on);
    expect(fresh.snapped.x).toBeNull();
    const gone = alignMove(mover(0, 20), { x: 43.5, y: 0 }, indexed, caught.snapped, on);
    expect(gone.snapped.x).toBeNull();
  });

  it('labels both gaps with the same number, drawn in the snap colour', () => {
    const indexed = indexTargets([], [face('l', 0, 0, 20), face('r', 1, 80, 100)]);
    const b = mover(0, 20);
    const result = alignMove(b, { x: 41, y: 0 }, indexed, null, on);
    const caught = result.snapped.x;
    expect(caught !== null && isSpacing(caught)).toBe(true);
    if (caught === null || !isSpacing(caught)) return;
    expect(caught.gapMm).toBe(20);
    expect(caught.gaps.map((g) => [g.from, g.to])).toEqual([
      [20, 40],
      [60, 80],
    ]);
    const words: string[] = [];
    alignmentOverlay(at(b, result.delta), result.snapped, indexed, 4, undefined, (mm) => {
      words.push(`${mm}`);
      return `${mm} mm`;
    });
    expect(words).toEqual(['20', '20']);
  });
});

describe('collectAlignTargets — the faces equal spacing measures from (3.19)', () => {
  function facesOf(commands: Command[], moving: string[]): readonly Face[] {
    let document = emptyDocument('proj');
    for (const command of commands) document = command.apply(document);
    return collectAlignTargets(evaluate(document.project), new Set(moving)).faces;
  }

  it('a rectangle is a face on every side; a disc and a turned panel on none; the mover is none', () => {
    const faces = facesOf(
      [
        addPart(rectanglePart('a', 'a-cut', 'A', rectShape({ x: 0, y: 0 }, 40, 20))),
        addPart(shapePart('disc', 'disc-cut', 'Disc', circleShape({ x: 100, y: 0 }, 10))),
        addPart(
          pathPart(
            'turned',
            'turned-cut',
            'Turned',
            polyline(
              [
                { x: 200, y: 0 },
                { x: 210, y: 10 },
                { x: 200, y: 20 },
                { x: 190, y: 10 },
              ],
              true,
            ),
          ),
        ),
        addPart(rectanglePart('m', 'm-cut', 'M', rectShape({ x: 0, y: 50 }, 10, 10))),
      ],
      ['m-cut'],
    );
    expect(faces.map((f) => f.featureId)).toEqual(['a-cut', 'disc-cut', 'turned-cut']);
    expect(faces[0]!.straight).toEqual({ x: STRAIGHT, y: STRAIGHT });
    for (const curved of faces.slice(1)) {
      expect(curved.straight).toEqual({
        x: { low: false, high: false },
        y: { low: false, high: false },
      });
    }
  });
});
