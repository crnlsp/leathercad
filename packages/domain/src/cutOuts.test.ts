import { PathOps, Shapes, uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { evaluate, type ResolvedFeature } from './evaluate.js';
import {
  DEFAULT_SETTINGS,
  type CutContour,
  type Feature,
  type Part,
  type Project,
} from './feature.js';
import { isOnMaterial, materialOf } from './material.js';

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

const panel = (width = 120, height = 80): CutContour => ({
  ...base('cut-1', 'Outline'),
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'shape',
    shape: {
      type: 'rect',
      origin: { x: 0, y: 0 },
      width,
      height,
      radii: uniformRadii(0),
      rotation: 0,
    },
  },
});

/** A round hole in the middle of that panel. */
const cutOut = (radius = 20, centre = { x: 60, y: 40 }): CutContour => ({
  ...base('hole-1', 'Thumb slot'),
  kind: 'cut-contour',
  role: 'inner',
  source: { kind: 'shape', shape: { type: 'circle', centre, radius } },
});

const inset = (from: string, distanceMm = 3.5, id = 'stitch-1'): Feature => ({
  ...base(id, `Stitch ${id}`),
  kind: 'stitch-line',
  source: {
    kind: 'derived',
    sourceId: from,
    op: { type: 'offset', distanceMm, side: 'inward', run: { kind: 'whole' } },
  },
});

function project(...features: Feature[]): Project {
  const part: Part = { id: 'part-1', name: 'Panel', quantity: 1, features };
  return { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts: [part] };
}

const resolvedOf = (p: Project, id: string): ResolvedFeature =>
  evaluate(p)
    .parts.flatMap((part) => part.features)
    .find((entry) => entry.feature.id === id)!;

const pathOf = (p: Project, id: string) => {
  const entry = resolvedOf(p, id);
  if (!entry.ok) throw new Error(`${id} did not resolve`);
  return entry.path;
};

describe('a stitch line round a cut-out (D6)', () => {
  it('runs outside the hole, in the leather, not across the gap', () => {
    // The defect: "inward" was decided by winding, which is right for an
    // outline and backwards for a hole. A 20 mm slot stitched 3.5 mm out has a
    // 23.5 mm stitch line; the old answer was 16.5 mm — inside the hole, where
    // there is nothing to sew.
    const p = project(panel(), cutOut(20), inset('hole-1', 3.5));
    const box = PathOps.bbox(pathOf(p, 'stitch-1'))!;

    expect((box.maxX - box.minX) / 2).toBeCloseTo(23.5, 6);
  });

  it('still runs inside the outline it follows', () => {
    const p = project(panel(120, 80), inset('cut-1', 3.5));
    const box = PathOps.bbox(pathOf(p, 'stitch-1'))!;

    expect(box.maxX - box.minX).toBeCloseTo(120 - 7, 6);
    expect(box.maxY - box.minY).toBeCloseTo(80 - 7, 6);
  });

  it('puts every one of its holes on the leather', () => {
    const p = project(panel(), cutOut(20), inset('hole-1', 3.5), {
      ...base('holes-1', 'Stitch holes'),
      kind: 'stitch-hole-set',
      source: {
        kind: 'derived',
        sourceId: 'stitch-1',
        op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
      },
    });

    const material = materialOf(evaluate(p).parts[0]!);
    const entry = resolvedOf(p, 'holes-1');
    if (!entry.ok || entry.holes === undefined) throw new Error('holes did not resolve');

    expect(entry.holes.holes.length).toBeGreaterThan(20);
    for (const hole of entry.holes.holes) {
      expect(isOnMaterial(material, hole.point)).toBe(true);
    }
  });

  it('never enters the hole, whatever the slot and the inset', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 5, max: 25, noNaN: true }),
        fc.double({ min: 0.5, max: 10, noNaN: true }),
        (radius, distance) => {
          const p = project(panel(), cutOut(radius), inset('hole-1', distance));
          const entry = resolvedOf(p, 'stitch-1');
          if (!entry.ok) return true;

          const hole = Shapes.circle({ x: 60, y: 40 }, radius);
          const box = PathOps.bbox(entry.path)!;
          // Every point of the stitch line is outside the slot: it is a bigger
          // circle about the same centre.
          return (
            (box.maxX - box.minX) / 2 > radius && PathOps.area(entry.path) > PathOps.area(hole)
          );
        },
      ),
    );
  });
});

describe('the material of a part', () => {
  it('is inside the outline and outside the holes', () => {
    const material = materialOf(evaluate(project(panel(), cutOut(20))).parts[0]!);

    expect(isOnMaterial(material, { x: 10, y: 10 })).toBe(true);
    // In the slot.
    expect(isOnMaterial(material, { x: 60, y: 40 })).toBe(false);
    // Off the panel entirely.
    expect(isOnMaterial(material, { x: -5, y: 40 })).toBe(false);
  });

  it('is nothing at all when the part has no outline', () => {
    const material = materialOf(evaluate(project(cutOut(20))).parts[0]!);

    expect(material.outer).toBeNull();
    expect(isOnMaterial(material, { x: 10, y: 10 })).toBe(false);
  });
});
