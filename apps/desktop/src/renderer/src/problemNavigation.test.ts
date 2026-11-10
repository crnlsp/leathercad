import { problem, problemKey, type Diagnostic } from '@leathercad/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { nextDiagnostic } from './problemNavigation.js';

const emptyPart = (id: number): Diagnostic => ({
  problem: problem('EMPTY_PART', { partId: `part-${id}`, partName: `Part ${id}` }),
  severity: 'info',
  partId: `part-${id}`,
  related: [],
});

describe('walking the problems in their displayed order (9.15)', () => {
  const list = [emptyPart(1), emptyPart(2), emptyPart(3)] as const;

  it('starts at the first or last problem and wraps in both directions', () => {
    expect(nextDiagnostic(list, null, 1)).toBe(list[0]);
    expect(nextDiagnostic(list, null, -1)).toBe(list[2]);
    expect(nextDiagnostic(list, problemKey(list[2].problem), 1)).toBe(list[0]);
    expect(nextDiagnostic(list, problemKey(list[0].problem), -1)).toBe(list[2]);
  });

  it('handles no problems and a current problem that has been fixed', () => {
    for (const direction of [-1, 1] as const) {
      expect(nextDiagnostic([], null, direction)).toBeNull();
      expect(nextDiagnostic(list, 'fixed', direction)).toBe(direction === 1 ? list[0] : list[2]);
    }
  });

  it('visits different problems on the same feature separately', () => {
    const named = { featureId: 'holes', featureName: 'Holes' };
    const problems = [
      {
        problem: problem('HOLES_OVERLAP', { ...named, spacingMm: 2, diameterMm: 3 }),
        severity: 'warning',
        partId: 'part',
        featureId: 'holes',
        related: [],
      },
      {
        problem: problem('HOLE_TOO_CLOSE_TO_EDGE', { ...named, clearanceMm: 0.5, minimumMm: 1.5 }),
        severity: 'warning',
        partId: 'part',
        featureId: 'holes',
        related: [],
      },
    ] as const satisfies readonly Diagnostic[];
    expect(nextDiagnostic(problems, problemKey(problems[0].problem), 1)).toBe(problems[1]);
  });

  it('keeps its place when facts change but the problem identity does not', () => {
    const renamed = {
      ...list[0],
      problem: problem('EMPTY_PART', { partId: 'part-1', partName: 'Renamed' }),
    };
    expect(nextDiagnostic([renamed, ...list.slice(1)], problemKey(list[0].problem), 1)).toBe(
      list[1],
    );
  });

  it('property: a full walk visits every problem once, then wraps, without mutating the list', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 30 }),
        fc.constantFrom(-1 as const, 1 as const),
        (ids, direction) => {
          const diagnostics = ids.map(emptyPart);
          const before = structuredClone(diagnostics);
          let current: string | null = null;
          const visited: string[] = [];
          for (let i = 0; i < diagnostics.length; i++) {
            const next = nextDiagnostic(diagnostics, current, direction);
            if (next === null) throw new Error('A nonempty list must have a next problem');
            current = problemKey(next.problem);
            visited.push(current);
            const forward = nextDiagnostic(diagnostics, current, 1);
            if (forward === null) throw new Error('The next problem is missing');
            expect(nextDiagnostic(diagnostics, problemKey(forward.problem), -1)).toBe(next);
          }
          const expected = diagnostics.map((d) => problemKey(d.problem));
          expect(visited).toEqual(direction === 1 ? expected : expected.toReversed());
          const wrapped = nextDiagnostic(diagnostics, current, direction);
          if (wrapped === null) throw new Error('The wrapped problem is missing');
          expect(problemKey(wrapped.problem)).toBe(visited[0]);
          expect(diagnostics).toEqual(before);
        },
      ),
    );
  });
});
