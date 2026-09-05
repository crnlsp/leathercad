import { PathOps, type Path } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { evaluate, resolvedFeatures } from './evaluate.js';
import type { Feature, MarkingLine, Part, Project } from './feature.js';
import { DEFAULT_SETTINGS } from './feature.js';

function arcFeature(
  centre: { x: number; y: number },
  radius: number,
  startAngle: number,
  sweepAngle: number,
): MarkingLine {
  return {
    id: 'f1',
    kind: 'marking-line',
    purpose: 'alignment',
    name: 'Line',
    visible: true,
    locked: false,
    source: { kind: 'shape', shape: { type: 'arc', centre, radius, startAngle, sweepAngle } },
  };
}

function projectWith(features: Feature[]): Project {
  const part: Part = { id: 'part-1', name: 'Panel', quantity: 1, features };
  return { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts: [part] };
}

function pathOf(feature: Feature): Path {
  const [resolved] = [...resolvedFeatures(evaluate(projectWith([feature])))];
  expect(resolved).toBeDefined();
  return resolved!.path;
}

describe('the arc shape', () => {
  it('evaluates to an open path of one arc segment', () => {
    const path = pathOf(arcFeature({ x: 10, y: 10 }, 20, 0, Math.PI / 2));

    expect(path.closed).toBe(false);
    expect(path.segments).toHaveLength(1);
    expect(path.segments[0]?.kind).toBe('arc');
  });

  it('has the length its parameters describe', () => {
    // A quarter of a 20 mm circle.
    const path = pathOf(arcFeature({ x: 0, y: 0 }, 20, 0, Math.PI / 2));

    expect(PathOps.length(path)).toBeCloseTo((2 * Math.PI * 20) / 4, 6);
  });

  it('keeps radius and sweep through evaluation, for any arc', () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.double({ min: -500, max: 500, noNaN: true }),
          y: fc.double({ min: -500, max: 500, noNaN: true }),
        }),
        fc.double({ min: 0.1, max: 500, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        // Reflex sweeps included: a three-point arc can bulge the long way.
        fc
          .double({ min: -2 * Math.PI, max: 2 * Math.PI, noNaN: true })
          .filter((s) => Math.abs(s) > 1e-3),
        (centre, radius, startAngle, sweepAngle) => {
          const path = pathOf(arcFeature(centre, radius, startAngle, sweepAngle));
          // Arc length is r * |sweep| — the definition, recovered from the
          // evaluated geometry rather than from the record we put in.
          expect(PathOps.length(path)).toBeCloseTo(radius * Math.abs(sweepAngle), 4);
        },
      ),
      { numRuns: 200 },
    );
  });
});
