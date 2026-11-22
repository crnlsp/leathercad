import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EPS_LENGTH } from '@leathercad/core';
import {
  diagnose,
  evaluate,
  pocketOpening,
  type Feature,
  type PocketRequirement,
  type Project,
} from '@leathercad/domain';
import { loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { acrossVerdict, choiceOf, outlineOf, withChoice } from './pocketRequirement.js';

describe('acrossVerdict (U7)', () => {
  const i18n = createI18n('en');
  const card = (easeMm: number): PocketRequirement => ({
    content: { kind: 'id-1' },
    easeMm,
    fully: false,
  });

  it('says a card that fits fits, in one line, with what it was measured for', () => {
    expect(acrossVerdict(89, card(0), i18n)).toBe('Fits: 89 mm across for 85.6 mm, with no ease.');
    expect(acrossVerdict(89, card(3), i18n)).toBe('Fits: 89 mm across for 85.6 mm and 3 mm ease.');
  });

  it('says one that does not is too narrow, as Problems does', () => {
    expect(acrossVerdict(89, card(4), i18n)).toBe(
      'Too narrow: 89 mm across for 85.6 mm and 4 mm ease.',
    );
  });
});

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
    // The template audit's figure: 44.3487 mm from the bottom stitching to an opening 3 mm up.
    ['card-holder', 44.3487, 3],
    // 53 mm of stitching stopping 4 mm under the square opening.
    ['bifold-wallet', 57, 4],
  ])(
    'reads the %s pocket to its own piece’s edge, and how far above the stitch ends it is',
    (name, depthMm, riseMm) => {
      const part = evaluate(holding(shipped(name), card(0))).parts.find(
        (p) => p.part.id === 'pocket',
      );
      const stitch = part?.features.find((f) => f.feature.id === 'pocket-stitch');
      const outline = outlineOf(part);
      if (stitch?.ok !== true || outline === null)
        throw new Error('the shipping pocket must resolve');
      const opening = pocketOpening(stitch.path, outline);
      expect(Math.abs((opening?.depthMm ?? Infinity) - depthMm)).toBeLessThanOrEqual(EPS_LENGTH);
      expect(Math.abs((opening?.riseMm ?? Infinity) - riseMm)).toBeLessThanOrEqual(EPS_LENGTH);
    },
  );
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
