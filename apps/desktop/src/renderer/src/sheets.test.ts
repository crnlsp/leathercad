import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DocumentStore, setPageSetup, translateFeatures } from '@leathercad/document';
import { loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { paperOptionsFor, sheetPlanFor } from './sheets.js';

const FIXTURE = resolve(import.meta.dirname, '../../../../../fixtures/projects/print-test.lcp');
const printTest = () => loadProject(new Uint8Array(readFileSync(FIXTURE))).project;

describe('the one sheet plan the app shows and exports (7.4a)', () => {
  it('is the same object for the same project, wherever it is asked for', () => {
    const project = printTest();
    const plan = sheetPlanFor(project);
    expect(sheetPlanFor(project)).toBe(plan);
    // The chosen entry in the paper list is that plan, not a second pagination.
    const { paper, orientation } = project.settings;
    const chosen = paperOptionsFor(project).find(
      (option) => option.paper === paper && option.orientation === orientation,
    );
    expect(chosen?.plan).toBe(plan);
  });

  it('promises in the paper list what choosing that paper then exports', () => {
    // Each entry's count is the count of the plan Export PDF will write once
    // it is chosen. That plan's page count is the PDF's: `sheetPlan.test.ts`
    // in `export` proves it over every paper, and `e2e/paper.spec.ts` through
    // pdfinfo.
    const store = new DocumentStore({ project: printTest() });
    for (const option of paperOptionsFor(store.getState().document.project)) {
      store.dispatch(setPageSetup(option.paper, option.orientation));
      const plan = sheetPlanFor(store.getState().document.project);
      expect(plan.sheets.length).toBe(option.plan.sheets.length);
      expect(plan.setup).toEqual(option.plan.setup);
    }
    const counts = paperOptionsFor(printTest()).map((o) => o.plan.sheets.length);
    expect(counts.slice(2, 4)).toEqual([3, 1]); // A4 portrait, A4 landscape
  });

  it('does not change when a piece is moved on the board', () => {
    const store = new DocumentStore({ project: printTest() });
    const before = sheetPlanFor(store.getState().document.project);
    const strap = store.getState().document.project.parts.find((part) => part.name === 'Strap')!;
    store.dispatch(
      translateFeatures(
        strap.features.map((f) => f.id),
        { x: 437, y: -1210 },
      ),
    );
    const after = sheetPlanFor(store.getState().document.project);

    expect(after).not.toBe(before);
    expect(after.sheets.length).toBe(before.sheets.length);
    expect([...after.parts.values()]).toEqual([...before.parts.values()]);
    // And on paper each piece lands where it did: placed bounds are unchanged.
    const placed = (plan: typeof before) =>
      plan.sheets.flatMap((sheet) =>
        sheet.placements.map((p) => [
          sheet.index,
          p.part.id,
          Math.round((p.part.boundsMm.minX + p.offsetMm.x) * 1e6),
          Math.round((p.part.boundsMm.minY + p.offsetMm.y) * 1e6),
        ]),
      );
    expect(placed(after)).toEqual(placed(before));
  });
});
