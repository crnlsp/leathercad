import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { setProjectName, setSeam, type Document } from '@leathercad/document';
import {
  SEAM_DRIFT_LIMIT_MM,
  alignmentMarks,
  diagnose,
  evaluate,
  resolveSeam,
  type Project,
} from '@leathercad/domain';
import { buildExportScene } from '@leathercad/export';
import { loadProject, saveProject } from '@leathercad/persist';
import { expect, it } from 'vitest';

// The project behind 9.13's paper check (docs/print-verification-log.md): the
// shipped card holder with its side seams marked at every 6th pair. A test aid,
// not a built-in template; regenerate with `UPDATE_FIXTURES=1 pnpm test`.
const TEMPLATE = resolve(import.meta.dirname, '../../../../../fixtures/projects/card-holder.lcp');
const FIXTURE = resolve(
  import.meta.dirname,
  '../../../../../fixtures/projects/card-holder-marks.lcp',
);
const SAVE = { applicationVersion: '0.0.0', now: () => new Date('2026-11-11T00:00:00.000Z') };
const SIDES = ['pocket-left-seam', 'pocket-right-seam'];

function cardHolderWithMarks(): Project {
  const document: Document = { project: loadProject(readFileSync(TEMPLATE)).project };
  const seams = document.project.seams ?? [];
  return [
    setProjectName('Card holder - alignment marks at the 6th side hole'),
    ...seams
      .filter((seam) => SIDES.includes(seam.id))
      .map((seam) => setSeam({ ...seam, marks: { kind: 'every', n: 6 } })),
  ].reduce<Document>((current, command) => command.apply(current), document).project;
}

if (process.env.UPDATE_FIXTURES === '1') {
  it('writes the marked card holder through document commands', () => {
    writeFileSync(FIXTURE, saveProject(cardHolderWithMarks(), SAVE));
  });
}

it('keeps the marked card holder reproducible, and as clean as the template', () => {
  const project = loadProject(readFileSync(FIXTURE)).project;
  expect(project).toEqual(cardHolderWithMarks());
  expect(diagnose(project)).toEqual(diagnose(loadProject(readFileSync(TEMPLATE)).project));
});

it('marks the 6th and 12th side holes on both pieces, the same distance from the corner hole', () => {
  const project = loadProject(readFileSync(FIXTURE)).project;
  const marks = alignmentMarks(evaluate(project));
  for (const id of SIDES) {
    const seam = project.seams?.find((s) => s.id === id);
    if (seam === undefined) throw new Error(`${id} must exist`);
    const walked = resolveSeam(project, seam);
    if (!walked.ok) throw new Error(`${id} must resolve`);
    const own = marks.filter((mark) => mark.seamId === id);
    expect(own.map((mark) => `${mark.partId}:${mark.pair}`)).toEqual([
      'pocket:6',
      'pocket:12',
      'outer:6',
      'outer:12',
    ]);
    // What the paper check measures: corner hole to mark, along the stitch line.
    for (const pair of [6, 12]) {
      const pocket = walked.a.holes[pair - 1]!.distanceMm;
      const outer = walked.b.holes[pair - 1]!.distanceMm;
      expect(Math.abs(pocket - outer)).toBeLessThan(SEAM_DRIFT_LIMIT_MM / 1000);
    }
  }
});

it('prints those eight marks, and no others', () => {
  const project = loadProject(readFileSync(FIXTURE)).project;
  const scene = buildExportScene(evaluate(project), project.name);
  const marks = scene.parts.flatMap((part) => part.paths.filter((item) => item.role === 'mark'));
  expect(marks).toHaveLength(8);
});
