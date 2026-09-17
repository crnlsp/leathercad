import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, type Feature, type Part, type Project } from './feature.js';
import { lockRefusal, lockedAmong } from './lock.js';

const base = (id: string, name: string, locked = false) => ({
  id,
  name,
  visible: true,
  locked,
});

const outline = (locked = false): Feature => ({
  ...base('cut-1', 'Outline', locked),
  kind: 'cut-contour',
  role: 'outer',
  source: { kind: 'shape', shape: { type: 'circle', centre: { x: 50, y: 50 }, radius: 30 } },
});

const stitchLine = (locked = false): Feature => ({
  ...base('stitch-1', 'Stitch line', locked),
  kind: 'stitch-line',
  source: {
    kind: 'derived',
    sourceId: 'cut-1',
    op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
  },
});

function project(...features: Feature[]): Project {
  const part: Part = { id: 'part-1', name: 'Panel', quantity: 1, features };
  return { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts: [part] };
}

describe('lockRefusal', () => {
  it('refuses a locked feature, naming it', () => {
    const refusal = lockRefusal(project(outline(true), stitchLine()), ['cut-1']);

    expect(refusal).toEqual({
      code: 'FEATURE_LOCKED',
      facts: { featureId: 'cut-1', featureName: 'Outline' },
    });
  });

  it('says nothing about an unlocked one', () => {
    expect(lockRefusal(project(outline(), stitchLine()), ['cut-1'])).toBeNull();
  });

  it('finds the locked one among several', () => {
    const refusal = lockRefusal(project(outline(), stitchLine(true)), ['cut-1', 'stitch-1']);

    expect(refusal?.facts).toMatchObject({ featureId: 'stitch-1' });
  });

  it('names the first in document order, so the message is stable', () => {
    // Two locked features and one message: which one it names must not depend
    // on the order the caller happened to pass the ids in.
    const p = project(outline(true), stitchLine(true));

    expect(lockRefusal(p, ['stitch-1', 'cut-1'])?.facts).toMatchObject({ featureId: 'cut-1' });
    expect(lockRefusal(p, ['cut-1', 'stitch-1'])?.facts).toMatchObject({ featureId: 'cut-1' });
  });

  it('ignores ids that are not in the project', () => {
    expect(lockRefusal(project(outline()), ['nobody'])).toBeNull();
  });

  it('has nothing to refuse for an empty request', () => {
    expect(lockRefusal(project(outline(true)), [])).toBeNull();
  });
});

describe('lockedAmong', () => {
  it('lists the locked features, in document order', () => {
    const locked = lockedAmong(project(outline(true), stitchLine(true)), [
      'stitch-1',
      'cut-1',
      'nobody',
    ]);

    expect(locked.map((f) => f.id)).toEqual(['cut-1', 'stitch-1']);
  });

  it('is empty when nothing asked about is locked', () => {
    expect(lockedAmong(project(outline(), stitchLine()), ['cut-1', 'stitch-1'])).toEqual([]);
  });
});
