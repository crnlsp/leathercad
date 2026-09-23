import type { Feature, Project } from '@leathercad/domain';
import { DEFAULT_SETTINGS } from '@leathercad/domain';
import { describe, expect, it } from 'vitest';

import { LEGEND_NAMES, legendEntries } from './legend.js';

const base = { name: 'F', visible: true, locked: false } as const;
const drawn = { kind: 'path', path: { closed: true, segments: [] } } as const;
const derived = (sourceId: string) =>
  ({
    kind: 'derived',
    sourceId,
    op: { type: 'offset', distanceMm: 4, side: 'inward', run: { kind: 'whole' } },
  }) as const;

const outline = { ...base, id: 'o', kind: 'cut-contour', role: 'outer', source: drawn } as Feature;
const stitch = { ...base, id: 's', kind: 'stitch-line', source: derived('o') } as Feature;
const holes = {
  ...base,
  id: 'h',
  kind: 'stitch-hole-set',
  source: {
    kind: 'derived',
    sourceId: 's',
    op: { type: 'stitch-holes', pitchMm: 3.85, mode: 'fit-whole', corners: 'continuous' },
  },
} as Feature;
const fold = {
  ...base,
  id: 'f',
  kind: 'fold-line',
  direction: 'mountain',
  source: drawn,
} as Feature;

const project = (...features: Feature[]): Project => ({
  id: 'p',
  name: 'P',
  settings: DEFAULT_SETTINGS,
  parts: [{ id: 'part', name: 'Panel', quantity: 1, features }],
});

describe('the canvas legend', () => {
  it('lists what is drawn, in the marks’ order, with the link last', () => {
    expect(legendEntries(project(fold, holes, stitch, outline))).toEqual([
      'cut-edge',
      'stitch-line',
      'stitch-holes',
      'fold-mountain',
      'linked',
    ]);
  });

  it('lists nothing that is not drawn', () => {
    expect(legendEntries(project(outline, { ...fold, visible: false }))).toEqual(['cut-edge']);
    expect(legendEntries(project())).toEqual([]);
  });

  it('adds no link row for holes alone, which are always derived', () => {
    const drawnStitch = { ...stitch, source: drawn } as Feature;
    expect(legendEntries(project(outline, drawnStitch, holes))).not.toContain('linked');
  });

  it('names every row in the maker’s words', () => {
    expect(LEGEND_NAMES['cut-edge']).toBe('Outline');
    expect(LEGEND_NAMES['fold-valley']).toBe('Valley fold');
    expect(LEGEND_NAMES.measurement).toBe('Dimension');
  });
});
