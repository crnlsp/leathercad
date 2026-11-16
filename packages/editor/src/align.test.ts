import { EPS_POINT, QUANTUM_MM, quantise } from '@leathercad/core';
import {
  addGuide,
  addPart,
  circleShape,
  emptyDocument,
  rectShape,
  rectanglePart,
  shapePart,
  type Command,
} from '@leathercad/document';
import { evaluate } from '@leathercad/domain';
import type { Rect, Vec2 } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  alignMove,
  collectAlignTargets,
  indexTargets,
  type AlignTarget,
  type AlignTargets,
} from './align.js';

/**
 * 3.16: a moved piece's extent lines up with other pieces' extents and with
 * axis-aligned guides (smart-guides spec §6, the properties of §13).
 *
 * The properties use dyadic numbers — multiples of 1/16 mm — so a sum is exact
 * and a catch decided at one place is decided the same at another: a property
 * about shifting or scaling the scene must not fail on a rounding in the last
 * bit that the leather never sees.
 */

const TOL = 2;
const on = { toleranceMm: TOL, smartGuides: true } as const;

const dyadic = (lo: number, hi: number) =>
  fc.integer({ min: lo * 16, max: hi * 16 }).map((n) => n / 16);

const box = fc
  .record({ x: dyadic(-200, 200), y: dyadic(-200, 200), w: dyadic(1, 120), h: dyadic(1, 120) })
  .map(({ x, y, w, h }): Rect => ({ minX: x, minY: y, maxX: x + w, maxY: y + h }));

const kinds = ['piece-edge', 'piece-centre', 'guide-axis'] as const;

const target = fc.record({
  kind: fc.constantFrom(...kinds),
  axis: fc.constantFrom('x' as const, 'y' as const),
  value: dyadic(-300, 300),
});

/** Targets with their document order, as `collectAlignTargets` numbers them. */
const targets = fc.array(target, { maxLength: 24 }).map((list) =>
  list.map((each, order): AlignTarget => ({
    ...each,
    featureId: `f${order}`,
    order,
    span: [0, 10],
  })),
);

const delta = fc.record({ x: dyadic(-50, 50), y: dyadic(-50, 50) });

const references = (b: Rect, axis: 'x' | 'y'): number[] =>
  axis === 'x' ? [b.minX, (b.minX + b.maxX) / 2, b.maxX] : [b.minY, (b.minY + b.maxY) / 2, b.maxY];

const shift = (b: Rect, v: Vec2): Rect => ({
  minX: b.minX + v.x,
  maxX: b.maxX + v.x,
  minY: b.minY + v.y,
  maxY: b.maxY + v.y,
});

const scale = (b: Rect, s: number): Rect => ({
  minX: b.minX * s,
  maxX: b.maxX * s,
  minY: b.minY * s,
  maxY: b.maxY * s,
});

describe('alignMove — the properties of smart-guides spec §13', () => {
  it('exact: a caught axis puts a reference on its target, within the storage quantum', () => {
    fc.assert(
      fc.property(box, targets, delta, (b, list, raw) => {
        const result = alignMove(b, raw, indexTargets(list), null, on);
        for (const axis of ['x', 'y'] as const) {
          const caught = result.snapped[axis];
          if (caught === null) {
            expect(result.delta[axis]).toBe(raw[axis]);
            continue;
          }
          const committed = quantise(result.delta[axis]);
          const landed = references(b, axis).map((r) => r + committed);
          const miss = Math.min(...landed.map((at) => Math.abs(at - caught.value)));
          expect(miss).toBeLessThanOrEqual(QUANTUM_MM / 2 + EPS_POINT);
        }
      }),
    );
  });

  it('exact: a raw delta within tolerance of a target is caught, and lands on a target', () => {
    fc.assert(
      fc.property(
        box,
        targets.filter((list) => list.length > 0),
        fc.nat(),
        fc.integer({ min: 0, max: 2 }),
        dyadic(-TOL, TOL),
        (b, list, pick, which, off) => {
          const aim = list[pick % list.length]!;
          const raw = { x: 0, y: 0, [aim.axis]: aim.value - references(b, aim.axis)[which]! + off };
          const result = alignMove(b, raw, indexTargets(list), null, on);
          const caught = result.snapped[aim.axis];
          expect(caught).not.toBeNull();
          const values = new Set(list.filter((t) => t.axis === aim.axis).map((t) => t.value));
          const landed = references(b, aim.axis).map((r) => r + result.delta[aim.axis]);
          // Dyadic, so exact.
          expect(landed.some((at) => values.has(at))).toBe(true);
        },
      ),
    );
  });

  it('idempotent: aligning an aligned move gives the same delta', () => {
    // Of one kind: across kinds, the move that lined one reference up can
    // bring another within reach of a higher-ranked target, which then
    // rightly takes over.
    fc.assert(
      fc.property(box, targets, fc.constantFrom(...kinds), delta, (b, mixed, kind, raw) => {
        const indexed = indexTargets(mixed.map((each) => ({ ...each, kind })));
        const once = alignMove(b, raw, indexed, null, on);
        const twice = alignMove(b, once.delta, indexed, null, on);
        expect(twice.delta).toEqual(once.delta);
      }),
    );
  });

  it('tolerance: nothing beyond it is caught', () => {
    fc.assert(
      fc.property(box, targets, delta, (b, list, raw) => {
        const result = alignMove(b, raw, indexTargets(list), null, on);
        for (const axis of ['x', 'y'] as const) {
          const caught = result.snapped[axis];
          if (caught === null) continue;
          const nearest = Math.min(
            ...references(b, axis).map((r) => Math.abs(r + raw[axis] - caught.value)),
          );
          expect(nearest).toBeLessThanOrEqual(TOL);
        }
      }),
    );
  });

  it('tolerance: widening it never loses a catch', () => {
    fc.assert(
      fc.property(box, targets, delta, dyadic(0, 8), (b, list, raw, more) => {
        const indexed = indexTargets(list);
        const narrow = alignMove(b, raw, indexed, null, on);
        const wide = alignMove(b, raw, indexed, null, { ...on, toleranceMm: TOL + more });
        for (const axis of ['x', 'y'] as const) {
          if (narrow.snapped[axis] !== null) expect(wide.snapped[axis]).not.toBeNull();
        }
      }),
    );
  });

  it('translation invariant: moving the whole scene moves every result by it', () => {
    fc.assert(
      fc.property(box, targets, delta, delta, (b, list, raw, v) => {
        const moved = list.map((each) => ({ ...each, value: each.value + v[each.axis] }));
        const here = alignMove(b, raw, indexTargets(list), null, on);
        const there = alignMove(shift(b, v), raw, indexTargets(moved), null, on);
        expect(there.delta).toEqual(here.delta);
        expect(there.snapped.x?.featureId).toBe(here.snapped.x?.featureId);
        expect(there.snapped.y?.featureId).toBe(here.snapped.y?.featureId);
      }),
    );
  });

  it('zoom: the same screen gesture catches the same target at any zoom', () => {
    // At zoom z a pixel is 1/z mm, so the board seen at another zoom is the
    // same scene scaled — tolerance and all. Powers of two keep it exact.
    fc.assert(
      fc.property(box, targets, delta, fc.integer({ min: -4, max: 4 }), (b, list, raw, k) => {
        const s = 2 ** k;
        const scaled = list.map((each) => ({ ...each, value: each.value * s }));
        const here = alignMove(b, raw, indexTargets(list), null, on);
        const there = alignMove(
          scale(b, s),
          { x: raw.x * s, y: raw.y * s },
          indexTargets(scaled),
          null,
          { ...on, toleranceMm: TOL * s },
        );
        expect(there.snapped.x?.featureId).toBe(here.snapped.x?.featureId);
        expect(there.snapped.y?.featureId).toBe(here.snapped.y?.featureId);
        expect(there.delta.x).toBe(here.delta.x * s);
        expect(there.delta.y).toBe(here.delta.y * s);
      }),
    );
  });

  it('priority: within a rank the nearest wins, and ties go by document order whatever the input order', () => {
    fc.assert(
      fc.property(
        box,
        targets.chain((list) =>
          fc.tuple(fc.constant(list), fc.shuffledSubarray(list, { minLength: list.length })),
        ),
        delta,
        (b, [list, shuffled], raw) => {
          const ordered = alignMove(b, raw, indexTargets(list), null, on);
          const mixed = alignMove(b, raw, indexTargets(shuffled), null, on);
          expect(mixed.delta).toEqual(ordered.delta);
          expect(mixed.snapped.x?.featureId).toBe(ordered.snapped.x?.featureId);
          expect(mixed.snapped.y?.featureId).toBe(ordered.snapped.y?.featureId);
        },
      ),
    );
  });

  it('priority: a guide beats a piece edge nearer the reference', () => {
    const b: Rect = { minX: 0, minY: 0, maxX: 40, maxY: 30 };
    const indexed = indexTargets([
      { kind: 'piece-edge', axis: 'x', value: 10.5, featureId: 'edge', order: 0, span: [0, 5] },
      { kind: 'guide-axis', axis: 'x', value: 11.5, guideId: 'g', order: 1, span: null },
    ]);
    const result = alignMove(b, { x: 10, y: 0 }, indexed, null, on);
    expect(result.snapped.x?.guideId).toBe('g');
    expect(result.delta.x).toBe(11.5);
  });

  it('hysteresis: a caught target holds to 1.5 × tolerance, and a higher rank still takes over', () => {
    const b: Rect = { minX: 0, minY: 0, maxX: 40, maxY: 30 };
    const edge: AlignTarget = {
      kind: 'piece-edge',
      axis: 'x',
      value: 100,
      featureId: 'edge',
      order: 0,
      span: [0, 5],
    };
    const indexed = indexTargets([edge]);
    const caught = alignMove(b, { x: 99, y: 0 }, indexed, null, on);
    expect(caught.delta.x).toBe(100);

    // 2.5 mm off: beyond tolerance, within 1.5 × it.
    const held = alignMove(b, { x: 97.5, y: 0 }, indexed, caught.snapped, on);
    expect(held.delta.x).toBe(100);
    expect(alignMove(b, { x: 97.5, y: 0 }, indexed, null, on).delta.x).toBe(97.5);
    expect(alignMove(b, { x: 96.5, y: 0 }, indexed, caught.snapped, on).delta.x).toBe(96.5);

    const guided = indexTargets([
      edge,
      { kind: 'guide-axis', axis: 'x', value: 96, guideId: 'g', order: 1, span: null },
    ]);
    expect(alignMove(b, { x: 97.5, y: 0 }, guided, caught.snapped, on).delta.x).toBe(96);
  });

  it('smart guides off, nothing is caught and nothing measured', () => {
    fc.assert(
      fc.property(box, targets, delta, (b, list, raw) => {
        const result = alignMove(b, raw, indexTargets(list), null, { ...on, smartGuides: false });
        expect(result.delta).toEqual(raw);
        expect(result.measured).toBe(0);
      }),
    );
  });

  it('work bound: a move measures only the targets within reach, not the whole board', () => {
    // 200 pieces 30 mm apart in a row, their bottoms and tops level: 600
    // values an axis would hold. Each reference reaches only what is within
    // 1.5 × tolerance of it, and 200 pieces level at one value are one target,
    // the first in document order, which is the one a tie would choose.
    const list: AlignTarget[] = [];
    for (let i = 0; i < 200; i++) {
      const x = i * 30;
      for (const [kind, value] of [
        ['piece-edge', x],
        ['piece-centre', x + 10],
        ['piece-edge', x + 20],
      ] as const) {
        list.push({
          kind,
          axis: 'x',
          value,
          featureId: `p${i}`,
          order: list.length,
          span: [0, 20],
        });
        list.push({
          kind,
          axis: 'y',
          value: value - x,
          featureId: `p${i}`,
          order: list.length,
          span: [x, x + 20],
        });
      }
    }
    const indexed = indexTargets(list);
    const b: Rect = { minX: 0, minY: 100, maxX: 20, maxY: 120 };
    for (let step = 0; step < 300; step++) {
      const result = alignMove(b, { x: step * 17.3, y: -100 }, indexed, null, on);
      // Three references an axis, each reaching at most one value of the row.
      expect(result.snapped.y).not.toBeNull();
      expect(result.measured).toBeLessThanOrEqual(6);
    }
  });
});

describe('collectAlignTargets — what a moved piece lines up with', () => {
  function targetsOf(commands: Command[], moving: string[]): AlignTargets {
    let document = emptyDocument('proj');
    for (const command of commands) document = command.apply(document);
    return collectAlignTargets(evaluate(document.project), new Set(moving));
  }

  const values = (list: readonly AlignTarget[]) => list.map((each) => [each.kind, each.value]);

  it('a rectangle offers its edges and its centre on both axes; the moving piece offers nothing', () => {
    const found = targetsOf(
      [
        addPart(rectanglePart('a', 'a-cut', 'Outer', rectShape({ x: 0, y: 0 }, 100, 60, 4))),
        addPart(rectanglePart('b', 'b-cut', 'Pocket', rectShape({ x: 200, y: 0 }, 40, 30))),
      ],
      ['b-cut'],
    );
    expect(values(found.x.all)).toEqual([
      ['piece-edge', 0],
      ['piece-centre', 50],
      ['piece-edge', 100],
    ]);
    expect(values(found.y.all)).toEqual([
      ['piece-edge', 0],
      ['piece-centre', 30],
      ['piece-edge', 60],
    ]);
    expect(found.x.all[0]?.featureId).toBe('a-cut');
    expect(found.x.all[0]?.span).toEqual([0, 60]);
  });

  it('a circle and a turned piece offer their centre and no edge: no straight side lies on the extent', () => {
    const found = targetsOf(
      [
        addPart(shapePart('c', 'c-cut', 'Disc', circleShape({ x: 0, y: 0 }, 10))),
        addPart(
          rectanglePart(
            't',
            't-cut',
            'Turned',
            rectShape({ x: 100, y: 0 }, 40, 20, 0, Math.PI / 6),
          ),
        ),
      ],
      [],
    );
    expect(found.x.all.map((each) => each.kind)).toEqual(['piece-centre', 'piece-centre']);
    expect(found.y.all.map((each) => each.kind)).toEqual(['piece-centre', 'piece-centre']);
  });

  it('an axis-aligned guide is a target on its axis; an inclined one is not', () => {
    const found = targetsOf(
      [
        addGuide({ id: 'v', origin: { x: 30, y: 0 }, angleRad: Math.PI / 2 }),
        addGuide({ id: 'h', origin: { x: 0, y: -12 }, angleRad: Math.PI }),
        addGuide({ id: 'd', origin: { x: 0, y: 0 }, angleRad: Math.PI / 4 }),
      ],
      [],
    );
    expect(found.x.all.map((each) => [each.kind, each.value, each.guideId])).toEqual([
      ['guide-axis', 30, 'v'],
    ]);
    expect(found.y.all.map((each) => [each.kind, each.value, each.guideId])).toEqual([
      ['guide-axis', -12, 'h'],
    ]);
  });
});
