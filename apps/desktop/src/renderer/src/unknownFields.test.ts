import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Ulid } from '@leathercad/core';
import {
  DocumentStore,
  deleteFeatures,
  emptyDocument,
  renameFeature,
  setDerivation,
  setFeatureLocked,
  setFeatureVisible,
  setPartName,
  setShape,
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

/** A copy of `value` with one unknown key, as a newer build might have written it. */
const tagged = <T>(value: T): T => ({ ...(value as object), zGeo: 'newer' }) as T;
const has = (value: unknown): boolean => (value as Loose)['zGeo'] === 'newer';

describe('unknown fields on the geometry itself', () => {
  it('survive the ordinary in-place edits: moving, retyping, re-parameterising', () => {
    // The contract (file-format.md §4.3): unknown data is never silently
    // discarded by load, save or an ordinary in-place edit. The source, shape
    // and derivation are kept and changed, not rebuilt, so their unknown
    // fields stay — a move used to rebuild the source and drop them.
    const base = loadProject(new Uint8Array(readFileSync(FIXTURE))).project;
    const newer = {
      ...base,
      parts: base.parts.map((part) => ({
        ...part,
        features: part.features.map((feature) => {
          const source = feature.source as unknown as Loose;
          const extended: Loose = tagged(source);
          if (source['shape'] !== undefined) extended['shape'] = tagged(source['shape']);
          if (source['op'] !== undefined) {
            const op = tagged(source['op'] as Loose);
            if (op['axis'] !== undefined) op['axis'] = tagged(op['axis']);
            extended['op'] = op;
          }
          return { ...feature, source: extended };
        }),
      })),
    } as unknown as Project;

    const opened = loadProject(saveProject(newer, SAVE)).project;
    const store = new DocumentStore(emptyDocument('doc' as Ulid));
    store.reset({ project: opened });
    const find = (id: string) =>
      store
        .getState()
        .document.project.parts.flatMap((p) => p.features)
        .find((f) => f.id === id)!;

    const outline = find('cut-1');
    if (outline.source.kind !== 'shape' || outline.source.shape.type !== 'rect') throw new Error();
    store.dispatch(translateFeatures(['cut-1', 'frozen-1', 'mirror-1'], { x: 5, y: 3 }));
    store.dispatch(setShape('cut-1', { ...outline.source.shape, width: 110 }));
    const stitch = find('stitch-1');
    if (stitch.source.kind !== 'derived' || stitch.source.op.type !== 'offset') throw new Error();
    store.dispatch(setDerivation('stitch-1', { ...stitch.source.op, distanceMm: 4 }));

    const reopened = loadProject(saveProject(store.getState().document.project, SAVE)).project;
    const again = (id: string) =>
      reopened.parts.flatMap((p) => p.features).find((f) => f.id === id)!
        .source as unknown as Loose;

    expect(has(again('cut-1')), 'a moved, retyped shape source').toBe(true);
    expect(has(again('cut-1')['shape']), 'its shape').toBe(true);
    expect(has(again('stitch-1')), 'a re-parameterised derived source').toBe(true);
    expect(has(again('stitch-1')['op']), 'its derivation').toBe(true);
    expect(has(again('frozen-1')), 'a moved drawn path source').toBe(true);
    expect(has(again('mirror-1')), 'a moved counterpart source').toBe(true);
    expect(has(again('mirror-1')['op']), 'its mirror').toBe(true);
    expect(has((again('mirror-1')['op'] as Loose)['axis']), 'its axis').toBe(true);
  });

  it('go with a source that an edit replaces by another kind — the documented exception', () => {
    // Freezing turns a derived stitch line into drawn geometry: its old source
    // is replaced, not changed, and what was attached to it is not carried
    // across. The feature itself keeps its own unknown fields.
    const base = loadProject(new Uint8Array(readFileSync(FIXTURE))).project;
    const newer = {
      ...base,
      parts: base.parts.map((part) => ({
        ...part,
        features: part.features.map((feature) =>
          feature.id === 'stitch-2'
            ? { ...tagged(feature), source: tagged(feature.source) }
            : feature,
        ),
      })),
    } as unknown as Project;

    const store = new DocumentStore(emptyDocument('doc' as Ulid));
    store.reset({ project: loadProject(saveProject(newer, SAVE)).project });
    store.dispatch(deleteFeatures(['cut-2'], 'freeze-dependents'));

    const frozen = loadProject(saveProject(store.getState().document.project, SAVE))
      .project.parts.flatMap((p) => p.features)
      .find((f) => f.id === 'stitch-2')!;
    expect(frozen.source.kind).toBe('path');
    expect(has(frozen), 'the feature keeps its own').toBe(true);
    expect(has(frozen.source), 'the replaced source does not').toBe(false);
  });
});
