import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  addHoleRow,
  addMarkingLine,
  addPart,
  emptyDocument,
  rectShape,
  rectanglePart,
  setProjectName,
  type Command,
} from '@leathercad/document';
import { evaluate, exportReadiness, type Project } from '@leathercad/domain';
import { DEFAULT_PAGE_SETUP, buildExportScene, planSheets } from '@leathercad/export';
import { PathOps, type Vec2 } from '@leathercad/geometry';
import { loadProject, saveProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

/**
 * R11's second print test: what 1.6 added to paper, for `e2e/print-verification.spec.ts`
 * to measure through the app and for the maker to measure with a rule
 * (`docs/print-verification-log.md`, checks I–M).
 *
 * Built with the app's own commands and written by its own serialiser.
 * Regenerate with
 * `UPDATE_FIXTURES=1 pnpm vitest run apps/desktop/src/renderer/src/printTestAssembly.test.ts`.
 */

const FIXTURE = resolve(
  import.meta.dirname,
  '../../../../../fixtures/projects/print-test-assembly.lcp',
);
const SAVE = { applicationVersion: '0.0.0', now: () => new Date('2026-11-20T00:00:00.000Z') };

const at = (x: number, y: number): Vec2 => ({ x, y });

function assemblyProject(): Project {
  const commands: Command[] = [
    setProjectName('LeatherCAD print test - assembly and hole rows'),
    // 300 x 300 mm is more than A4 holds either way, so it is taped 2 x 2 after
    // an assembly map.
    addPart(rectanglePart('panel', 'panel-outline', 'Panel', rectShape(at(0, 0), 300, 300, 0))),
    // A 4 mm hole row, 25 mm apart: five holes on a 100 mm line.
    addPart(rectanglePart('strip', 'strip-outline', 'Hole row', rectShape(at(0, 0), 120, 30, 0))),
    addMarkingLine('strip', 'strip-line', {
      kind: 'path',
      path: PathOps.polyline([at(10, 15), at(110, 15)], false),
    }),
    addHoleRow('strip', 'strip-holes', 'strip-line'),
  ];
  return commands.reduce(
    (document, command) => command.apply(document),
    emptyDocument('print-test-assembly'),
  ).project;
}

describe('the print test assembly project', () => {
  if (process.env.UPDATE_FIXTURES === '1') {
    it('is written by the current serialiser', () => {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, saveProject(assemblyProject(), SAVE));
    });
  }

  it('is the project the commands build, so the file and its recipe cannot drift apart', () => {
    const { project } = loadProject(new Uint8Array(readFileSync(FIXTURE)));
    expect(project).toEqual(assemblyProject());
  });

  it('evaluates cleanly, and nothing blocks the export', () => {
    const project = assemblyProject();
    for (const part of evaluate(project).parts) {
      for (const entry of part.features) expect(entry.ok, entry.feature.id).toBe(true);
    }
    expect(exportReadiness(project).errors).toBe(0);
  });

  it('holds what checks I to K measure', () => {
    const project = assemblyProject();
    const resolved = evaluate(project);

    // I: five 4 mm holes, 25 mm apart, 100 mm first to last.
    const row = resolved.parts
      .flatMap((part) => part.features)
      .find((entry) => entry.feature.id === 'strip-holes');
    if (row === undefined || !row.ok) throw new Error('no hole row');
    const xs = row.holes!.holes.map((hole) => hole.point.x);
    expect(xs.map((x) => x - xs[0]!)).toEqual([0, 25, 50, 75, 100]);
    expect(row.holes!.radiusMm).toBe(2);

    // J, K: the panel is taped 2 x 2 after its map (whose words
    // `packages/export/src/sheetInk.test.ts` holds): the strip on sheet 1, the map, four tiles.
    const plan = planSheets(buildExportScene(resolved, project.name), DEFAULT_PAGE_SETUP);
    expect(plan.sheets).toHaveLength(6);
    expect(plan.sheets.map((sheet) => sheet.assembly !== undefined)).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});
