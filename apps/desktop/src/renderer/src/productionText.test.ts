import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { setFeatureVisible, setPartVisible } from '@leathercad/document';
import { evaluate, productionSummary, type Project } from '@leathercad/domain';
import { loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { productionRows, productionSheet, productionText } from './productionText.js';

/**
 * The production summary on the shipped templates (9.12): the numbers the
 * seams-and-manufacturing spec §10 gives the card holder, as the app words them.
 */

const english = createI18n('en');

function template(id: string): Project {
  const file = resolve(import.meta.dirname, `../../../../../fixtures/projects/${id}.lcp`);
  return loadProject(new Uint8Array(readFileSync(file))).project;
}

const summaryOf = (project: Project) => productionSummary(evaluate(project));

describe('the card holder', () => {
  const project = template('card-holder');
  const summary = summaryOf(project);

  it('is three pieces to cut — the outer once, the pocket twice — with no hardware', () => {
    expect(summary.pieces.map((p) => [p.name, p.quantity])).toEqual([
      ['Outer', 1],
      ['Pocket', 2],
    ]);
    expect(summary.toCut).toBe(3);
    expect(summary.hardware).toEqual([]);
  });

  it('punches 86 holes in the outer and 49 in each pocket', () => {
    expect(summary.pieces.map((p) => p.holes)).toEqual([86, 49]);
    expect(summary.holes).toBe(86 + 2 * 49);
  });

  it('takes about 1.3 m of thread when the pockets are sewn to the outer, 2.8 m when not', () => {
    expect(summary.stitchingMm).toBeCloseTo(324.28, 1);
    expect(summary.threadMm).toBe(1300);
    const unsewn = summaryOf({ ...project, seams: [] });
    expect(unsewn.stitchingMm).toBeCloseTo(324.28 + 2 * 180.84, 1);
    expect(unsewn.threadMm).toBe(2800);
  });

  it('needs about 173 cm² of leather, net', () => {
    expect(summary.leatherMm2 / 100).toBeCloseTo(172.58, 1);
  });

  it('says so in words, an estimate as an estimate, and copies exactly those words', () => {
    const rows = productionRows(summary, english);
    expect(productionText('Card holder', rows, english)).toBe(
      [
        'Card holder: production',
        'To cut: 3',
        '  Outer ×1, 86 holes',
        '  Pocket ×2, 49 holes',
        'Holes to punch: 184',
        'Hardware: None',
        'Thread: about 1.3 m',
        '  An estimate: 4 × 324 mm of stitching, rounded up to the next 10 cm.',
        'Leather, net: about 173 cm² (1.73 dm²)',
        '  Net of cut-outs, not what to buy: waste, grain and flaws are yours to allow.',
      ].join('\n'),
    );
  });

  it('shows four figures at a glance, the long words kept for tooltips', () => {
    const { figures } = productionSheet(summary, english);
    expect(figures.map((f) => [f.id, f.value, f.caption])).toEqual([
      ['pieces', '3', 'pieces'],
      ['holes', '184', 'holes'],
      ['thread', '1.3 m', 'thread'],
      ['leather', '1.7', 'dm²'],
    ]);
    expect(figures.find((f) => f.id === 'thread')?.tip).toBe(
      'An estimate: 4 × 324 mm of stitching, rounded up to the next 10 cm.',
    );
  });

  it('lists each piece once with how many to cut, and no hardware', () => {
    const sheet = productionSheet(summary, english);
    expect(sheet.cutList).toEqual([
      { name: 'Outer', quantity: '×1', mirrored: null },
      { name: 'Pocket', quantity: '×2', mirrored: null },
    ]);
    expect(sheet.hardware).toEqual([]);
  });
});

describe('the bifold wallet', () => {
  const project = template('bifold-wallet');
  const summary = summaryOf(project);

  it('cuts 4 pieces and punches 146 + 52 ×2 holes', () => {
    expect(summary.toCut).toBe(4);
    expect(summary.holes).toBe(146 + 2 * 52);
    expect(summary.pieces.map((p) => [p.name, p.quantity])).toEqual([
      ['Outer', 1],
      ['Lining', 1],
      ['Card pocket', 2],
    ]);
  });

  it('threads every hole set once, a card pocket twice', () => {
    expect(summary.stitchingMm).toBeCloseTo(562.57 + 2 * 195, 1);
    expect(summary.threadMm).toBe(3900);
  });

  it('leaves a hidden piece out of what is cut and punched, since it does not print', () => {
    const hidden = summaryOf(setPartVisible('pocket', false).apply({ project }).project);
    expect(hidden.toCut).toBe(2);
    expect(hidden.holes).toBe(146);
  });

  it('leaves out a hidden hole set on a piece that prints', () => {
    const hidden = summaryOf(setFeatureVisible(['outer-holes'], false).apply({ project }).project);
    expect(hidden.toCut).toBe(4);
    expect(hidden.holes).toBe(2 * 52);
  });

  it('takes the lining’s two cut-outs out of its leather', () => {
    const lining = summary.pieces.find((p) => p.name === 'Lining');
    expect(lining?.areaMm2).toBeCloseTo(18978.5 - 2 * 190.1, 0);
  });
});

describe('the key fob', () => {
  it('buys one rivet for the pair of holes that meet across its fold', () => {
    const summary = summaryOf(template('key-fob'));
    expect(summary.hardware).toEqual([
      { hardwareType: 'rivet', diameterMm: 4, holes: 2, pieces: 1 },
    ]);
  });

  it('lists that rivet under the cut list, the pair across the fold named', () => {
    const sheet = productionSheet(summaryOf(template('key-fob')), english);
    expect(sheet.hardware).toEqual([
      productionRows(summaryOf(template('key-fob')), english)[2]?.details[0],
    ]);
    expect(sheet.hardware[0]).toContain('Ø 4 mm');
  });
});

describe('the card holder with its pockets cut as a mirrored pair (Q21)', () => {
  const project = template('card-holder');
  const paired: Project = {
    ...project,
    parts: project.parts.map((part) =>
      part.name === 'Pocket' ? { ...part, mirroredPair: true as const } : part,
    ),
  };
  const summary = summaryOf(paired);

  it('still cuts three pieces and punches as many holes', () => {
    expect(summary.toCut).toBe(3);
    expect(summary.holes).toBe(86 + 2 * 49);
  });

  it('says the pocket is 1 + 1 mirrored', () => {
    const pieces = productionRows(summary, english).find((row) => row.id === 'pieces');
    expect(pieces?.details).toEqual(['Outer ×1, 86 holes', 'Pocket 1 + 1 mirrored, 49 holes']);
  });

  it('marks the pocket mirrored in the cut list, still two to cut', () => {
    const pocket = productionSheet(summary, english).cutList[1];
    expect(pocket).toEqual({ name: 'Pocket', quantity: '×2', mirrored: '1 + 1 mirrored' });
  });
});
