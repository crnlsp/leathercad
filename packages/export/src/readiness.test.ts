import {
  DEFAULT_SETTINGS,
  evaluate,
  exportReadiness,
  type Feature,
  type Project,
} from '@leathercad/domain';
import { uniformRadii } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { buildExportScene } from './scene.js';

/**
 * `exportReadiness.omitted` is only worth anything if it names what the
 * exporter actually leaves out. Asserting that here, against the scene builder
 * itself, rather than against a second copy of its filter — which would agree
 * with the first copy and with nothing else.
 */

const base = (id: string, name: string) => ({ id, name, visible: true, locked: false });

const panel = (): Feature => ({
  ...base('cut-1', 'Outline'),
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'shape',
    shape: {
      type: 'rect',
      origin: { x: 0, y: 0 },
      width: 105,
      height: 75,
      radii: uniformRadii(0),
      rotation: 0,
    },
  },
});

const stitchLine = (insetMm: number): Feature => ({
  ...base('stitch-1', 'Stitch line'),
  kind: 'stitch-line',
  source: {
    kind: 'derived',
    sourceId: 'cut-1',
    op: { type: 'offset', distanceMm: insetMm, side: 'inward', run: { kind: 'whole' } },
  },
});

function project(features: Feature[]): Project {
  return {
    id: 'proj',
    name: 'Test',
    settings: DEFAULT_SETTINGS,
    parts: [{ id: 'part-0', name: 'Panel', quantity: 1, features }],
  };
}

const pathCount = (p: Project): number =>
  buildExportScene(evaluate(p), 'Test').parts.flatMap((part) => part.paths).length;

describe('what the warning says is missing is what is missing', () => {
  it('names a feature the paper does not have, and stops naming it once it does', () => {
    const broken = project([panel(), stitchLine(60)]);
    const fixed = project([panel(), stitchLine(3.5)]);

    // Same features both times; the only difference is whether the inset fits.
    expect(exportReadiness(broken).omitted.map((o) => o.featureId)).toEqual(['stitch-1']);
    expect(exportReadiness(fixed).omitted).toEqual([]);

    // And the paper gains exactly the line the warning stopped naming.
    expect(pathCount(broken)).toBe(1);
    expect(pathCount(fixed)).toBe(2);
  });

  it('does not name a hidden feature, which the paper also does not have', () => {
    // The difference that matters: hiding is a choice the maker made and can
    // see. Failing is not.
    const hidden = project([panel(), { ...stitchLine(3.5), visible: false }]);

    expect(exportReadiness(hidden).omitted).toEqual([]);
    expect(pathCount(hidden)).toBe(1);
  });
});
