import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SOURCE_LOCALE, flatten, type Catalogue } from '../shared/i18n.js';

/**
 * The check a translation has to pass (ADR 0018): `pnpm test locales`.
 *
 * Every file here is held to the English one, which is the source. Whatever
 * this finds is a mistake in the file, named with its key:
 *
 * - a key English lacks: misspelt, or one English no longer has;
 * - a key English has and the file lacks — it would show in English;
 * - a placeholder English does not have, or one it has that is missing, so a
 *   name or a number would not be shown;
 * - a plural without every form the language has, or with one it has not;
 * - a value that is not words.
 */

const HERE = import.meta.dirname;

/** Every catalogue file, read as a contributor wrote it: the raw JSON. */
const FILES = readdirSync(HERE)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({
    tag: name.slice(0, -'.json'.length),
    text: readFileSync(join(HERE, name), 'utf8'),
  }));

const PLURAL = /^(.*)_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

function placeholders(text: string): Set<string> {
  return new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]!));
}

/** A catalogue's keys, a plural as its key without the form, with the forms it has. */
function messages(catalogue: Catalogue): Map<string, Map<string, string>> {
  const found = new Map<string, Map<string, string>>();
  for (const [path, text] of Object.entries(catalogue)) {
    const plural = PLURAL.exec(path);
    const key = plural === null ? path : plural[1]!;
    const forms = found.get(key) ?? new Map<string, string>();
    forms.set(plural === null ? '' : plural[2]!, text);
    found.set(key, forms);
  }
  return found;
}

/** Every value in a parsed file that is neither words nor a group of them. */
function notWords(tree: unknown, prefix = ''): string[] {
  if (typeof tree !== 'object' || tree === null || Array.isArray(tree))
    return [prefix.slice(0, -1)];
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? value.trim() === ''
        ? [`${prefix}${key}`]
        : []
      : notWords(value, `${prefix}${key}.`),
  );
}

/** A tag written as BCP 47 writes it, naming a language `Intl` knows. */
function isLanguageTag(tag: string): boolean {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
    return Intl.getCanonicalLocales(tag)[0] === tag && names.of(tag) !== undefined;
  } catch {
    return false;
  }
}

/** What is wrong with one language's file, against English. Empty when nothing is. */
function checkCatalogue(tag: string, text: string, sourceText: string): string[] {
  let tree: unknown;
  try {
    tree = JSON.parse(text);
  } catch (error) {
    return [`is not valid JSON: ${error instanceof Error ? error.message : String(error)}`];
  }
  const found: string[] = notWords(tree).map((path) => `${path || 'the file'}: is not words`);

  if (!isLanguageTag(tag))
    return [`${tag}.json is not named by a language tag, such as pl or pt-BR`];
  const categories = new Intl.PluralRules(tag).resolvedOptions().pluralCategories;

  const source = messages(flatten(JSON.parse(sourceText)));
  const own = messages(flatten(tree));

  for (const [key, forms] of own) {
    const english = source.get(key);
    if (english === undefined) {
      found.push(`${key}: English has no such key`);
      continue;
    }
    const isPlural = !english.has('');
    const allowed = new Set([...english.values()].flatMap((form) => [...placeholders(form)]));
    // A plural's count may be left out of a form — "one hole" — but a name may not.
    const required = new Set([...allowed].filter((name) => !isPlural || name !== 'count'));

    if (isPlural) {
      for (const category of categories) {
        if (!forms.has(category))
          found.push(`${key}_${category}: missing, and ${tag} has this form`);
      }
    }
    for (const [form, value] of forms) {
      const where = form === '' ? key : `${key}_${form}`;
      if (isPlural !== (form !== '')) {
        found.push(
          `${where}: ${isPlural ? 'English has this as a plural' : 'English has no plural here'}`,
        );
        continue;
      }
      if (isPlural && !categories.includes(form))
        found.push(`${where}: ${tag} has no ${form} form`);
      const used = placeholders(value);
      for (const name of used)
        if (!allowed.has(name)) found.push(`${where}: English has no {{${name}}}`);
      for (const name of required)
        if (!used.has(name)) found.push(`${where}: {{${name}}} is missing`);
    }
  }
  for (const key of source.keys()) {
    if (!own.has(key)) found.push(`${key}: missing`);
  }
  return found;
}

const english = FILES.find((file) => file.tag === SOURCE_LOCALE)!.text;

describe('every translation', () => {
  it.each(FILES.map((file) => [file.tag, file.text] as const))(
    '%s has what English has, and nothing it does not',
    (tag, text) => {
      expect(checkCatalogue(tag, text, english)).toEqual([]);
    },
  );
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
  const check = (tree: unknown): string[] => checkCatalogue('pl', JSON.stringify(tree), source);

  it('passes a complete translation, a count left out of a form included', () => {
    expect(check(good)).toEqual([]);
  });

  it('finds a key English lacks, and one the file lacks', () => {
    const { greeting: _left, ...missing } = good;
    expect(check({ ...missing, greting: 'Cześć, {{name}}' })).toEqual([
      'greting: English has no such key',
      'greeting: missing',
    ]);
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
    expect(checkCatalogue('pl', '{', source)[0]).toMatch(/^is not valid JSON/);
    expect(checkCatalogue('polish', JSON.stringify(good), source)).toEqual([
      'polish.json is not named by a language tag, such as pl or pt-BR',
    ]);
    expect(checkCatalogue('pt_BR', JSON.stringify(good), source)).toEqual([
      'pt_BR.json is not named by a language tag, such as pl or pt-BR',
    ]);
  });
});
