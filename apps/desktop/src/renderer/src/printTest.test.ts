import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { formatMm } from '@leathercad/core';
import {
  DEFAULT_DIMENSION_OFFSET_MM,
  addDrawnStitchLine,
  addMeasurement,
  addPart,
  addStitchHoles,
  addStitchLine,
  emptyDocument,
  pathPart,
  rectShape,
  rectanglePart,
  setProjectName,
  shapePart,
  type Command,
} from '@leathercad/document';
import { evaluate, exportReadiness, type Project } from '@leathercad/domain';
import { PathOps, Shapes, type Path, type Vec2 } from '@leathercad/geometry';
import { loadProject, saveProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

/**
 * The 7.7 print test: the project a maker prints to check 1:1 on their own
 * printer, and the one `e2e/print-verification.spec.ts` exports through the
 * app and measures.
 *
 * Built here with the app's own commands and written by its own serialiser, so
 * it is a file the app could have saved. Regenerate with
 * `UPDATE_FIXTURES=1 pnpm vitest run apps/desktop/src/renderer/src/printTest.test.ts`,
 * and read `docs/print-verification-log.md` before changing what is on it: a
 * recorded measurement names what it was measured on.
 */

const FIXTURE = resolve(import.meta.dirname, '../../../../../fixtures/projects/print-test.lcp');
const SAVE = { applicationVersion: '0.0.0', now: () => new Date('2026-09-24T00:00:00.000Z') };

const at = (x: number, y: number): Vec2 => ({ x, y });

/**
 * A 96 × 60 mm card pocket with a thumb scoop in its top edge — the product
 * spec's own example, as `e2e/edge-scoop.spec.ts` draws it.
 */
function pocketOutline(): Path {
  const corners = [at(0, 0), at(96, 0), at(96, 60), at(63, 60)];
  const scoop = Shapes.arcThroughPoints(at(63, 60), at(48, 48), at(33, 60));
  const rest = [at(33, 60), at(0, 60), at(0, 0)];
  const straight = (points: Vec2[]) => PathOps.polyline(points, false).segments;
  return { closed: true, segments: [...straight(corners), ...scoop.segments, ...straight(rest)] };
}

function printTestProject(): Project {
  const commands: Command[] = [
    setProjectName('LeatherCAD print test'),

    // A panel with rounded top corners and a stitch line all round it. The
    // bottom corners are sharp, so the dimension between them reads a true
    // 100.0 — a rounded corner's anchor is the middle of its arc — and the
    // stitch run along the bottom is straight: 93 mm, which holes at a 3.85 mm
    // iron divide into 24 gaps of 3.875 mm.
    addPart(
      shapePart('panel', 'panel-outline', 'Outer panel', {
        ...rectShape(at(0, 0), 100, 70),
        radii: { bottomLeft: 0, bottomRight: 0, topRight: 10, topLeft: 10 },
      }),
    ),
    addStitchLine('panel', 'panel-stitch', 'panel-outline'),
    addStitchHoles('panel', 'panel-holes', 'panel-stitch'),
    // Corners are numbered along the outline from its start at the bottom
    // left: 0 is the bottom right, 3 the bottom left.
    addMeasurement(
      'panel-width',
      'horizontal',
      { kind: 'anchor', featureId: 'panel-outline', anchor: 3 },
      { kind: 'anchor', featureId: 'panel-outline', anchor: 0 },
      -DEFAULT_DIMENSION_OFFSET_MM,
    ),

    // The pocket, stitched on its three sewn sides; the scoop is the opening.
    addPart(pathPart('pocket', 'pocket-outline', 'Pocket', pocketOutline())),
    addDrawnStitchLine('pocket', 'pocket-stitch', {
      kind: 'path',
      path: PathOps.polyline([at(4, 56), at(4, 4), at(92, 4), at(92, 56)], false),
    }),
    addStitchHoles('pocket', 'pocket-holes', 'pocket-stitch'),

    // Longer than A4 portrait prints across, so it is tiled over two sheets.
    addPart(rectanglePart('strap', 'strap-outline', 'Strap', rectShape(at(0, 0), 250, 25, 5))),
  ];

  return commands.reduce(
    (document, command) => command.apply(document),
    emptyDocument('print-test'),
  ).project;
}

describe('the print test project', () => {
  if (process.env.UPDATE_FIXTURES === '1') {
    it('is written by the current serialiser', () => {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, saveProject(printTestProject(), SAVE));
      expect(existsSync(FIXTURE)).toBe(true);
    });
  }

  it('is the project the commands build, so the file and its recipe cannot drift apart', () => {
    const { project } = loadProject(new Uint8Array(readFileSync(FIXTURE)));
    expect(project).toEqual(printTestProject());
  });

  it('evaluates cleanly: every feature resolves, and nothing blocks the export', () => {
    const project = printTestProject();
    const resolved = evaluate(project);
    for (const part of resolved.parts) {
      for (const entry of part.features) expect(entry.ok, entry.feature.id).toBe(true);
    }
    expect(exportReadiness(project).errors).toBe(0);
  });

  it('holds what the print test measures', () => {
    const resolved = evaluate(printTestProject());
    const feature = (id: string) =>
      resolved.parts.flatMap((part) => part.features).find((entry) => entry.feature.id === id)!;

    // The dimension reads 100.0 …
    const width = feature('panel-width');
    expect(width.ok && width.text?.layout.text).toBe('100.0');

    // … and the panel's stitching has a straight run of 25 holes along the
    // bottom, which is where a rule measures spacing. Its spacing is the run's
    // own, not the hole set's average across its runs — the number the panel
    // shows, which differs on a rounded outline.
    const holes = feature('panel-holes');
    if (!holes.ok || holes.holes === undefined) throw new Error('no holes');
    const bottom = holes.holes.holes.filter((hole) => Math.abs(hole.point.y - 3.5) < 1e-6);
    expect(bottom).toHaveLength(25);
    const xs = bottom.map((hole) => hole.point.x).sort((a, b) => a - b);
    expect((xs.at(-1)! - xs[0]!) / 24).toBeCloseTo(3.875, 9);
    // What the panel shows instead, which the log tells a maker not to use.
    expect(formatMm(holes.holes.achievedPitchMm)).toBe('3.88 mm');
  });
});
