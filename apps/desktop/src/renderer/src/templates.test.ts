import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  addDrawnStitchLine,
  addFoldLine,
  addHardwareHole,
  addPart,
  addStitchHoles,
  addStitchLine,
  emptyDocument,
  rectShape,
  setPartQuantity,
  setProjectName,
  shapePart,
  type Command,
} from '@leathercad/document';
import { diagnose, evaluate, exportReadiness, type Project } from '@leathercad/domain';
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
 */
export function cardHolder(): Project {
  return build('template-card-holder', [
    setProjectName('Card holder'),
    addPart(shapePart('outer', 'outer-outline', 'Outer', rectShape(at(0, 0), 105, 70, 4))),
    addStitchLine('outer', 'outer-stitch', 'outer-outline', 3),
    addStitchHoles('outer', 'outer-holes', 'outer-stitch'),
    addPart(
      shapePart('pocket', 'pocket-outline', 'Pocket', {
        ...rectShape(at(0, -60), 105, 45),
        radii: { bottomLeft: 4, bottomRight: 4, topRight: 0, topLeft: 0 },
      }),
    ),
    addDrawnStitchLine('pocket', 'pocket-stitch', {
      kind: 'path',
      path: line([at(3, -19), at(3, -57), at(102, -57), at(102, -19)]),
    }),
    addStitchHoles('pocket', 'pocket-holes', 'pocket-stitch'),
    setPartQuantity('pocket', 2),
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
    addHardwareHole('strap', 'strap-rivet-b', at(126, 13), 2),
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
