import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Ulid } from '@leathercad/core';
import {
  addTextLabel,
  setPartMirroredPair,
  setProjectName,
  type Command,
  type Document,
} from '@leathercad/document';
import { diagnose, evaluate, type Project } from '@leathercad/domain';
import { PathOps, RectOps } from '@leathercad/geometry';
import { loadProject, saveProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { sheetPlanFor } from './sheets.js';

/*
 * The paper checks that explain themselves (docs/print-verification-log.md):
 * each fixture is a measured project with a short label beside every thing to
 * measure — its letter in the log and the value it must read — so the printed
 * sheet is the whole procedure. Labels sit inside their piece's outline, so
 * every piece prints exactly where the unlabelled project prints it and the
 * expected values are the log's. Regenerate with `UPDATE_FIXTURES=1 pnpm test`.
 */

const FIXTURES = resolve(import.meta.dirname, '../../../../../fixtures/projects');
const SAVE = { applicationVersion: '0.0.0', now: () => new Date('2026-11-20T00:00:00.000Z') };

type Label = readonly [part: string, x: number, y: number, text: string];

interface PaperCheck {
  readonly file: string;
  readonly base: string;
  readonly name: string;
  /** What the base needs before it is the project the log measures. */
  readonly setUp?: readonly Command[];
  readonly labels: readonly Label[];
}

const CHECKS: readonly PaperCheck[] = [
  {
    file: 'paper-check-print-test.lcp',
    base: 'print-test.lcp',
    name: 'Paper check - print test (A-H)',
    labels: [
      ['panel', 8, 56, 'A = 100.0  gauge, long side (every sheet)'],
      ['panel', 8, 50, 'B = 5.0  gauge, short side (every sheet)'],
      ['panel', 8, 40, 'Footers read Sheet 1, 2, 3 of 3'],
      ['panel', 8, 30, "C = 100.0  this piece's bottom edge"],
      ['panel', 8, 24, 'D = 100.0  dimension below, tip to tip'],
      ['panel', 8, 16, 'E = 93.0  bottom holes 1 to 25'],
      ['panel', 8, 10, 'F = 38.75  bottom holes 1 to 11'],
      ['strap', 10, 14, 'G = 275.0  end to end, sheets 2 + 3 taped at the crosses'],
      ['strap', 10, 6, 'H = 25.0  width, and no step at the join'],
    ],
  },
  {
    file: 'paper-check-alignment-marks.lcp',
    base: 'card-holder-marks.lcp',
    name: 'Paper check - alignment marks (9.13)',
    labels: [
      // Each beside its own tick: the 6th side hole is 18.6 mm up from the
      // corner hole, the 12th 41.1 mm, on both pieces.
      ['outer', 10, 56, 'A = 100.0  B = 5.0  gauge'],
      ['outer', 10, 43, 'P = 41.1  left: corner hole to this tick'],
      ['outer', 10, 32, 'R  right side: as N, O, P, Q'],
      ['outer', 10, 20.5, 'N = 18.6  left: corner hole to this tick'],
      ['outer', 10, 10, 'Pass: N = O and P = Q, within 0.5'],
      ['pocket', 10, -17, 'Q = 41.1  left: corner hole to this tick'],
      ['pocket', 10, -39.5, 'O = 18.6  left: corner hole to this tick'],
    ],
  },
  {
    file: 'paper-check-mirrored-pair.lcp',
    base: 'card-holder.lcp',
    name: 'Paper check - mirrored pair (Q21)',
    setUp: [setPartMirroredPair('pocket', true)],
    labels: [
      ['outer', 10, 56, 'A = 100.0  B = 5.0  gauge'],
      ['outer', 10, 44, "V  Pocket's caption: one line, clear"],
      ['outer', 10, 38, 'Cut Pocket twice, flip one: they stack'],
      ['pocket', 10, -26, 'S = 105.0  width, cut edge to cut edge'],
      ['pocket', 10, -32, 'T = 47.3  height, cut edge to cut edge'],
      ['pocket', 10, -38, 'U = 2.0  caption capital height'],
    ],
  },
];

const load = (file: string): Project => loadProject(readFileSync(resolve(FIXTURES, file))).project;

const apply = (project: Project, commands: readonly Command[]): Project =>
  commands.reduce<Document>((current, command) => command.apply(current), { project }).project;

/** The project the log measures: the base, set up as its procedure says. */
const measured = (check: PaperCheck): Project => apply(load(check.base), check.setUp ?? []);

function labelled(check: PaperCheck): Project {
  return apply(measured(check), [
    setProjectName(check.name),
    ...check.labels.map(([part, x, y, text], i) =>
      addTextLabel(part as Ulid, `check-${String(i + 1)}` as Ulid, { x, y }, text),
    ),
  ]);
}

/** Where each piece prints: the sheet, and its place and turn there. */
const placements = (project: Project) =>
  sheetPlanFor(project).sheets.map((sheet) =>
    sheet.placements.map(({ part, turned, offsetMm }) => ({ id: part.id, turned, offsetMm })),
  );

describe.each(CHECKS)('$file', (check) => {
  if (process.env.UPDATE_FIXTURES === '1') {
    it('is written through document commands', () => {
      writeFileSync(resolve(FIXTURES, check.file), saveProject(labelled(check), SAVE));
    });
  }

  it('is reproducible from its base and its labels', () => {
    expect(load(check.file)).toEqual(labelled(check));
  });

  it('prints every piece where the unlabelled project does, so the log’s values hold', () => {
    expect(placements(load(check.file))).toEqual(placements(measured(check)));
  });

  it('keeps every label inside its piece’s outline', () => {
    for (const { part, features } of evaluate(load(check.file)).parts) {
      const box = (resolved: (typeof features)[number]) =>
        resolved.ok ? PathOps.bbox(resolved.path) : null;
      const outline = features.find(
        (f) => f.ok && f.feature.kind === 'cut-contour' && f.feature.role === 'outer',
      );
      for (const label of features.filter((f) => f.ok && f.feature.kind === 'text-label')) {
        const outer = outline === undefined ? null : box(outline);
        const words = box(label);
        if (outer === null || words === null) throw new Error(`${part.name} must resolve`);
        expect(RectOps.containsRect(outer, words)).toBe(true);
      }
    }
  });

  it('adds no problem, and no missing glyph, to the project it measures', () => {
    expect(diagnose(load(check.file))).toEqual(diagnose(measured(check)));
  });
});
