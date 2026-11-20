import { emptyDocument } from '@leathercad/document';
import type { TemplateEntry } from '@leathercad/platform';
import { describe, expect, it } from 'vitest';

import { START_CARDS, startTemplates, templateName } from './startTemplates.js';
import type { TemplateChoice } from './TemplateDialog.js';

const project = emptyDocument('start').project;

function choice(id: string, of: Partial<TemplateEntry> = {}, loads = true): TemplateChoice {
  return {
    entry: {
      id,
      kind: id.startsWith('builtin:') ? 'builtin' : 'mine',
      name: id.replace(/^\w+:/, ''),
      created: null,
      changed: null,
      description: '',
      tags: [],
      pinned: false,
      usedAt: null,
      ...of,
    },
    project: loads ? project : null,
  };
}

const ids = (templates: readonly TemplateChoice[]): string[] =>
  startTemplates(templates).map((each) => each.entry.id);

describe('the start screen’s template cards (U.23)', () => {
  it('keep the library’s order when nothing is pinned or used', () => {
    expect(ids([choice('builtin:a'), choice('builtin:b'), choice('mine:c')])).toEqual([
      'builtin:a',
      'builtin:b',
      'mine:c',
    ]);
  });

  it('put the pinned first, then the last used, then the rest', () => {
    const list = [
      choice('builtin:a'),
      choice('builtin:b', { usedAt: 10 }),
      choice('mine:c', { usedAt: 20 }),
      choice('mine:d', { pinned: true }),
    ];
    expect(ids(list)).toEqual(['mine:d', 'mine:c', 'builtin:b', 'builtin:a']);
  });

  it('leave out a template that did not load: it could not be started from', () => {
    expect(ids([choice('mine:broken', {}, false), choice('builtin:a')])).toEqual(['builtin:a']);
  });

  it('are at most a few, so the blank project and the recent ones stay in view', () => {
    const many = Array.from({ length: START_CARDS + 3 }, (_, i) => choice(`mine:${String(i)}`));
    expect(startTemplates(many)).toHaveLength(START_CARDS);
  });
});

describe('a template’s name', () => {
  const t = (key: string): string => `«${key}»`;
  it('is the catalogue’s for a built-in one, the maker’s own for theirs', () => {
    expect(templateName(choice('builtin:key-fob').entry, t)).toBe('«templates.keyFob.name»');
    expect(templateName(choice('mine:Belt').entry, t)).toBe('Belt');
  });
});
