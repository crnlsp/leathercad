import {
  DEFAULT_SETTINGS,
  LAYER_ROLES,
  evaluate,
  type Feature,
  type Part,
  type Project,
} from '@leathercad/domain';
import { uniformRadii } from '@leathercad/geometry';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { buildExportScene, type ExportScene } from './scene.js';

/**
 * What a revision of a project shares with the one before it (PERF-001).
 *
 * The scene is built for every revision the window shows, and history keeps
 * two hundred of them. A part whose geometry did not change prints from the
 * same ink, so a rename costs a caption and not a new circle for every hole.
 */

const base = (id: string) => ({ id, name: id, visible: true, locked: false });

const outline = (width: number): Feature => ({
  ...base('outline'),
  kind: 'cut-contour',
  role: 'outer',
  source: {
    kind: 'shape',
    shape: {
      type: 'rect',
      origin: { x: 0, y: 0 },
      width,
      height: 40,
      radii: uniformRadii(0),
      rotation: 0,
    },
  },
});

const label: Feature = {
  ...base('label'),
  kind: 'text-label',
  source: { kind: 'text', text: 'Glue', at: { x: 5, y: 5 }, sizeMm: 4, rotationRad: 0 },
};

/**
 * Two parts, the second following the first: its stitch line is inset from
 * the panel's outline — a seam spanning two pieces — and its holes sit on it.
 * Moving the outline moves them, with the second part's features untouched.
 */
function seam(width = 80): Project {
  const panel: Part = {
    id: 'panel',
    name: 'Panel',
    quantity: 1,
    features: [outline(width), label],
  };
  const welt: Part = {
    id: 'welt',
    name: 'Welt',
    quantity: 1,
    features: [
      {
        ...base('stitch'),
        kind: 'stitch-line',
        source: {
          kind: 'derived',
          sourceId: 'outline',
          op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
        },
      },
      {
        ...base('holes'),
        kind: 'stitch-hole-set',
        source: {
          kind: 'derived',
          sourceId: 'stitch',
          op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'hole-at-corner' },
        },
      },
    ],
  };
  return { id: 'p', name: 'Seam', settings: DEFAULT_SETTINGS, parts: [panel, welt] };
}

/** One part edited as a command edits it: the rest of the project shared. */
function withPart(project: Project, id: string, edit: (part: Part) => Part): Project {
  return { ...project, parts: project.parts.map((part) => (part.id === id ? edit(part) : part)) };
}

const renamed = (project: Project, id: string, name: string): Project =>
  withPart(project, id, (part) => ({ ...part, name }));

const resized = (project: Project, width: number): Project =>
  withPart(project, 'panel', (part) => ({
    ...part,
    features: part.features.map((feature) => (feature.id === 'outline' ? outline(width) : feature)),
  }));

const sceneOf = (project: Project, roles = LAYER_ROLES): ExportScene =>
  buildExportScene(evaluate(project), project.name, roles);

const captionOf = (scene: ExportScene, id: string): string | undefined =>
  scene.parts.find((part) => part.id === id)?.texts.find((text) => text.role === 'annotation')
    ?.source;

describe('a revision shares what it did not change (PERF-001)', () => {
  it('prints a renamed part from the same paths, under its new name', () => {
    const before = seam();
    const after = renamed(before, 'welt', 'Gusset');

    const [panelBefore, weltBefore] = sceneOf(before).parts;
    const [panelAfter, weltAfter] = sceneOf(after).parts;

    expect(panelAfter).toBe(panelBefore);
    expect(weltAfter!.paths).toBe(weltBefore!.paths);
    expect(captionOf(sceneOf(after), 'welt')).toBe('Gusset');
  });

  it('prints the old name again when the rename is undone', () => {
    const before = seam();
    sceneOf(renamed(before, 'welt', 'Gusset'));

    expect(captionOf(sceneOf(before), 'welt')).toBe('Welt');
  });

  it("redraws a part whose stitch line follows another part's outline when that outline moves", () => {
    const before = seam(80);
    const after = resized(before, 120);
    // The welt's features are the same objects in both: only its geometry moved.
    expect(after.parts[1]!.features).toBe(before.parts[1]!.features);

    const weltBefore = sceneOf(before).parts[1]!;
    const weltAfter = sceneOf(after).parts[1]!;

    expect(weltAfter.paths).not.toBe(weltBefore.paths);
    expect(weltAfter.boundsMm.maxX).toBeGreaterThan(weltBefore.boundsMm.maxX + 39);
  });

  it('builds after any run of edits the scene a project sharing nothing builds', () => {
    type Edit =
      | { readonly kind: 'rename'; readonly id: string; readonly name: string }
      | { readonly kind: 'quantity'; readonly id: string; readonly quantity: number }
      | { readonly kind: 'resize'; readonly width: number }
      | { readonly kind: 'hide-holes'; readonly hidden: boolean };
    const arbId = fc.constantFrom('panel', 'welt');
    const arbEdit: fc.Arbitrary<Edit> = fc.oneof(
      fc.record({
        kind: fc.constant('rename' as const),
        id: arbId,
        name: fc.constantFrom('', 'Welt', 'Gusset', 'Panel'),
      }),
      fc.record({
        kind: fc.constant('quantity' as const),
        id: arbId,
        quantity: fc.integer({ min: 1, max: 3 }),
      }),
      fc.record({ kind: fc.constant('resize' as const), width: fc.integer({ min: 20, max: 160 }) }),
      fc.record({ kind: fc.constant('hide-holes' as const), hidden: fc.boolean() }),
    );
    const apply = (project: Project, edit: Edit): Project => {
      switch (edit.kind) {
        case 'rename':
          return renamed(project, edit.id, edit.name);
        case 'quantity':
          return withPart(project, edit.id, (part) => ({ ...part, quantity: edit.quantity }));
        case 'resize':
          return resized(project, edit.width);
        case 'hide-holes':
          return withPart(project, 'welt', (part) => ({
            ...part,
            features: part.features.map((feature) =>
              feature.id === 'holes' ? { ...feature, visible: !edit.hidden } : feature,
            ),
          }));
      }
    };

    fc.assert(
      fc.property(
        fc.array(fc.tuple(arbEdit, fc.subarray([...LAYER_ROLES])), { minLength: 1, maxLength: 8 }),
        (steps) => {
          let project = seam();
          sceneOf(project);
          for (const [edit, roles] of steps) {
            project = apply(project, edit);
            // Built warm, from whatever the revisions before left behind,
            // against a copy that shares no object with any of them.
            expect(sceneOf(project, roles)).toEqual(sceneOf(structuredClone(project), roles));
            expect(sceneOf(project)).toEqual(sceneOf(structuredClone(project)));
          }
        },
      ),
    );
  });
});
