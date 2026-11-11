import { QUANTUM_MM, quantise } from '@leathercad/core';
import {
  MIN_HOLE_EDGE_CLEARANCE_MM,
  SEAM_DRIFT_LIMIT_MM,
  diagnose,
  findFeature,
  problemKey,
  seamVerdict,
  type Diagnostic,
  type Project,
  type Seam,
} from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  addDrawnStitchLine,
  addPart,
  addStitchHoles,
  addStitchLine,
  emptyDocument,
  rectShape,
  shapePart,
  translateFeatures,
} from './commands.js';
import type { Command } from './document.js';
import { fixCommand, fixRefusal, proposeFix, type Fix } from './fixes.js';
import { addSeam } from './seams.js';
import { DocumentStore } from './store.js';

function build(commands: readonly Command[]): Project {
  const store = new DocumentStore(emptyDocument('project'));
  for (const c of commands) store.dispatch(c);
  return store.getState().document.project;
}

const side = (holeSetId: string, stretch: Seam['a']['stretch']) => ({ holeSetId, stretch });

/**
 * The card holder as 1.6 shipped it (fixtures/regressions/card-holder-1.6.lcp):
 * a drawn pocket stitch line whose sides drift 0.61 mm from the outer's.
 */
function cardHolder16(): Project {
  return build([
    addPart(shapePart('outer', 'outer-outline', 'Outer', rectShape({ x: 0, y: 0 }, 105, 70, 4))),
    addStitchLine('outer', 'outer-stitch', 'outer-outline', 3),
    addStitchHoles('outer', 'outer-holes', 'outer-stitch', { pitchMm: 3.85 }),
    addPart(
      shapePart('pocket', 'pocket-outline', 'Pocket', {
        type: 'rect',
        origin: { x: 0, y: -60 },
        width: 105,
        height: 45,
        radii: { bottomLeft: 4, bottomRight: 4, topLeft: 0, topRight: 0 },
        rotation: 0,
      }),
    ),
    addDrawnStitchLine('pocket', 'pocket-stitch', {
      kind: 'path',
      path: PathOps.polyline(
        [
          { x: 3, y: -19 },
          { x: 3, y: -57 },
          { x: 102, y: -57 },
          { x: 102, y: -19 },
        ],
        false,
      ),
    }),
    addStitchHoles('pocket', 'pocket-holes', 'pocket-stitch', { pitchMm: 3.85 }),
    addSeam({
      id: 'left',
      a: side('pocket-holes', { kind: 'between', fromAnchor: 0, toAnchor: 'start' }),
      b: side('outer-holes', { kind: 'from', anchor: 3, toward: 'previous' }),
    }),
    addSeam({
      id: 'bottom',
      a: side('pocket-holes', { kind: 'between', fromAnchor: 0, toAnchor: 1 }),
      b: side('outer-holes', { kind: 'between', fromAnchor: 3, toAnchor: 0 }),
    }),
    addSeam({
      id: 'right',
      a: side('pocket-holes', { kind: 'between', fromAnchor: 1, toAnchor: 'end' }),
      b: side('outer-holes', { kind: 'from', anchor: 0, toward: 'next' }),
    }),
  ]);
}

function seamProblem(project: Project, seamId: string): Diagnostic | undefined {
  return diagnose(project).find(
    (d) => 'seamId' in d.problem.facts && d.problem.facts.seamId === seamId,
  );
}

function offered(project: Project, diagnostic: Diagnostic | undefined): Fix {
  if (diagnostic === undefined) throw new Error('the problem must be listed');
  const fix = proposeFix(project, diagnostic);
  if (fix === null) throw new Error(`a fix must be offered for ${diagnostic.problem.code}`);
  return fix;
}

function applied(project: Project, fix: Fix): Project {
  return fixCommand(fix).apply({ project }).project;
}

/** Every listed warning and error, by identity and severity: what a fix may not add. */
function listed(project: Project): Set<string> {
  return new Set(
    diagnose(project)
      .filter((d) => d.severity !== 'info')
      .map((d) => `${problemKey(d.problem)}|${d.severity}`),
  );
}

/** A straight drawn line of `length` up from (x, 0), with holes at `pitch`. */
function drawnLine(part: string, x: number, length: number, pitchMm: number): Command[] {
  return [
    addPart({ id: part, name: part, quantity: 1, features: [] }),
    addDrawnStitchLine(part, `${part}-line`, {
      kind: 'path',
      path: PathOps.polyline(
        [
          { x, y: 0 },
          { x, y: length },
        ],
        false,
      ),
    }),
    addStitchHoles(part, `${part}-holes`, `${part}-line`, { pitchMm }),
  ];
}

describe('the seam fix: the stitching length that makes both sides walk alike (9.17)', () => {
  it('builds the 1.6 card holder with its 0.61 mm side drift', () => {
    const p = cardHolder16();
    expect(seamVerdict(p, p.seams![0]!)).toMatchObject({
      ok: true,
      countA: 11,
      countB: 11,
      severity: 'warning',
      driftMm: expect.closeTo(0.605414, 5),
    });
  });

  it('offers to shorten the pocket stitching by the drift, and its holes then pair', () => {
    const p = cardHolder16();
    const fix = offered(p, seamProblem(p, 'left'));
    expect(fix).toMatchObject({ kind: 'seam-length', featureId: 'pocket-stitch' });
    expect(fix.kind === 'seam-length' && fix.changeMm).toBeCloseTo(-0.6053, 3);

    const after = applied(p, fix);
    expect(seamVerdict(after, after.seams![0]!)).toMatchObject({
      ok: true,
      countA: 11,
      countB: 11,
      severity: 'info',
    });
    const verdict = seamVerdict(after, after.seams![0]!);
    expect(verdict.ok && verdict.driftMm).toBeLessThanOrEqual(2 * QUANTUM_MM);
    expect(seamProblem(after, 'left')).toBeUndefined();
  });

  it('changes only the stitch line: nothing cut, and no other seam', () => {
    const p = cardHolder16();
    const after = applied(p, offered(p, seamProblem(p, 'left')));
    for (const id of ['outer-outline', 'outer-stitch', 'outer-holes', 'pocket-outline']) {
      expect(findFeature(after, id)?.feature).toBe(findFeature(p, id)?.feature);
    }
    expect(seamVerdict(after, after.seams![1]!)).toEqual(seamVerdict(p, p.seams![1]!));
    expect(seamVerdict(after, after.seams![2]!)).toMatchObject(seamVerdict(p, p.seams![2]!));
  });

  it('fixes both sides in turn, leaving every seam of the card holder paired', () => {
    let p = cardHolder16();
    p = applied(p, offered(p, seamProblem(p, 'left')));
    p = applied(p, offered(p, seamProblem(p, 'right')));
    expect(diagnose(p).filter((d) => d.problem.code.startsWith('SEAM_'))).toEqual([]);
    for (const seam of p.seams!) {
      expect(seamVerdict(p, seam)).toMatchObject({ ok: true, severity: 'info' });
    }
  });

  it('is one undo step, and undoing it restores the very document', () => {
    const p = cardHolder16();
    const store = new DocumentStore({ project: p });
    const fix = offered(p, seamProblem(p, 'left'));
    store.dispatch(fixCommand(fix));
    expect(store.getState().undoLabel).toEqual({ action: 'fix', name: 'Stitch line' });
    store.undo();
    expect(store.getState().document.project).toBe(p);
    expect(store.getState().canUndo).toBe(false);
  });

  it('previews without touching history', () => {
    const p = cardHolder16();
    const store = new DocumentStore({ project: p });
    const fix = offered(p, seamProblem(p, 'left'));
    store.begin(fixCommand(fix).label);
    store.preview(fixCommand(fix));
    expect(seamProblem(store.getState().document.project, 'left')).toBeUndefined();
    store.rollback();
    expect(store.getState().document.project).toBe(p);
    expect(store.getState().canUndo).toBe(false);
  });

  it('refuses once its problem has gone, saying so', () => {
    const p = cardHolder16();
    const fix = offered(p, seamProblem(p, 'left'));
    const after = applied(p, fix);
    expect(fixRefusal(after, fix)).toEqual({
      code: 'FIX_NO_LONGER_APPLIES',
      facts: { why: 'resolved' },
    });
    expect(fixCommand(fix).apply({ project: after }).project).toBe(after);
  });

  it('refuses when the pattern changed since it was offered, saying so', () => {
    const p = cardHolder16();
    const fix = offered(p, seamProblem(p, 'left'));
    const moved = translateFeatures(['pocket-outline', 'pocket-stitch'], { x: 10, y: 0 }).apply({
      project: p,
    }).project;
    expect(seamProblem(moved, 'left')).toBeDefined();
    expect(fixRefusal(moved, fix)).toEqual({
      code: 'FIX_NO_LONGER_APPLIES',
      facts: { why: 'changed' },
    });
    expect(fixCommand(fix).apply({ project: moved }).project).toBe(moved);
  });

  it('applies when only something unrelated changed', () => {
    const p = cardHolder16();
    const fix = offered(p, seamProblem(p, 'left'));
    const renamed = { ...p, name: 'Renamed' };
    expect(fixRefusal(renamed, fix)).toBeNull();
  });

  it('offers nothing when both sides could be shortened: which one is the maker’s choice', () => {
    const p = build([
      ...drawnLine('a', 0, 40, 4),
      ...drawnLine('b', 50, 40.6, 4),
      addSeam({
        id: 'seam',
        a: side('a-holes', { kind: 'between', fromAnchor: 'start', toAnchor: 'end' }),
        b: side('b-holes', { kind: 'between', fromAnchor: 'start', toAnchor: 'end' }),
      }),
    ]);
    expect(seamProblem(p, 'seam')?.problem.code).toBe('SEAM_HOLES_DRIFT');
    expect(proposeFix(p, seamProblem(p, 'seam')!)).toBeNull();
  });

  it('offers nothing when two irons’ spacings cannot be reconciled by length (shrunk: 54.4 mm, 4 and 3.85)', () => {
    const p = build([
      ...drawnLine('a', 0, 54.4, 4),
      ...drawnLine('b', 50, 200, 3.85),
      addSeam({
        id: 'seam',
        a: side('a-holes', { kind: 'between', fromAnchor: 'start', toAnchor: 'end' }),
        b: side('b-holes', { kind: 'from', anchor: 'start', toward: 'next' }),
      }),
    ]);
    // Shortened to pair its last hole, the 4 mm iron's run would round to a gap fewer.
    expect(seamProblem(p, 'seam')?.problem.code).toBe('SEAM_HOLES_DRIFT');
    expect(proposeFix(p, seamProblem(p, 'seam')!)).toBeNull();
  });

  it('offers nothing for different hole counts: which hole to add or drop is the maker’s', () => {
    const p = build([
      ...drawnLine('a', 0, 40, 4),
      ...drawnLine('b', 50, 40, 3.6),
      addSeam({
        id: 'seam',
        a: side('a-holes', { kind: 'between', fromAnchor: 'start', toAnchor: 'end' }),
        b: side('b-holes', { kind: 'from', anchor: 'start', toward: 'next' }),
      }),
    ]);
    expect(seamProblem(p, 'seam')?.problem.code).toBe('SEAM_HOLE_COUNT_MISMATCH');
    expect(proposeFix(p, seamProblem(p, 'seam')!)).toBeNull();
  });

  it('offers nothing when the stitching follows the outline: the cut is the maker’s', () => {
    const p = build([
      addPart(shapePart('outer', 'outer-outline', 'Outer', rectShape({ x: 0, y: 0 }, 105, 70, 4))),
      addStitchLine('outer', 'outer-stitch', 'outer-outline', 3),
      addStitchHoles('outer', 'outer-holes', 'outer-stitch', { pitchMm: 3.85 }),
      addPart(
        shapePart('pocket', 'pocket-outline', 'Pocket', rectShape({ x: 0, y: -60 }, 105, 45, 3)),
      ),
      addStitchLine('pocket', 'pocket-stitch', 'pocket-outline', 3, {
        kind: 'between',
        fromAnchor: 2,
        toAnchor: 1,
      }),
      addStitchHoles('pocket', 'pocket-holes', 'pocket-stitch', { pitchMm: 3.85 }),
      addSeam({
        id: 'left',
        a: side('pocket-holes', { kind: 'between', fromAnchor: 0, toAnchor: 'start' }),
        b: side('outer-holes', { kind: 'from', anchor: 3, toward: 'previous' }),
      }),
    ]);
    expect(seamProblem(p, 'left')?.problem.code).toBe('SEAM_HOLES_DRIFT');
    expect(proposeFix(p, seamProblem(p, 'left')!)).toBeNull();
  });

  it('for any drawn side that drifts from a longer partner punched with the same iron, offers a fix that pairs every hole', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 1500 }).map((n) => n / 10),
        fc.constantFrom(3, 3.38, 3.85, 4),
        (length, pitch) => {
          const p = build([
            ...drawnLine('a', 0, length, pitch),
            ...drawnLine('b', 50, 200, pitch),
            addSeam({
              id: 'seam',
              a: side('a-holes', { kind: 'between', fromAnchor: 'start', toAnchor: 'end' }),
              b: side('b-holes', { kind: 'from', anchor: 'start', toward: 'next' }),
            }),
          ]);
          const problem = seamProblem(p, 'seam');
          fc.pre(problem?.problem.code === 'SEAM_HOLES_DRIFT');
          const after = applied(p, offered(p, problem));
          const verdict = seamVerdict(after, after.seams![0]!);
          expect(verdict).toMatchObject({ ok: true, severity: 'info' });
          expect(verdict.ok && verdict.countA === verdict.countB).toBe(true);
          expect(verdict.ok && verdict.driftMm).toBeLessThanOrEqual(2 * QUANTUM_MM);
        },
      ),
    );
  });

  it('any offered seam fix pairs the holes, moves less than a pitch and lists nothing new', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 1500 }).map((n) => n / 10),
        fc.constantFrom(3, 3.38, 3.85, 4),
        fc.constantFrom(3, 3.38, 3.85, 4),
        (length, pitchA, pitchB) => {
          const p = build([
            ...drawnLine('a', 0, length, pitchA),
            ...drawnLine('b', 50, 200, pitchB),
            addSeam({
              id: 'seam',
              a: side('a-holes', { kind: 'between', fromAnchor: 'start', toAnchor: 'end' }),
              b: side('b-holes', { kind: 'from', anchor: 'start', toward: 'next' }),
            }),
          ]);
          const problem = seamProblem(p, 'seam');
          fc.pre(problem?.problem.code === 'SEAM_HOLES_DRIFT');
          const fix = proposeFix(p, problem!);
          // Two irons whose spacings no whole number of gaps reconciles have no fix.
          if (fix === null) return;
          expect(fixRefusal(p, fix)).toBeNull();
          if (fix.kind !== 'seam-length') throw new Error('a seam is fixed by its length');
          expect(Math.abs(fix.changeMm)).toBeLessThan(pitchA);

          const after = applied(p, fix);
          const verdict = seamVerdict(after, after.seams![0]!);
          expect(verdict).toMatchObject({ ok: true, severity: 'info' });
          if (!verdict.ok) return;
          expect(verdict.countA).toBe(verdict.countB);
          expect(verdict.driftMm).toBeLessThanOrEqual(2 * QUANTUM_MM);
          expect(findFeature(after, 'b-line')?.feature).toBe(findFeature(p, 'b-line')?.feature);
          // Nothing new to warn of: the fix only takes a problem away.
          const before = listed(p);
          for (const entry of listed(after)) expect(before).toContain(entry);
        },
      ),
    );
  });

  it('never offers a fix for a seam already within the drift limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 49 }).map((n) => n / 100),
        (extra) => {
          const p = build([
            ...drawnLine('a', 0, 40, 4),
            ...drawnLine('b', 50, 40 + extra, 4),
            addSeam({
              id: 'seam',
              a: side('a-holes', { kind: 'between', fromAnchor: 'start', toAnchor: 'end' }),
              b: side('b-holes', { kind: 'between', fromAnchor: 'start', toAnchor: 'end' }),
            }),
          ]);
          expect(SEAM_DRIFT_LIMIT_MM).toBe(0.5);
          expect(seamProblem(p, 'seam')).toBeUndefined();
        },
      ),
    );
  });
});

describe('the edge fix: the stitch margin that clears an edge (9.17)', () => {
  function inset(width: number, height: number, radius: number, marginMm: number): Project {
    return build([
      addPart(
        shapePart('panel', 'outline', 'Panel', rectShape({ x: 0, y: 0 }, width, height, radius)),
      ),
      addStitchLine('panel', 'line', 'outline', marginMm),
      addStitchHoles('panel', 'holes', 'line', { pitchMm: 3.85 }),
    ]);
  }
  const tooNear = (p: Project) =>
    diagnose(p).find((d) => d.problem.code === 'HOLE_TOO_CLOSE_TO_EDGE');

  it('a stitch line inset exactly the minimum clears the edge', () => {
    expect(tooNear(inset(100, 60, 4, MIN_HOLE_EDGE_CLEARANCE_MM))).toBeUndefined();
  });

  it('for any panel stitched too near its edge, offers the minimum margin, which clears it', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 40, max: 300 }),
        fc.integer({ min: 30, max: 200 }),
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 2, max: 14 }).map((n) => n / 10),
        (width, height, radius, marginMm) => {
          const p = inset(width, height, radius, marginMm);
          const fix = offered(p, tooNear(p));
          if (fix.kind !== 'edge-margin') throw new Error('an edge is cleared by the margin');
          expect(fix).toMatchObject({ featureId: 'line' });
          expect(fix.marginMm).toBeGreaterThanOrEqual(MIN_HOLE_EDGE_CLEARANCE_MM);
          expect(fix.marginMm).toBeLessThanOrEqual(MIN_HOLE_EDGE_CLEARANCE_MM + QUANTUM_MM);
          expect(quantise(fix.marginMm)).toBe(fix.marginMm);
          const after = applied(p, fix);
          expect(tooNear(after)).toBeUndefined();
          expect(findFeature(after, 'outline')?.feature).toBe(findFeature(p, 'outline')?.feature);
          const before = listed(p);
          for (const entry of listed(after)) expect(before).toContain(entry);
        },
      ),
    );
  });

  it('is offered though the new margin changes how the corners round (shrunk: 45 × 36, r 3, 0.2 mm)', () => {
    const p = inset(45, 36, 3, 0.2);
    const after = applied(p, offered(p, tooNear(p)));
    expect(tooNear(after)).toBeUndefined();
    expect(diagnose(after).map((d) => [d.problem.code, d.severity])).toEqual([
      ['HOLE_SPACING_UNEVEN', 'info'],
    ]);
  });

  it('offers nothing for a drawn stitch line: where it runs is the maker’s drawing', () => {
    const p = build([
      addPart(shapePart('panel', 'outline', 'Panel', rectShape({ x: 0, y: 0 }, 100, 60))),
      addDrawnStitchLine('panel', 'line', {
        kind: 'path',
        path: PathOps.polyline(
          [
            { x: 0.5, y: 10 },
            { x: 0.5, y: 50 },
          ],
          false,
        ),
      }),
      addStitchHoles('panel', 'holes', 'line', { pitchMm: 3.85 }),
    ]);
    expect(proposeFix(p, tooNear(p)!)).toBeNull();
  });
});

describe('fixes and other problems', () => {
  it('offers nothing for a problem with no plainly safe fix', () => {
    const p = build([addPart({ id: 'empty', name: 'Empty', quantity: 1, features: [] })]);
    const d = diagnose(p).find((x) => x.problem.code === 'EMPTY_PART');
    expect(d).toBeDefined();
    expect(proposeFix(p, d!)).toBeNull();
  });
});
