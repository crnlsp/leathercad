import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Ulid } from '@leathercad/core';
import {
  DocumentStore,
  emptyDocument,
  renameFeature,
  setFeatureLocked,
  setFeatureVisible,
  setPartName,
  translateFeatures,
} from '@leathercad/document';
import type { Project } from '@leathercad/domain';
import { loadProject, saveProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

/**
 * A newer build's fields survive a maker's edits here (slice 5.2).
 *
 * The loader keeps unknown keys; this is where they meet the commands, the
 * way the app does it: open, `store.reset`, edit, save. Every command copies
 * the objects it changes, so a field on the project, a part or a feature rides
 * through — which is the whole point of keeping it on load.
 */

const FIXTURE = resolve(import.meta.dirname, '../../../../../fixtures/format/v9.lcp');
const SAVE = { applicationVersion: '0.0.0', now: () => new Date('2026-09-23T00:00:00.000Z') };

type Loose = Record<string, unknown>;

/** The fixture as a newer build might have written it: three fields this build does not know. */
function fileFromANewerBuild(): Uint8Array {
  const base = loadProject(new Uint8Array(readFileSync(FIXTURE))).project;
  const [part, ...others] = base.parts;
  const [feature, ...rest] = part!.features;
  const newer = {
    ...base,
    zNote: 'from a newer build',
    parts: [{ ...part, zGrain: 90, features: [{ ...feature, zLayer: 'top' }, ...rest] }, ...others],
  } as unknown as Project;
  return saveProject(newer, SAVE);
}

describe('unknown fields through a session of edits', () => {
  it('are still in the file after renaming, hiding, locking and moving', () => {
    const opened = loadProject(fileFromANewerBuild()).project;
    const store = new DocumentStore(emptyDocument('doc' as Ulid));
    store.reset({ project: opened });

    const part = opened.parts[0]!;
    const feature = part.features[0]!;
    store.dispatch(setPartName(part.id, 'Front panel'));
    store.dispatch(renameFeature(feature.id, 'Edge'));
    store.dispatch(setFeatureVisible(feature.id, false));
    store.dispatch(setFeatureLocked(feature.id, true));
    store.dispatch(setFeatureLocked(feature.id, false));
    store.dispatch(translateFeatures([feature.id], { x: 5, y: 0 }));

    const reopened = loadProject(saveProject(store.getState().document.project, SAVE)).project;
    const reopenedPart = reopened.parts[0]!;
    const reopenedFeature = reopenedPart.features[0]!;

    // The edits took…
    expect(reopenedPart.name).toBe('Front panel');
    expect(reopenedFeature.name).toBe('Edge');
    expect(reopenedFeature.visible).toBe(false);
    // …and the newer build's fields came through them.
    expect((reopened as unknown as Loose)['zNote']).toBe('from a newer build');
    expect((reopenedPart as unknown as Loose)['zGrain']).toBe(90);
    expect((reopenedFeature as unknown as Loose)['zLayer']).toBe('top');
  });
});
