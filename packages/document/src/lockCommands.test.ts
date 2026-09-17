import { lockRefusal, type FeatureId, type Project } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import {
  addStitchHoles,
  addStitchLine,
  deleteFeatures,
  deletePart,
  emptyDocument,
  flipFeatures,
  flipRefusal,
  rectShape,
  rectanglePart,
  renameFeature,
  setDerivation,
  setFeatureLocked,
  setFeatureVisible,
  setMarkingPurpose,
  setShape,
  translateFeatures,
  addMarkingLine,
} from './commands.js';
import type { Command, Document } from './document.js';

const PART = 'part-1' as never;
const CUT = 'cut-1' as never;

/** A panel with an outline, a stitch line following it, and holes on that. */
function chain(): Document {
  let document = emptyDocument('proj');
  const apply = (c: Command): void => {
    document = c.apply(document);
  };

  apply({
    label: 'seed',
    apply: (d) => ({
      project: {
        ...d.project,
        parts: [rectanglePart(PART, CUT, 'Panel', rectShape({ x: 0, y: 0 }, 100, 60))],
      },
    }),
  });
  apply(addStitchLine(PART, 'stitch-1' as never, CUT));
  apply(addStitchHoles(PART, 'holes-1' as never, 'stitch-1' as never));
  apply(
    addMarkingLine(PART, 'mark-1' as never, {
      kind: 'shape',
      shape: rectShape({ x: 10, y: 10 }, 20, 20),
    }),
  );
  return document;
}

const lock = (document: Document, id: string): Document =>
  setFeatureLocked(id as FeatureId, true).apply(document);

const featureIn = (project: Project, id: string) =>
  project.parts.flatMap((p) => p.features).find((f) => f.id === id);

describe('a locked feature changes only by being unlocked (S7)', () => {
  /**
   * Every command that edits or removes the thing, against a locked outline.
   * Identity rather than deep equality: an untouched project is literally the
   * same object, so this proves nothing ran rather than that it ran and
   * happened to change nothing.
   */
  const refused: readonly [string, () => Command][] = [
    ['rename', () => renameFeature(CUT, 'Something else')],
    ['reshape', () => setShape(CUT, rectShape({ x: 0, y: 0 }, 999, 999))],
    ['move', () => translateFeatures([CUT], { x: 10, y: 0 })],
    ['flip', () => flipFeatures([CUT], 'horizontal')],
    ['delete', () => deleteFeatures([CUT])],
    ['delete its part', () => deletePart(PART)],
  ];

  for (const [what, make] of refused) {
    it(`refuses to ${what} it, changing nothing`, () => {
      const document = lock(chain(), CUT);

      expect(make().apply(document).project).toBe(document.project);
    });
  }

  it('refuses to re-parameterise a locked derived feature', () => {
    const document = lock(chain(), 'stitch-1');

    const next = setDerivation('stitch-1' as FeatureId, {
      type: 'offset',
      distanceMm: 9,
      side: 'inward',
      run: { kind: 'whole' },
    }).apply(document);

    expect(next.project).toBe(document.project);
  });

  it('refuses to change a locked feature of another kind', () => {
    const document = lock(chain(), 'mark-1');

    expect(setMarkingPurpose('mark-1' as FeatureId, 'skive').apply(document).project).toBe(
      document.project,
    );
  });

  it('says which feature is in the way', () => {
    const document = lock(chain(), CUT);

    expect(lockRefusal(document.project, [CUT])).toEqual({
      code: 'FEATURE_LOCKED',
      facts: { featureId: 'cut-1', featureName: 'Outline' },
    });
  });
});

describe('the lock and the cascade', () => {
  it('refuses a delete whose cascade would take a locked dependent', () => {
    // The outline is free; the stitch line that follows it is pinned down.
    // Deleting the outline would delete or freeze that stitch line, which is
    // a change to a locked feature by another route.
    const document = lock(chain(), 'stitch-1');

    expect(deleteFeatures([CUT], 'delete-dependents').apply(document).project).toBe(
      document.project,
    );
    expect(deleteFeatures([CUT], 'freeze-dependents').apply(document).project).toBe(
      document.project,
    );
  });

  it('allows a delete whose dependents are all free', () => {
    const document = chain();

    const next = deleteFeatures([CUT], 'delete-dependents').apply(document);

    expect(next.project).not.toBe(document.project);
    expect(featureIn(next.project, 'stitch-1')).toBeUndefined();
  });

  it('lets a locked feature keep being followed, and its follower change', () => {
    // Its dependents still follow it; it simply cannot change itself.
    const document = lock(chain(), CUT);

    const next = setDerivation('stitch-1' as FeatureId, {
      type: 'offset',
      distanceMm: 5,
      side: 'inward',
      run: { kind: 'whole' },
    }).apply(document);

    expect(next.project).not.toBe(document.project);
  });
});

describe('what the lock deliberately does not cover', () => {
  it('lets a locked feature be hidden and shown', () => {
    // Lock protects the piece, not the view: you pin the outline down so you
    // cannot nudge it, and still want to hide it to see underneath.
    const document = lock(chain(), CUT);

    const hidden = setFeatureVisible(CUT, false).apply(document);

    expect(featureIn(hidden.project, CUT)?.visible).toBe(false);
    expect(featureIn(hidden.project, CUT)?.locked).toBe(true);
  });

  it('lets a locked feature be unlocked, which is the way out', () => {
    const document = lock(chain(), CUT);

    const freed = setFeatureLocked(CUT, false).apply(document);

    expect(featureIn(freed.project, CUT)?.locked).toBe(false);
    // And then it moves.
    expect(translateFeatures([CUT], { x: 10, y: 0 }).apply(freed).project).not.toBe(freed.project);
  });

  it('leaves everything else in a selection alone rather than moving half of it', () => {
    // A mixed selection is refused whole. Moving the free half would leave the
    // drawing in a state the user did not ask for and cannot see at a glance.
    const document = lock(chain(), CUT);

    expect(
      translateFeatures([CUT, 'mark-1' as FeatureId], { x: 10, y: 0 }).apply(document).project,
    ).toBe(document.project);
  });
});

describe('setFeatureLocked', () => {
  it('locks and unlocks, and says so in the undo menu', () => {
    const document = chain();

    expect(setFeatureLocked(CUT, true).label).toBe('Lock');
    expect(setFeatureLocked(CUT, false).label).toBe('Unlock');
    expect(featureIn(setFeatureLocked(CUT, true).apply(document).project, CUT)?.locked).toBe(true);
  });

  it('is a no-op for a feature that is not there', () => {
    const document = chain();

    expect(setFeatureLocked('nobody' as FeatureId, true).apply(document).project).toBe(
      document.project,
    );
  });
});

describe('the interface asks the same question the command does (ADR 0013)', () => {
  it('gives the lock as the reason a flip is refused', () => {
    // Otherwise the button stays enabled on a locked piece and pressing it
    // does nothing — the silent-refusal shape X1 exists to prevent.
    const document = lock(chain(), CUT);

    expect(flipRefusal(document.project, [CUT], 'horizontal')).toMatchObject({
      code: 'FEATURE_LOCKED',
      facts: { featureId: 'cut-1' },
    });
  });

  it('says nothing about an unlocked piece that can be flipped', () => {
    expect(flipRefusal(chain().project, [CUT], 'horizontal')).toBeNull();
  });
});
