import {
  DEFAULT_SETTINGS,
  evaluate,
  isCutting,
  type Feature,
  type Project,
} from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { STITCH_HOLE_MARKER_DIAMETER_MM, buildExportScene } from './scene.js';

/** A marking line 100 mm long and five holes along it, 25 mm apart (4.14). */
function strap(radiusMm: number): Project {
  const base = { visible: true, locked: false };
  const features: Feature[] = [
    {
      ...base,
      id: 'mark-1',
      name: 'Marking',
      kind: 'marking-line',
      purpose: 'other',
      source: {
        kind: 'path',
        path: PathOps.polyline(
          [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
          false,
        ),
      },
    },
    {
      ...base,
      id: 'row-1',
      name: 'Row of holes',
      kind: 'hole-row',
      source: {
        kind: 'derived',
        sourceId: 'mark-1',
        op: { type: 'hole-row', pitchMm: 25, radiusMm },
      },
    },
  ];
  return {
    id: 'p',
    name: 'Test',
    settings: DEFAULT_SETTINGS,
    parts: [{ id: 'part-1', name: 'Strap', quantity: 1, features }],
  };
}

const holesOnPaper = (radiusMm: number) =>
  buildExportScene(evaluate(strap(radiusMm)), 'Test').parts[0]!.paths.filter(
    (item) => item.role === 'hardware',
  );

describe('a row of holes on paper (4.14)', () => {
  it('prints each hole at the punch’s true diameter, not a stitch hole’s centre mark', () => {
    const holes = holesOnPaper(3);

    expect(holes).toHaveLength(5);
    for (const { path } of holes) {
      const box = PathOps.bbox(path)!;
      expect(box.maxX - box.minX).toBeCloseTo(6, 9);
      expect(box.maxX - box.minX).not.toBeCloseTo(STITCH_HOLE_MARKER_DIAMETER_MM, 3);
    }
  });

  it('is in a layer a cutting export takes, as a hardware hole is', () => {
    expect(isCutting(holesOnPaper(2)[0]!.role)).toBe(true);
  });

  it('prints the line it sits on as the marking line it is', () => {
    const marks = buildExportScene(evaluate(strap(2)), 'Test').parts[0]!.paths.filter(
      (item) => item.role === 'mark',
    );

    expect(marks).toHaveLength(1);
  });
});
