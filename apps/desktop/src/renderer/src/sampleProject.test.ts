import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DEFAULT_DIMENSION_OFFSET_MM,
  addFoldLine,
  addMeasurement,
  addPart,
  addStitchHoles,
  addStitchLine,
  addDrawnStitchLine,
  emptyDocument,
  mirrorAcrossFold,
  pathPart,
  rectShape,
  setPartQuantity,
  setProjectName,
  shapePart,
  addCutOut,
  type Command,
} from '@leathercad/document';
import { diagnose, evaluate, exportReadiness, type Project } from '@leathercad/domain';
import { PathOps, Shapes, type Path, type Vec2 } from '@leathercad/geometry';
import { loadProject, saveProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { sheetPlanFor } from './sheets.js';

/**
 * The worked sample (slice 8.3): *Help › Open Sample*.
 *
 * The bifold wallet `docs/getting-started.md` walks through and the README's
 * demo draws — an outer with its stitching and a centre fold, a lining 2 mm
 * smaller, and a card pocket with a thumb scoop, cut twice — plus what the
 * demo leaves out and a maker would want next: a pair of card slots on the
 * lining, the second folded across the lining's own fold so the two stay each
 * other's mirror, and a dimension that reads the drawing.
 *
 * Built here with the app's own commands and written by its own serialiser,
 * so it is a file the app could have saved. Regenerate with
 * `UPDATE_FIXTURES=1 pnpm vitest run apps/desktop/src/renderer/src/sampleProject.test.ts`.
 */

const FIXTURE = resolve(import.meta.dirname, '../../../../../fixtures/projects/bifold-wallet.lcp');
const SAVE = { applicationVersion: '0.0.0', now: () => new Date('2026-09-26T00:00:00.000Z') };

const at = (x: number, y: number): Vec2 => ({ x, y });
const line = (points: Vec2[]): Path => PathOps.polyline(points, false);

/** A 95 × 60 mm card pocket at `(x, y)`, its top edge scooped for a thumb. */
function pocketOutline(x: number, y: number): Path {
  const p = (dx: number, dy: number) => at(x + dx, y + dy);
  const scoop = Shapes.arcThroughPoints(p(63, 60), p(47.5, 48), p(32, 60));
  const straight = (points: Vec2[]) => line(points).segments;
  return {
    closed: true,
    segments: [
      ...straight([p(0, 0), p(95, 0), p(95, 60), p(63, 60)]),
      ...scoop.segments,
      ...straight([p(32, 60), p(0, 60), p(0, 0)]),
    ],
  };
}

export function sampleProject(): Project {
  const commands: Command[] = [
    setProjectName('Bifold wallet'),

    // The outer: 200 × 95 with 5 mm corners, stitched 3 mm in, folded down the
    // middle — a fold that runs right across, edge to edge.
    addPart(
      shapePart('outer', 'outer-outline', 'Outer', {
        ...rectShape(at(0, 0), 200, 95),
        radii: r(5),
      }),
    ),
    addStitchLine('outer', 'outer-stitch', 'outer-outline', 3),
    addStitchHoles('outer', 'outer-holes', 'outer-stitch'),
    addFoldLine('outer', 'outer-fold', { kind: 'path', path: line([at(100, 0), at(100, 95)]) }),

    // The lining, 2 mm smaller all round, with its own fold and a card slot on
    // each side of it: one drawn, the other folded across, so moving the fold
    // keeps them a pair.
    addPart(
      shapePart('lining', 'lining-outline', 'Lining', {
        ...rectShape(at(2, -110), 196, 91),
        radii: r(4),
      }),
    ),
    addFoldLine('lining', 'lining-fold', {
      kind: 'path',
      path: line([at(100, -110), at(100, -19)]),
    }),
    addCutOut('lining', 'lining-slot', {
      kind: 'shape',
      shape: { ...rectShape(at(18, -45), 64, 3), radii: r(1.5) },
    }),
    mirrorAcrossFold(['lining-slot'], ['lining-slot-mirrored'], 'lining-fold'),

    // The card pocket, cut twice, stitched on its three sewn sides.
    addPart(pathPart('pocket', 'pocket-outline', 'Card pocket', pocketOutline(52, -200))),
    addDrawnStitchLine('pocket', 'pocket-stitch', {
      kind: 'path',
      path: line([at(56, -144), at(56, -196), at(143, -196), at(143, -144)]),
    }),
    addStitchHoles('pocket', 'pocket-holes', 'pocket-stitch'),
    setPartQuantity('pocket', 2),
    // What the pocket is, read from the drawing rather than typed: its two
    // bottom corners are sharp, so the number is the pocket's true width (a
    // rounded corner's anchor is the middle of its arc — roadmap Q15).
    addMeasurement(
      'pocket-width',
      'aligned',
      // Anchors count from the first corner after the path's start: 0 is the
      // bottom right, and the start itself, the bottom left, comes last.
      { kind: 'anchor', featureId: 'pocket-outline', anchor: 5 },
      { kind: 'anchor', featureId: 'pocket-outline', anchor: 0 },
      -DEFAULT_DIMENSION_OFFSET_MM,
    ),
  ];

  return commands.reduce(
    (document, command) => command.apply(document),
    emptyDocument('sample-bifold-wallet'),
  ).project;
}

function r(radius: number) {
  return { bottomLeft: radius, bottomRight: radius, topRight: radius, topLeft: radius };
}

describe('the sample project (8.3)', () => {
  if (process.env.UPDATE_FIXTURES === '1') {
    it('is written by the current serialiser', () => {
      writeFileSync(FIXTURE, saveProject(sampleProject(), SAVE));
      expect(existsSync(FIXTURE)).toBe(true);
    });
  }

  it('is the project the commands build, so the file and its recipe cannot drift apart', () => {
    const { project } = loadProject(new Uint8Array(readFileSync(FIXTURE)));
    expect(project).toEqual(sampleProject());
  });

  it('builds everything the recipe asks for — no command in it was refused', () => {
    const project = sampleProject();
    expect(project.parts.map((part) => [part.name, part.features.length])).toEqual([
      ['Outer', 4],
      ['Lining', 4],
      ['Card pocket', 4],
    ]);
  });

  it('is clean: a sample that shows a problem teaches the wrong thing', () => {
    const project = sampleProject();
    for (const part of evaluate(project).parts) {
      for (const entry of part.features) expect(entry.ok, entry.feature.id).toBe(true);
    }
    expect(diagnose(project)).toEqual([]);
    expect(exportReadiness(project)).toMatchObject({ errors: 0, warnings: 0 });
  });

  it('reads 95.0 across the pocket, and prints on A4 as the getting-started page says', () => {
    const resolved = evaluate(sampleProject());
    const width = resolved.parts
      .flatMap((part) => part.features)
      .find((entry) => entry.feature.id === 'pocket-width')!;
    expect(width.ok && width.text?.layout.text).toBe('95.0');

    // Two bifold pieces too wide for A4 portrait's printable 190 mm, each
    // taped from two sheets, with the joins kept off their folds (Q13).
    const plan = sheetPlanFor(sampleProject());
    expect(plan.pagination.tiled.map((t) => t.part.name)).toEqual(['Outer', 'Lining']);
    for (const page of plan.pagination.pages) {
      for (const join of page.tile?.joinsMm.x ?? [])
        expect(Math.abs(join - 100)).toBeGreaterThan(10);
    }
  });
});
