import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { catalogueCoverage, checkCatalogue } from '../shared/catalogue.js';
import { SOURCE_LOCALE, SUPPORTED_LANGUAGES } from '../shared/i18n.js';

/** Every catalogue must be structurally sound; coverage is informational (ADR 0018). */

const HERE = import.meta.dirname;

/** Every catalogue file, read as a contributor wrote it: the raw JSON. */
const FILES = readdirSync(HERE)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({
    tag: name.slice(0, -'.json'.length),
    text: readFileSync(join(HERE, name), 'utf8'),
  }));

const english = FILES.find((file) => file.tag === SOURCE_LOCALE)!.text;
const supported = new Set(SUPPORTED_LANGUAGES.map((language) => language.tag));

describe('every translation', () => {
  it.each(FILES.map((file) => [file.tag, file.text] as const))(
    '%s has nothing English does not, and says it as English does',
    (tag, text) => {
      expect(checkCatalogue(tag, text, english).mistakes).toEqual([]);
    },
  );

  it('includes every language LeatherCAD supports', () => {
    for (const tag of supported) expect(FILES.map((file) => file.tag)).toContain(tag);
  });
});

describe('the check itself', () => {
  const source = JSON.stringify({
    greeting: 'Hello, {{name}}',
    group: { title: 'Title' },
    holes_one: '{{count}} hole on {{part}}',
    holes_other: '{{count}} holes on {{part}}',
  });
  const good = {
    greeting: 'Cześć, {{name}}',
    group: { title: 'Tytuł' },
    holes_one: 'jeden otwór na {{part}}',
    holes_few: '{{count}} otwory na {{part}}',
    holes_many: '{{count}} otworów na {{part}}',
    holes_other: '{{count}} otworu na {{part}}',
  };
  const check = (tree: unknown): string[] =>
    checkCatalogue('pl', JSON.stringify(tree), source).mistakes;

  it('passes a complete translation, a count left out of a form included', () => {
    expect(checkCatalogue('pl', JSON.stringify(good), source)).toEqual({
      mistakes: [],
      missing: [],
    });
  });

  it('finds a key English lacks, and lists one the file has not translated yet', () => {
    const { greeting: _left, ...partial } = good;
    expect(
      checkCatalogue('pl', JSON.stringify({ ...partial, greting: 'Cześć, {{name}}' }), source),
    ).toEqual({ mistakes: ['greting: English has no such key'], missing: ['greeting'] });
  });

  it('finds a placeholder misspelt, or left out', () => {
    expect(check({ ...good, greeting: 'Cześć, {{imie}}' })).toEqual([
      'greeting: English has no {{imie}}',
      'greeting: {{name}} is missing',
    ]);
    expect(check({ ...good, holes_few: '{{count}} otwory' })).toEqual([
      'holes_few: {{part}} is missing',
    ]);
  });

  it('finds a plural without a form the language has, or with one it has not', () => {
    const { holes_many: _left, ...partial } = good;
    expect(check({ ...partial, holes_two: '{{count}} otwory na {{part}}' })).toEqual([
      'holes_many: missing, and pl has this form',
      'holes_two: pl has no two form',
    ]);
  });

  it('finds a plural where English has none, and none where it has one', () => {
    expect(check({ ...good, greeting_one: 'Cześć, {{name}}' })).toContain(
      'greeting_one: English has no plural here',
    );
  });

  it('finds what is not words', () => {
    expect(check({ ...good, group: { title: '' } })).toContain('group.title: is not words');
    expect(check({ ...good, greeting: 3 })).toContain('greeting: is not words');
  });

  it('finds a file that is not JSON, or not named by a language tag', () => {
    expect(checkCatalogue('pl', '{', source).mistakes[0]).toMatch(/^is not valid JSON/);
    expect(checkCatalogue('polish', JSON.stringify(good), source).mistakes).toEqual([
      'polish.json is not named by a language tag, such as pl or pt-BR',
    ]);
    expect(checkCatalogue('pt_BR', JSON.stringify(good), source).mistakes).toEqual([
      'pt_BR.json is not named by a language tag, such as pl or pt-BR',
    ]);
  });
});

describe('non-blocking translation maintenance', () => {
  const english = JSON.stringify({
    title: 'Title',
    holes_one: '{{count}} hole',
    holes_other: '{{count}} holes',
  });

  it('does not count whitespace-only edits of English as translations', () => {
    const source = JSON.stringify({ title: 'Version {{version}}' });
    for (const title of [
      'Version\u00a0{{version}}',
      ' Version {{version}} ',
      'Version\u202f{{version}}',
    ]) {
      expect(catalogueCoverage('fr', JSON.stringify({ title }), source)).toEqual({
        total: 1,
        translated: 0,
        missing: ['title'],
        mistakes: [],
      });
    }
  });

  it.each(['fr', 'es'])('requires the %s million form when a family is translated', (tag) => {
    const own = JSON.stringify({ holes_one: '{{count}} trou', holes_other: '{{count}} trous' });
    expect(checkCatalogue(tag, own, english).mistakes).toContain(
      `holes_many: missing, and ${tag} has this form`,
    );
  });

  it('accepts a missing message and an entirely missing plural family for every supported language', () => {
    for (const { tag } of SUPPORTED_LANGUAGES) {
      if (tag === SOURCE_LOCALE) continue;
      expect(checkCatalogue(tag, '{}', english)).toEqual({
        mistakes: [],
        missing: ['title', 'holes'],
      });
    }
  });

  it('lets an English-only feature add messages without updating registered translations', () => {
    const source = JSON.stringify({ title: 'Title', newFeature: { label: 'New label' } });
    expect(checkCatalogue('pl', '{"title":"Tytuł"}', source)).toEqual({
      mistakes: [],
      missing: ['newFeature.label'],
    });
  });

  it('counts logical messages and English copies as untranslated', () => {
    const own = JSON.stringify({
      title: 'Title',
      holes_one: '{{count}} Loch',
      holes_other: '{{count}} Löcher',
    });
    expect(catalogueCoverage('de', own, english)).toEqual({
      total: 2,
      translated: 1,
      missing: ['title'],
      mistakes: [],
    });
  });

  it('does not count a malformed partial plural family as translated', () => {
    const report = catalogueCoverage('ru', '{"holes_one":"{{count}} отверстие"}', english);
    expect(report.translated).toBe(0);
    expect(report.missing).toEqual(['title', 'holes']);
    expect(report.mistakes).toContain('holes_few: missing, and ru has this form');
  });

  it('reports invalid JSON without making coverage reporting throw', () => {
    const report = catalogueCoverage('de', '{', english);
    expect(report.translated).toBe(0);
    expect(report.mistakes[0]).toMatch(/^is not valid JSON/);
  });

  it('rejects arrays, nulls, unknown groups and malformed placeholders', () => {
    for (const tree of [
      [],
      null,
      { title: [] },
      { title: null },
      { title: false },
      { typo: {} },
      { title: '{{name}' },
    ]) {
      expect(checkCatalogue('pl', JSON.stringify(tree), english).mistakes.length).toBeGreaterThan(
        0,
      );
    }
  });
});

it('does not count a plural family with one English copy as fully translated', () => {
  const source = JSON.stringify({ holes_one: '{{count}} hole', holes_other: '{{count}} holes' });
  const own = JSON.stringify({ holes_one: '{{count}} hole', holes_other: '{{count}} Löcher' });
  expect(catalogueCoverage('de', own, source).missing).toEqual(['holes']);
});

it('rejects damaged Unicode and triple-braced placeholders, while preserving Cyrillic and emoji', () => {
  const source = JSON.stringify({ title: 'Title' });
  for (const title of ['\uFFFD', '\uD800', '{{{name}}}']) {
    expect(checkCatalogue('ru', JSON.stringify({ title }), source).mistakes.length).toBeGreaterThan(
      0,
    );
  }
  expect(checkCatalogue('ru', JSON.stringify({ title: 'Проект 🧵' }), source).mistakes).toEqual([]);
});

it('rejects a spaced placeholder, which a component splitting on {{name}} would show raw', () => {
  const source = JSON.stringify({ title: 'Sort: {{sort}}' });
  expect(
    checkCatalogue('de', JSON.stringify({ title: 'Sortierung: {{ sort }}' }), source).mistakes,
  ).toEqual(['title: malformed placeholder']);
});

it('rejects a symbol list escaped differently from English, as a doubled backslash', () => {
  const source = JSON.stringify({ invalid: 'a character such as / \\ :' });
  expect(
    checkCatalogue('pl', JSON.stringify({ invalid: 'znak, np. / \\\\ :' }), source).mistakes,
  ).toEqual(['invalid: has 2 backslashes, and English has 1']);
  expect(
    checkCatalogue('pl', JSON.stringify({ invalid: 'znak, np. / \\ :' }), source).mistakes,
  ).toEqual([]);
});

it('rejects unknown keys even when JavaScript gives the property special meaning', () => {
  const source = JSON.stringify({ title: 'Title' });
  expect(checkCatalogue('pl', '{"__proto__":"Tytuł"}', source).mistakes).toContain(
    '__proto__: English has no such key',
  );
});
