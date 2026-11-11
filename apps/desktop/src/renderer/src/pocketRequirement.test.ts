import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EPS_LENGTH } from '@leathercad/core';
import {
  diagnose,
  evaluate,
  type Feature,
  type PocketRequirement,
  type Project,
} from '@leathercad/domain';
import { loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { choiceOf, outlineOf, standsProud, withChoice } from './pocketRequirement.js';

const shipped = (name: string): Project =>
  loadProject(
    readFileSync(resolve(import.meta.dirname, '../../../../../fixtures/projects', name + '.lcp')),
  ).project;

/** The template with its pocket's stitching saying what it holds. */
function holding(project: Project, holds: PocketRequirement): Project {
  return {
    ...project,
    parts: project.parts.map((part) => ({
      ...part,
      features: part.features.map((f) =>
        f.id === 'pocket-stitch' ? ({ ...f, holds } as Feature) : f,
      ),
    })),
  };
}
const card = (easeMm: number, fully = false): PocketRequirement => ({
  content: { kind: 'id-1' },
  easeMm,
  fully,
});

describe('the shipping pockets against a payment card (9.14b)', () => {
  it('flags the bifold and not the card holder for an ID-1 card with 4 mm ease', () => {
    const pocketProblems = (name: string) =>
      diagnose(holding(shipped(name), card(4)))
        .map((d) => d.problem.code)
        .filter((code) => code.startsWith('POCKET_'));
    expect(pocketProblems('card-holder')).toEqual([]);
    expect(pocketProblems('bifold-wallet')).toEqual(['POCKET_TOO_NARROW']);
  });

  it.each([
    // The template audit's figure: 53.98 − 44.3487 mm from the bottom stitching to the opening.
    ['card-holder', 9.6313],
    // 53 mm of stitching stopping 4 mm under the square opening: the card goes in 3.02 mm below it.
    ['bifold-wallet', -3.02],
  ])('reads how far a card in the %s stands above its opening', (name, expected) => {
    const project = holding(shipped(name), card(0));
    const part = evaluate(project).parts.find((p) => p.part.id === 'pocket');
    const stitch = part?.features.find((f) => f.feature.id === 'pocket-stitch');
    if (stitch?.ok !== true) throw new Error('the shipping pocket stitching must resolve');
    const proud = standsProud(stitch.path, outlineOf(part), card(0));
    expect(Math.abs((proud ?? Infinity) - expected)).toBeLessThanOrEqual(EPS_LENGTH);
  });
});

describe('the Holds menu', () => {
  it('starts a requirement with the ease from My tools, or none, and not held fully', () => {
    expect(withChoice('id-1', undefined, 4)).toEqual(card(4));
    expect(withChoice('id-1', undefined, null)).toEqual(card(0));
  });

  it("keeps the maker's ease and fully when the content changes", () => {
    const typed = withChoice('size', card(2.5, true), 4);
    expect(typed).toEqual({
      content: { kind: 'size', widthMm: 85.6, heightMm: 53.98 },
      easeMm: 2.5,
      fully: true,
    });
    expect(withChoice('id-1', typed, 4)).toEqual(card(2.5, true));
  });

  it('takes the requirement away with Nothing stated', () => {
    expect(withChoice('none', card(4), 4)).toBeUndefined();
    expect(choiceOf(undefined)).toBe('none');
    expect(choiceOf(card(4))).toBe('id-1');
  });

  it('finds no opening without an outline to read it from', () => {
    expect(outlineOf(undefined)).toBeNull();
  });
});
