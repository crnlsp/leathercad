import { evaluate, type Feature, type Part, type Project } from '@leathercad/domain';
import { DEFAULT_SETTINGS } from '@leathercad/domain';
import { uniformRadii } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { anchorNear, anchorPointOf } from './anchorPick.js';

const panel: Feature = {
  id: 'cut-1',
  kind: 'cut-contour',
  role: 'outer',
  name: 'Outline',
  visible: true,
  locked: false,
  source: {
    kind: 'shape',
    shape: {
      type: 'rect',
      origin: { x: 0, y: 0 },
      width: 100,
      height: 60,
      radii: uniformRadii(0),
      rotation: 0,
    },
  },
};

const part: Part = { id: 'p1', name: 'Panel', quantity: 1, features: [panel] };
const project: Project = { id: 'p', name: 'T', settings: DEFAULT_SETTINGS, parts: [part] };
const resolved = evaluate(project);

describe('anchorNear', () => {
  it('finds the corner under the pointer', () => {
    // The rectangle's corners are (100,0) (100,60) (0,60) (0,0).
    expect(anchorNear(resolved, { x: 100, y: 0 }, 3)).toEqual({
      kind: 'anchor',
      featureId: 'cut-1',
      anchor: 0,
    });
  });

  it('finds one a little way off, within tolerance', () => {
    expect(anchorNear(resolved, { x: 99, y: 1 }, 3)?.anchor).toBe(0);
  });

  it('takes the nearest when two are in reach', () => {
    expect(anchorNear(resolved, { x: 100, y: 40 }, 30)?.anchor).toBe(1);
  });

  it('finds nothing out in the open', () => {
    expect(anchorNear(resolved, { x: 50, y: 30 }, 3)).toBeNull();
  });

  it('finds nothing just outside the tolerance', () => {
    expect(anchorNear(resolved, { x: 110, y: 0 }, 3)).toBeNull();
  });

  it('gives the point of a reference back', () => {
    const point = anchorPointOf(resolved, { kind: 'anchor', featureId: 'cut-1', anchor: 2 });

    expect(point?.x).toBeCloseTo(0, 6);
    expect(point?.y).toBeCloseTo(60, 6);
  });

  it('gives nothing for an anchor that is not there', () => {
    expect(anchorPointOf(resolved, { kind: 'anchor', featureId: 'cut-1', anchor: 9 })).toBeNull();
  });
});
