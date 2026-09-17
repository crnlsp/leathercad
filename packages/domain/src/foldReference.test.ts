import { PathOps, polyline } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { evaluate } from './evaluate.js';
import { DEFAULT_SETTINGS, type Feature, type Part, type Project } from './feature.js';
import { dependentsOf, graphProblems } from './graph.js';

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

/** A vertical fold at x, from y = 0 to y = 95. */
const fold = (id = 'fold-1', x = 95): Feature => ({
  ...base(id, 'Fold'),
  kind: 'fold-line',
  direction: 'valley',
  source: {
    kind: 'path',
    path: polyline(
      [
        { x, y: 0 },
        { x, y: 95 },
      ],
      false,
    ),
  },
});

/** A bent fold: two segments that do not lie on one line. */
const bentFold = (id = 'fold-1'): Feature => ({
  ...base(id, 'Fold'),
  kind: 'fold-line',
  direction: 'valley',
  source: {
    kind: 'path',
    path: polyline(
      [
        { x: 95, y: 0 },
        { x: 95, y: 40 },
        { x: 120, y: 95 },
      ],
      false,
    ),
  },
});

const slot = (id = 'slot-1', x = 12): Feature => ({
  ...base(id, 'Card slot'),
  kind: 'cut-contour',
  role: 'inner',
  source: {
    kind: 'shape',
    shape: {
      type: 'rect',
      origin: { x, y: 20 },
      width: 70,
      height: 6,
      radii: uniform(3),
      rotation: 0,
    },
  },
});

function uniform(r: number) {
  return { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r };
}

/** A counterpart of `from`, folded about `foldId`. */
const acrossFold = (from: string, id: string, foldId = 'fold-1'): Feature => ({
  ...base(id, 'Card slot mirrored'),
  kind: 'cut-contour',
  role: 'inner',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'mirror', axis: { kind: 'fold', foldId }, glideMm: 0 },
  },
});

function project(...features: Feature[]): Project {
  const part: Part = { id: 'part-1', name: 'Shell', quantity: 1, features };
  return { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts: [part] };
}

const entryOf = (p: Project, id: string) =>
  evaluate(p)
    .parts.flatMap((part) => part.features)
    .find((e) => e.feature.id === id)!;

describe('a mirror that tracks a fold', () => {
  it('reflects its source in the fold', () => {
    const p = project(fold('fold-1', 95), slot('slot-1', 12), acrossFold('slot-1', 'm-1'));
    const entry = entryOf(p, 'm-1');

    if (!entry.ok) throw new Error(entry.problem.code);
    // The slot spans x 12..82; reflected in x = 95 it spans 108..178.
    const box = PathOps.bbox(entry.path)!;
    expect(box.minX).toBeCloseTo(108, 6);
    expect(box.maxX).toBeCloseTo(178, 6);
  });

  it('follows the fold when the fold moves — the point of the slice', () => {
    const near = project(fold('fold-1', 95), slot('slot-1', 12), acrossFold('slot-1', 'm-1'));
    const far = project(fold('fold-1', 120), slot('slot-1', 12), acrossFold('slot-1', 'm-1'));

    const xOf = (p: Project) => {
      const entry = entryOf(p, 'm-1');
      if (!entry.ok) throw new Error(entry.problem.code);
      return PathOps.bbox(entry.path)!.minX;
    };

    // Reflected in 95 the slot starts at 108; reflected in 120 it starts at 158.
    expect(xOf(near)).toBeCloseTo(108, 6);
    expect(xOf(far)).toBeCloseTo(158, 6);
  });

  it('refuses a bent fold rather than picking one of its segments', () => {
    const p = project(bentFold('fold-1'), slot('slot-1'), acrossFold('slot-1', 'm-1'));
    const entry = entryOf(p, 'm-1');

    expect(entry.ok).toBe(false);
    expect(entry.ok === false && entry.problem.code).toBe('FOLD_NOT_STRAIGHT');
  });

  it('accepts a fold drawn as several segments along one crease', () => {
    const straightInThreeClicks: Feature = {
      ...base('fold-1', 'Fold'),
      kind: 'fold-line',
      direction: 'valley',
      source: {
        kind: 'path',
        path: polyline(
          [
            { x: 95, y: 0 },
            { x: 95, y: 40 },
            { x: 95, y: 95 },
          ],
          false,
        ),
      },
    };

    const p = project(straightInThreeClicks, slot('slot-1'), acrossFold('slot-1', 'm-1'));

    expect(entryOf(p, 'm-1').ok).toBe(true);
  });
});

describe('the references edge, where it breaks (S2, S3)', () => {
  it('refuses a mirror whose fold does not exist', () => {
    const p = project(slot('slot-1'), acrossFold('slot-1', 'm-1', 'nobody'));

    const entry = entryOf(p, 'm-1');
    expect(entry.ok === false && entry.problem.code).toBe('MIRROR_FOLD_MISSING');
  });

  it('is refused by the loader’s graph check too, not only at evaluation', () => {
    // S2: every edge resolves. The reference edge is as structural as the
    // derivation one, so a file holding a dangling fold is refused rather than
    // opened and reported.
    const p = project(slot('slot-1'), acrossFold('slot-1', 'm-1', 'nobody'));

    expect(graphProblems(p).map((problem) => problem.code)).toContain('MIRROR_FOLD_MISSING');
  });

  it('says nothing when the fold is there', () => {
    const p = project(fold(), slot('slot-1'), acrossFold('slot-1', 'm-1'));

    expect(graphProblems(p)).toEqual([]);
  });

  it('counts the fold’s dependents, so deleting it shows them', () => {
    // The counterpart depends on the fold through the reference edge. Without
    // this the delete dialog would not mention it and the fold would vanish
    // from under a feature that needs it.
    const p = project(fold(), slot('slot-1'), acrossFold('slot-1', 'm-1'));

    expect(dependentsOf(p, ['fold-1'])).toEqual(['m-1']);
  });

  it('refuses a cycle that runs through a fold reference (S3)', () => {
    // A fold derived from the very counterpart that folds about it. Nothing
    // creates this; the loader must still refuse it rather than recursing.
    const loopedFold: Feature = {
      ...base('fold-1', 'Fold'),
      kind: 'fold-line',
      direction: 'valley',
      source: {
        kind: 'derived',
        sourceId: 'm-1',
        op: {
          type: 'mirror',
          axis: { kind: 'line', origin: { x: 0, y: 0 }, angleRad: 0 },
          glideMm: 0,
        },
      },
    };
    const p = project(loopedFold, slot('slot-1'), acrossFold('slot-1', 'm-1'));

    expect(graphProblems(p).map((problem) => problem.code)).toContain('CYCLE');
  });

  it('does not hang evaluating that cycle', () => {
    const loopedFold: Feature = {
      ...base('fold-1', 'Fold'),
      kind: 'fold-line',
      direction: 'valley',
      source: {
        kind: 'derived',
        sourceId: 'm-1',
        op: {
          type: 'mirror',
          axis: { kind: 'line', origin: { x: 0, y: 0 }, angleRad: 0 },
          glideMm: 0,
        },
      },
    };
    const p = project(loopedFold, slot('slot-1'), acrossFold('slot-1', 'm-1'));

    expect(() => evaluate(p)).not.toThrow();
    expect(entryOf(p, 'm-1').ok).toBe(false);
  });
});
