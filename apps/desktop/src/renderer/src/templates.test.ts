import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  addFoldLine,
  addHardwareHole,
  addPart,
  addSeam,
  addStitchHoles,
  addStitchLine,
  emptyDocument,
  mirrorAcrossFold,
  rectShape,
  setPartQuantity,
  setProjectName,
  shapePart,
  setShape,
  translateFeatures,
  type Command,
} from '@leathercad/document';
import { diagnose, evaluate, exportReadiness, seamVerdict, type Project } from '@leathercad/domain';
import { EPS_LENGTH } from '@leathercad/core';
import fc from 'fast-check';
import { PathOps, type Path, type Vec2 } from '@leathercad/geometry';
import { loadProject, saveProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { BUILT_IN_TEMPLATES } from './templates.js';

/**
 * The templates that ship with the app (8.12), beside the sample wallet: each
 * built here with the app's own commands and written by its own serialiser,
 * so each is a file the app could have saved. Regenerate with
 * `UPDATE_FIXTURES=1 pnpm vitest run apps/desktop/src/renderer/src/templates.test.ts`.
 */

const FIXTURES = resolve(import.meta.dirname, '../../../../../fixtures/projects');
const SAVE = { applicationVersion: '0.0.0', now: () => new Date('2026-10-23T00:00:00.000Z') };

const at = (x: number, y: number): Vec2 => ({ x, y });
const line = (points: Vec2[]): Path => PathOps.polyline(points, false);

function build(id: string, commands: Command[]): Project {
  return commands.reduce((document, command) => command.apply(document), emptyDocument(id)).project;
}

/**
 * A card holder: a 105 × 70 outer stitched all round, and a pocket for each
 * face, cut twice, stitched on its three sewn sides and open at the top.
 * The proposed construction and rounded top corners are audited in docs/template-audit.md.
 */
export function cardHolder(): Project {
  return build('template-card-holder', [
    setProjectName('Card holder'),
    addPart(shapePart('outer', 'outer-outline', 'Outer', rectShape(at(0, 0), 105, 70, 4))),
    addStitchLine('outer', 'outer-stitch', 'outer-outline', 3),
    addStitchHoles('outer', 'outer-holes', 'outer-stitch'),
    addPart(
      shapePart('pocket', 'pocket-outline', 'Pocket', {
        // Eleven outer-side gaps; round upward so the last outer hole is inside the seam.
        ...rectShape(at(0, -60), 105, 47.3487),
        radii: { bottomLeft: 4, bottomRight: 4, topRight: 3, topLeft: 3 },
      }),
    ),
    addStitchLine('pocket', 'pocket-stitch', 'pocket-outline', 3, {
      kind: 'between',
      fromAnchor: 2,
      toAnchor: 1,
    }),
    addStitchHoles('pocket', 'pocket-holes', 'pocket-stitch'),
    setPartQuantity('pocket', 2),
    addSeam({
      id: 'pocket-left-seam',
      a: {
        holeSetId: 'pocket-holes',
        stretch: { kind: 'between', fromAnchor: 3, toAnchor: 'start' },
      },
      b: { holeSetId: 'outer-holes', stretch: { kind: 'from', anchor: 3, toward: 'previous' } },
    }),
    addSeam({
      id: 'pocket-bottom-seam',
      a: { holeSetId: 'pocket-holes', stretch: { kind: 'between', fromAnchor: 3, toAnchor: 0 } },
      b: { holeSetId: 'outer-holes', stretch: { kind: 'between', fromAnchor: 3, toAnchor: 0 } },
    }),
    addSeam({
      id: 'pocket-right-seam',
      a: {
        holeSetId: 'pocket-holes',
        stretch: { kind: 'between', fromAnchor: 0, toAnchor: 'end' },
      },
      b: { holeSetId: 'outer-holes', stretch: { kind: 'from', anchor: 0, toward: 'next' } },
    }),
  ]);
}

/** A key fob: a strap with round ends, folded through a ring and closed with a rivet. */
export function keyFob(): Project {
  return build('template-key-fob', [
    setProjectName('Key fob'),
    addPart(shapePart('strap', 'strap-outline', 'Strap', rectShape(at(0, 0), 140, 26, 13))),
    addFoldLine('strap', 'strap-fold', { kind: 'path', path: line([at(70, 0), at(70, 26)]) }),
    // One rivet through both layers: a hole in each half, the fold between them.
    addHardwareHole('strap', 'strap-rivet-a', at(14, 13), 2),
    mirrorAcrossFold(['strap-rivet-a'], ['strap-rivet-b'], 'strap-fold'),
  ]);
}

/** A coaster: a 100 mm square with soft corners, stitched all round. */
export function coaster(): Project {
  return build('template-coaster', [
    setProjectName('Coaster'),
    addPart(shapePart('coaster', 'coaster-outline', 'Coaster', rectShape(at(0, 0), 100, 100, 10))),
    addStitchLine('coaster', 'coaster-stitch', 'coaster-outline', 4),
    addStitchHoles('coaster', 'coaster-holes', 'coaster-stitch'),
  ]);
}

const RECIPES: Readonly<Record<string, () => Project>> = {
  'card-holder': cardHolder,
  'key-fob': keyFob,
  coaster,
};

describe('the built-in templates (8.12)', () => {
  for (const [id, recipe] of Object.entries(RECIPES)) {
    const fixture = resolve(FIXTURES, `${id}.lcp`);

    if (process.env.UPDATE_FIXTURES === '1') {
      it(`${id} is written by the current serialiser`, () => {
        writeFileSync(fixture, saveProject(recipe(), SAVE));
        expect(existsSync(fixture)).toBe(true);
      });
    }

    it(`${id} is the project its commands build, so the file and the recipe cannot drift`, () => {
      const { project } = loadProject(new Uint8Array(readFileSync(fixture)));
      expect(project).toEqual(recipe());
    });

    it(`${id} is clean: a template that shows a problem teaches the wrong thing`, () => {
      const project = recipe();
      for (const part of evaluate(project).parts) {
        for (const entry of part.features) expect(entry.ok, entry.feature.id).toBe(true);
      }
      expect(diagnose(project)).toEqual([]);
      expect(exportReadiness(project)).toMatchObject({ errors: 0, warnings: 0 });
    });
  }

  it('lists every recipe, and the sample wallet first', () => {
    expect(BUILT_IN_TEMPLATES.map((template) => template.id)).toEqual([
      'bifold-wallet',
      ...Object.keys(RECIPES),
    ]);
  });
});

describe('templates checked as leatherwork (8.14b)', () => {
  it('declares all three card-holder seams and pairs their holes within 0.01 mm', () => {
    const project = cardHolder();
    expect(project.seams?.map((seam) => seam.id)).toEqual([
      'pocket-left-seam',
      'pocket-bottom-seam',
      'pocket-right-seam',
    ]);
    const verdicts = (project.seams ?? []).map((seam) => seamVerdict(project, seam));
    expect(verdicts).toHaveLength(3);
    for (const verdict of verdicts) {
      if (!verdict.ok) throw new Error(verdict.problem.code);
      expect(verdict.countA).toBe(verdict.countB);
      expect(verdict.driftMm).toBeLessThan(0.01);
      expect(verdict.severity).toBe('info');
    }
    expect(verdicts.map((verdict) => (verdict.ok ? verdict.countA : 0))).toEqual([12, 27, 12]);
  });
  it('covers about 82% of a payment card while leaving a usable grip above the opening', () => {
    const pocket = evaluate(cardHolder()).parts.find((part) => part.part.id === 'pocket');
    const outline = pocket?.features.find((entry) => entry.feature.id === 'pocket-outline');
    const stitching = pocket?.features.find((entry) => entry.feature.id === 'pocket-stitch');
    if (outline?.ok !== true || stitching?.ok !== true) throw new Error('pocket must resolve');
    const opening = PathOps.bbox(outline.path)?.maxY ?? -Infinity;
    const floor = PathOps.bbox(stitching.path)?.minY ?? Infinity;
    const depth = opening - floor;
    // Flat geometry measured from the bottom stitch line, not the cut edge.
    // This is a design target, not proof of retention in a particular leather.
    expect(depth / 53.98).toBeGreaterThanOrEqual(0.8);
    expect(depth / 53.98).toBeLessThanOrEqual(0.84);
    for (const cardHeight of [50, 50.8, 53.98, 54, 55]) {
      expect(cardHeight - depth).toBeGreaterThanOrEqual(5);
      expect(cardHeight - depth).toBeLessThanOrEqual(11);
    }
  });
  it('keeps the card-holder stitching attached when its pocket outline is resized', () => {
    fc.assert(
      fc.property(fc.integer({ min: 90, max: 140 }), (width) => {
        const project = cardHolder();
        const outline = project.parts
          .flatMap((p) => p.features)
          .find((f) => f.id === 'pocket-outline');
        const stitch = project.parts
          .flatMap((p) => p.features)
          .find((f) => f.id === 'pocket-stitch');
        expect(stitch?.source).toMatchObject({
          kind: 'derived',
          sourceId: 'pocket-outline',
          op: { type: 'offset', distanceMm: 3 },
        });
        if (outline?.source.kind !== 'shape' || outline.source.shape.type !== 'rect')
          throw new Error('pocket is rectangular');
        const changed = setShape(outline.id, { ...outline.source.shape, width }).apply({ project });
        const entry = evaluate(changed.project)
          .parts.flatMap((p) => p.features)
          .find((f) => f.feature.id === 'pocket-stitch');
        if (entry?.ok !== true) throw new Error('resized stitching must resolve');
        const bounds = PathOps.bbox(entry.path);
        expect(Math.abs((bounds?.maxX ?? Infinity) - (width - 3))).toBeLessThanOrEqual(EPS_LENGTH);
        expect(Math.abs((bounds?.minX ?? Infinity) - 3)).toBeLessThanOrEqual(EPS_LENGTH);
      }),
    );
  });
  it('keeps the key-fob rivet holes paired when the original hole or fold moves', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -5, max: 5 }),
        fc.integer({ min: -5, max: 5 }),
        (holeDelta, foldDelta) => {
          const project = keyFob();
          const mirror = project.parts
            .flatMap((p) => p.features)
            .find((f) => f.id === 'strap-rivet-b');
          expect(mirror?.source).toMatchObject({
            kind: 'derived',
            sourceId: 'strap-rivet-a',
            op: { type: 'mirror', axis: { kind: 'fold', foldId: 'strap-fold' } },
          });
          const moved = translateFeatures(['strap-rivet-a'], { x: holeDelta, y: 0 }).apply({
            project,
          });
          const changed = translateFeatures(['strap-fold'], { x: foldDelta, y: 0 }).apply(moved);
          const entry = evaluate(changed.project)
            .parts.flatMap((p) => p.features)
            .find((f) => f.feature.id === 'strap-rivet-b');
          if (entry?.ok !== true) throw new Error('mirrored rivet must resolve');
          const bounds = PathOps.bbox(entry.path);
          const centre = ((bounds?.minX ?? Infinity) + (bounds?.maxX ?? Infinity)) / 2;
          expect(Math.abs(centre - (126 - holeDelta + 2 * foldDelta))).toBeLessThanOrEqual(
            EPS_LENGTH,
          );
        },
      ),
    );
  });
  it('loads every built-in template cleanly and preserves its checks after saving again', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      const project = loadProject(readFileSync(resolve(FIXTURES, template.id + '.lcp'))).project;
      const loaded = loadProject(saveProject(project, SAVE)).project;
      for (const part of loaded.parts) {
        const outline = part.features.find(
          (feature) => feature.kind === 'cut-contour' && feature.role === 'outer',
        );
        if (outline?.source.kind !== 'shape') continue;
        for (const feature of part.features.filter((feature) => feature.kind === 'stitch-line'))
          expect(feature.source, template.id).toMatchObject({
            kind: 'derived',
            sourceId: outline.id,
            op: { type: 'offset' },
          });
      }
      expect(diagnose(loaded), template.id).toEqual([]);
      expect(loaded).toEqual(project);
      for (const seam of loaded.seams ?? [])
        expect(seamVerdict(loaded, seam)).toMatchObject({ ok: true, severity: 'info' });
    }
  });
});
