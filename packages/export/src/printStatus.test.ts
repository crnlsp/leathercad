import {
  DEFAULT_SETTINGS,
  evaluate,
  type Feature,
  type Part,
  type Project,
} from '@leathercad/domain';
import { uniformRadii } from '@leathercad/geometry';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PAGE_SETUP } from './paper.js';
import { describePrintStatus, printStatusOf } from './printStatus.js';
import { buildExportScene } from './scene.js';
import { planSheets } from './sheetPlan.js';

function outline(id: string, width: number, height: number, visible = true): Feature {
  return {
    id,
    kind: 'cut-contour',
    role: 'outer',
    name: 'Outline',
    visible,
    locked: false,
    source: {
      kind: 'shape',
      shape: {
        type: 'rect',
        origin: { x: 0, y: 0 },
        width,
        height,
        radii: uniformRadii(0),
        rotation: 0,
      },
    },
  };
}

/** A stitch line set in further than the outline is wide: it cannot be built. */
function impossibleStitchLine(id: string, sourceId: string): Feature {
  return {
    id,
    kind: 'stitch-line',
    name: 'Stitch line',
    visible: true,
    locked: false,
    source: {
      kind: 'derived',
      sourceId,
      op: { type: 'offset', distanceMm: 500, side: 'inward', run: { kind: 'whole' } },
    },
  };
}

function label(id: string): Feature {
  return {
    id,
    kind: 'text-label',
    name: 'Label',
    visible: true,
    locked: false,
    source: { kind: 'text', text: 'Glue here', at: { x: 0, y: 0 }, sizeMm: 4, rotationRad: 0 },
  };
}

const part = (id: string, features: Feature[]): Part => ({ id, name: id, quantity: 1, features });

function statusesOf(parts: Part[]) {
  const project: Project = { id: 'p', name: 'Test', settings: DEFAULT_SETTINGS, parts };
  const resolved = evaluate(project);
  const plan = planSheets(buildExportScene(resolved, project.name), DEFAULT_PAGE_SETUP);
  return { plan, statuses: printStatusOf(resolved, plan) };
}

describe('what of each part reaches paper (7.4b)', () => {
  it('names the sheet a part prints on, and a taped part its sheets', () => {
    const { plan, statuses } = statusesOf([
      part('panel', [outline('o1', 100, 70)]),
      part('strap', [outline('o2', 250, 20)]),
    ]);
    const panel = statuses.get('panel')!;
    expect(panel.sheets).toBe(plan.parts.get('panel'));
    expect(describePrintStatus(panel)).toEqual({ label: 'Sheet 1', note: null });
    expect(describePrintStatus(statuses.get('strap')!)).toEqual({
      label: 'Sheets 2–3, taped',
      note: null,
    });
  });

  it('says why a part does not print, and agrees with the plan that it does not', () => {
    const { plan, statuses } = statusesOf([
      part('empty', []),
      part('hidden', [outline('o1', 50, 50, false)]),
      part('broken', [outline('o2', 40, 40, false), impossibleStitchLine('s2', 'o2')]),
      part('words', [label('l3')]),
    ]);
    for (const id of ['empty', 'hidden', 'broken', 'words']) {
      expect(plan.parts.has(id), id).toBe(false);
      expect(statuses.get(id)!.sheets, id).toBeNull();
    }
    expect(statuses.get('empty')!.notPrinted).toBe('nothing-drawn');
    expect(statuses.get('hidden')!.notPrinted).toBe('hidden');
    expect(statuses.get('broken')!.notPrinted).toBe('problems');
    expect(statuses.get('words')!.notPrinted).toBe('nothing-to-cut');
    expect(describePrintStatus(statuses.get('hidden')!)).toEqual({
      label: 'Not printed',
      note: 'It is hidden.',
    });
    expect(describePrintStatus(statuses.get('words')!).note).toBe(
      'It has only words, no lines to cut.',
    );
  });

  it('counts what a printing part leaves off the paper', () => {
    const { statuses } = statusesOf([
      part('panel', [
        outline('o1', 100, 70),
        outline('o2', 50, 30, false),
        impossibleStitchLine('s1', 'o1'),
      ]),
    ]);
    const panel = statuses.get('panel')!;
    expect([panel.hiddenFeatures, panel.failedFeatures]).toEqual([1, 1]);
    expect(describePrintStatus(panel)).toEqual({
      label: 'Sheet 1',
      note: "1 hidden feature and 1 feature with a problem aren't printed.",
    });
  });

  it('covers every part, in document order', () => {
    const { statuses } = statusesOf([part('a', []), part('b', [outline('o', 10, 10)])]);
    expect([...statuses.keys()]).toEqual(['a', 'b']);
  });
});
