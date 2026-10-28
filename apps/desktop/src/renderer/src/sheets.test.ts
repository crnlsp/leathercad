import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import {
  DocumentStore,
  setPageSetup,
  setPartName,
  setShape,
  translateFeatures,
} from '@leathercad/document';
import { DEFAULT_SETTINGS, type Part, type Project } from '@leathercad/domain';
import type { SheetPlan } from '@leathercad/export';
import { RectOps, uniformRadii } from '@leathercad/geometry';
import { loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { paperOptionsFor, printStatusFor, resolvedFor, sheetPlanFor } from './sheets.js';

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

/**
 * The audit's synthetic bag (docs/performance-backlog.md, *Workloads*): forty
 * independent 200 mm straps, each an outline, a stitch line and its holes, in
 * an eight-column layout — 4,720 holes.
 */
function bag(parts: number): Project {
  return {
    id: 'bag',
    name: 'Bag',
    settings: DEFAULT_SETTINGS,
    parts: Array.from({ length: parts }, (_, i): Part => {
      const origin = { x: (i % 8) * 220, y: Math.floor(i / 8) * 60 };
      return {
        id: `part-${String(i)}`,
        name: `Strap ${String(i)}`,
        quantity: 1,
        features: [
          {
            id: `cut-${String(i)}`,
            kind: 'cut-contour',
            role: 'outer',
            name: 'Outline',
            visible: true,
            locked: false,
            source: {
              kind: 'shape',
              shape: {
                type: 'rect',
                origin,
                width: 200,
                height: 40,
                radii: uniformRadii(0),
                rotation: 0,
              },
            },
          },
          {
            id: `stitch-${String(i)}`,
            kind: 'stitch-line',
            name: 'Stitch line',
            visible: true,
            locked: false,
            source: {
              kind: 'derived',
              sourceId: `cut-${String(i)}`,
              op: { type: 'offset', distanceMm: 3.5, side: 'inward', run: { kind: 'whole' } },
            },
          },
          {
            id: `holes-${String(i)}`,
            kind: 'stitch-hole-set',
            name: 'Stitch holes',
            visible: true,
            locked: false,
            source: {
              kind: 'derived',
              sourceId: `stitch-${String(i)}`,
              op: {
                type: 'stitch-holes',
                pitchMm: 3.85,
                mode: 'fit-whole',
                corners: 'hole-at-corner',
              },
            },
          },
        ],
      };
    }),
  };
}

/** What the PDF prints as a part's caption, from where the plan placed it. */
function captionOnPaper(plan: SheetPlan, partId: string): string | undefined {
  return plan.sheets
    .flatMap((sheet) => sheet.placements)
    .find((placement) => placement.part.id === partId)
    ?.part.texts.find((text) => text.role === 'annotation')?.source;
}

const strapOf = (width: number) =>
  ({
    type: 'rect',
    origin: { x: 0, y: 0 },
    width,
    height: 40,
    radii: uniformRadii(0),
    rotation: 0,
  }) as const;

describe('the plan of each revision, kept for the one on screen (PERF-001)', () => {
  it('prints, through undo and redo of a rename, the name each revision has', () => {
    const store = new DocumentStore({ project: bag(3) });
    const onPaper = () => captionOnPaper(sheetPlanFor(store.getState().document.project), 'part-0');

    store.dispatch(setPartName('part-0', 'Gusset'));
    expect(onPaper()).toBe('Gusset');
    store.undo();
    expect(onPaper()).toBe('Strap 0');
    store.redo();
    expect(onPaper()).toBe('Gusset');
  });

  it('puts a resized outline on paper, and takes it off again on undo', () => {
    const store = new DocumentStore({ project: bag(3) });
    const widthOnPaper = () =>
      RectOps.width(
        sheetPlanFor(store.getState().document.project).scene.parts.find(
          (part) => part.id === 'part-0',
        )!.boundsMm,
      );

    store.dispatch(setShape('cut-0', strapOf(150)));
    expect(widthOnPaper()).toBeCloseTo(150, 6);
    store.undo();
    expect(widthOnPaper()).toBeCloseTo(200, 6);
    store.redo();
    expect(widthOnPaper()).toBeCloseTo(150, 6);
  });

  it('keeps no more after 250 renames than before the first', () => {
    // What the chrome reads of every revision, Sheets open or not: the sheet
    // count, the print status, the evaluation the panels read. History keeps
    // two hundred of them. Measured on the audit's forty-part bag, bytes after
    // a full collection over the first: 350 / 1,366 / 1,374 MiB at 50 / 200 /
    // 250 renames when every revision kept its own plan; under 1 MiB at each
    // once revisions shared their ink and only the one on screen kept a plan.
    const store = new DocumentStore({ project: bag(40) });
    const ids = store.getState().document.project.parts.map((part) => part.id);
    const show = (): void => {
      const { project } = store.getState().document;
      resolvedFor(project);
      sheetPlanFor(project);
      printStatusFor(project);
    };

    show();
    const before = heapAfterGcMiB();
    for (let edit = 1; edit <= 250; edit++) {
      store.dispatch(setPartName(ids[edit % ids.length]!, `Part ${String(edit)}`));
      show();
    }

    expect(store.getState().canUndo).toBe(true);
    expect(heapAfterGcMiB() - before).toBeLessThan(16);
  });
});

/**
 * Bytes after a full collection, in this worker. `--expose-gc` is set from
 * inside rather than on the command line, so `pnpm test` runs it as it is.
 */
setFlagsFromString('--expose_gc');
const collect = runInNewContext('gc') as () => void;

function heapAfterGcMiB(): number {
  collect();
  collect();
  return process.memoryUsage().heapUsed / 2 ** 20;
}
