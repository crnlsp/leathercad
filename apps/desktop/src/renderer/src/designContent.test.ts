import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { EMPTY_SELECTION, partSelectionOf, selectionOf } from '@leathercad/document';
import type { Vec2 } from '@leathercad/geometry';
import { loadProject } from '@leathercad/persist';
import { scaleAtZoomPercent, type ViewportView } from '@leathercad/render';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { designContent, type DesignInputs } from './designContent.js';

/**
 * `tools/perf-design.mjs`'s dense case: the audit's synthetic bag, fifty
 * 200 × 40 mm straps eight to a row, 220 mm and 60 mm apart (`bag(50)` in
 * `packages/domain/src/workloads.ts`, saved).
 */
const FIXTURE = resolve(import.meta.dirname, '../../../../../fixtures/perf/bag-50.lcp');
const bag = () => loadProject(new Uint8Array(readFileSync(FIXTURE))).project;
const english = createI18n('en');

/** The camera at a zoom, over a 1600 × 1000 board, `centreMm` in its middle. */
function camera(percent: number, centreMm: Vec2): ViewportView {
  return { centreMm, scale: scaleAtZoomPercent(percent, 1), widthPx: 1600, heightPx: 1000, dpr: 1 };
}

describe("the Design board's pattern (PERF-008)", () => {
  const project = bag();
  const inputs: DesignInputs = {
    project,
    selection: EMPTY_SELECTION,
    hovered: 'stitch-0',
    view: camera(100, { x: 100, y: 20 }),
    i18n: english,
  };

  it('is built once while the pointer moves over the board and nothing it shows changes', () => {
    const content = designContent();
    // Sixty pointer moves, one a frame, each frame reading the camera afresh.
    const frames = Array.from({ length: 60 }, () =>
      content({ ...inputs, view: { ...inputs.view, centreMm: { ...inputs.view.centreMm } } }),
    );
    expect(new Set(frames).size).toBe(1);
  });

  it('draws only what can reach the canvas when the camera is close on a few of fifty pieces', () => {
    // Zoomed out over the whole bag, every piece is on the canvas.
    const whole = designContent()({ ...inputs, view: camera(10, { x: 800, y: 180 }) }).items.length;
    // At 100 % the canvas shows 423 × 265 mm: six of the fifty straps, in two
    // columns of three rows.
    const close = designContent()(inputs).items.length;
    expect(close).toBeLessThanOrEqual(Math.ceil((whole * 8) / 50));
  });

  it('is what a board made just now draws, whatever changed', () => {
    const content = designContent();
    const renamed = { ...project, name: 'Renamed' };
    const changes: DesignInputs[] = [
      inputs,
      { ...inputs, hovered: 'cut-1' },
      { ...inputs, hovered: null },
      { ...inputs, selection: selectionOf(['holes-0']) },
      { ...inputs, selection: partSelectionOf(['part-7']) },
      { ...inputs, view: camera(100, { x: 140, y: 20 }) },
      { ...inputs, view: camera(400, { x: 140, y: 20 }) },
      { ...inputs, view: { ...camera(100, { x: 100, y: 20 }), dpr: 2 } },
      { ...inputs, project: renamed },
      { ...inputs, i18n: createI18n('pl') },
      inputs,
    ];
    for (const next of changes) {
      expect(content(next)).toEqual(designContent()(next));
    }
  });
});
