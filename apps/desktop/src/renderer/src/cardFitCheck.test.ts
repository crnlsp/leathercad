import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { EPS_LENGTH } from '@leathercad/core';
import {
  addMarkingLine,
  addPart,
  addTextLabel,
  emptyDocument,
  rectShape,
  setProjectName,
  shapePart,
  type Command,
} from '@leathercad/document';
import { diagnose, evaluate } from '@leathercad/domain';
import { PathOps } from '@leathercad/geometry';
import { loadProject, saveProject } from '@leathercad/persist';
import { expect, it } from 'vitest';

// Actual trim sizes, not printers' bleed sizes. Sources and the manual procedure
// live in docs/template-audit.md. This project is a test aid, not a built-in template.
const CARDS = [
  { id: 'id1', name: 'Payment / ID-1', width: 85.6, height: 53.98, radius: 3.18 },
  { id: 'eu', name: 'EU / UK business', width: 85, height: 55, radius: 0 },
  { id: 'us', name: 'US / Canada business', width: 88.9, height: 50.8, radius: 0 },
  { id: 'jp', name: 'Japan business', width: 91, height: 55, radius: 0 },
  { id: 'cn', name: 'China / Taiwan business', width: 90, height: 54, radius: 0 },
  { id: 'au', name: 'Australia / NZ business', width: 90, height: 55, radius: 0 },
] as const;
const FIXTURE = resolve(import.meta.dirname, '../../../../../fixtures/projects/card-fit-check.lcp');
const POCKET = resolve(import.meta.dirname, '../../../../../fixtures/projects/card-holder.lcp');
const SAVE = { applicationVersion: '0.0.0', now: () => new Date('2026-11-10T00:00:00.000Z') };

function cardFitCheck() {
  const commands: Command[] = [setProjectName('Card fit check - taller pocket')];
  CARDS.forEach(({ id, name, width, height, radius }, index) => {
    const x = (index % 2) * 110;
    const y = 0 - Math.floor(index / 2) * 75;
    commands.push(
      addPart(
        shapePart(
          id,
          id + '-outline',
          `${name} - ${width} x ${height} mm`,
          rectShape({ x, y }, width, height, radius),
        ),
      ),
      addMarkingLine(id, id + '-opening', {
        kind: 'path',
        path: PathOps.polyline(
          [
            { x, y: y + 44.3487 },
            { x: x + width, y: y + 44.3487 },
          ],
          false,
        ),
      }),
      addTextLabel(id, id + '-label', { x: x + 5, y: y + 35 }, 'Pocket opening above', 2.5),
    );
  });
  return commands.reduce(
    (document, command) => command.apply(document),
    emptyDocument('card-fit-check'),
  ).project;
}

if (process.env.UPDATE_FIXTURES === '1') {
  it('writes the card fit check through document commands', () => {
    writeFileSync(FIXTURE, saveProject(cardFitCheck(), SAVE));
  });
}

it('keeps the card fit resource reproducible and clean', () => {
  expect(loadProject(readFileSync(FIXTURE)).project).toEqual(cardFitCheck());
  expect(diagnose(cardFitCheck())).toEqual([]);
});

it('marks the revised pocket opening at its effective depth on every card', () => {
  const pocket = evaluate(loadProject(readFileSync(POCKET)).project).parts.flatMap(
    (part) => part.features,
  );
  const outline = pocket.find((entry) => entry.feature.id === 'pocket-outline');
  const stitch = pocket.find((entry) => entry.feature.id === 'pocket-stitch');
  if (outline?.ok !== true || stitch?.ok !== true) throw new Error('pocket must resolve');
  const depth =
    (PathOps.bbox(outline.path)?.maxY ?? -Infinity) - (PathOps.bbox(stitch.path)?.minY ?? Infinity);
  for (const part of evaluate(cardFitCheck()).parts) {
    const cut = part.features.find((entry) => entry.feature.kind === 'cut-contour');
    const opening = part.features.find((entry) => entry.feature.kind === 'marking-line');
    if (cut?.ok !== true || opening?.ok !== true) throw new Error('card must resolve');
    const measured =
      (PathOps.bbox(opening.path)?.minY ?? Infinity) - (PathOps.bbox(cut.path)?.minY ?? -Infinity);
    expect(Math.abs(measured - depth)).toBeLessThanOrEqual(EPS_LENGTH);
  }
});
