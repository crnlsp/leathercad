import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { EMPTY_SELECTION, partSelectionOf, selectionOf } from '@leathercad/document';
import type { Part } from '@leathercad/domain';
import { loadProject } from '@leathercad/persist';
import { describe, expect, it } from 'vitest';

import { createI18n } from '../../shared/i18n.js';
import { selectionAnnouncement } from './selectionWords.js';

const english = createI18n('en');
const { project } = loadProject(
  new Uint8Array(
    readFileSync(
      resolve(import.meta.dirname, '../../../../../fixtures/projects/bifold-wallet.lcp'),
    ),
  ),
);
const named = (name: string): Part => {
  const part = project.parts.find((entry) => entry.name === name);
  if (part === undefined) throw new Error(`The sample has no part named ${name}.`);
  return part;
};
const outerOf = (part: Part): string => {
  const outer = part.features.find((f) => f.kind === 'cut-contour' && f.role === 'outer');
  if (outer === undefined) throw new Error(`${part.name} has no outline.`);
  return outer.id;
};

describe('what the board says of its selection (X21)', () => {
  it('names the pieces picked by their headings', () => {
    const [first, second] = project.parts;
    if (first === undefined || second === undefined) throw new Error('The sample has two parts.');
    expect(selectionAnnouncement(project, partSelectionOf([first.id, second.id]), english)).toBe(
      `2 pieces selected: ${first.name} and ${second.name}`,
    );
  });

  it('says a piece whose outline is picked is that piece', () => {
    const pocket = named('Card pocket');
    expect(selectionAnnouncement(project, selectionOf([outerOf(pocket)]), english)).toBe(
      'Card pocket selected',
    );
  });

  it('counts features that are not outlines, and says which piece they are in', () => {
    const pocket = named('Card pocket');
    const others = pocket.features.filter((f) => f.id !== outerOf(pocket)).slice(0, 2);
    expect(selectionAnnouncement(project, selectionOf(others.map((f) => f.id)), english)).toBe(
      `${others.length} features selected in Card pocket`,
    );
  });

  it('says nothing for an empty selection or a guide', () => {
    expect(selectionAnnouncement(project, EMPTY_SELECTION, english)).toBe('');
    expect(selectionAnnouncement(project, { ...EMPTY_SELECTION, guide: 'g' }, english)).toBe('');
  });
});
