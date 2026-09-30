import { describe, expect, it } from 'vitest';

import {
  CATALOGUES,
  LANGUAGES,
  SOURCE_LOCALE,
  SUPPORTED_LANGUAGES,
  SYSTEM_LANGUAGE,
  createI18n,
  flatten,
  isLanguagePreference,
  languageName,
  previewsOf,
  resolveLocale,
  type MessageKey,
} from './i18n.js';

/** Two languages, one with plural forms English does not have and a key it lacks. */
const CATALOGUES_UNDER_TEST = {
  en: flatten({
    greeting: 'Hello, {{name}}',
    holes_one: '{{count}} hole',
    holes_other: '{{count}} holes',
    only: 'English only',
  }),
  pl: flatten({
    greeting: 'Cześć, {{name}}',
    holes_one: '{{count}} otwór',
    holes_few: '{{count}} otwory',
    holes_many: '{{count}} otworów',
    holes_other: '{{count}} otworu',
  }),
};

// The test catalogues' keys are not the app's: typed through a cast, once.
const key = (name: string): MessageKey => name as MessageKey;

describe('a translation', () => {
  const pl = createI18n('pl-PL', CATALOGUES_UNDER_TEST);

  it('fills its placeholders', () => {
    expect(pl.t(key('greeting'), { name: 'Ola' })).toBe('Cześć, Ola');
  });

  it('picks the plural form the language uses for the count', () => {
    expect(pl.t(key('holes'), { count: 1 })).toBe('1 otwór');
    expect(pl.t(key('holes'), { count: 3 })).toBe('3 otwory');
    expect(pl.t(key('holes'), { count: 5 })).toBe('5 otworów');
    expect(pl.t(key('holes'), { count: 22 })).toBe('22 otwory');
    expect(pl.t(key('holes'), { count: 1.5 })).toBe('1,5 otworu');
  });

  it('writes a number as the language writes it', () => {
    expect(createI18n('en', CATALOGUES_UNDER_TEST).t(key('holes'), { count: 1234 })).toBe(
      '1,234 holes',
    );
    expect(pl.t(key('holes'), { count: 1234 })).toBe('1234 otwory');
  });

  it('falls back to English, key by key, for what the language lacks', () => {
    expect(pl.t(key('only'))).toBe('English only');
  });

  it('falls back to the other form when the language lacks the one asked for', () => {
    const partial = { ...CATALOGUES_UNDER_TEST, pl: flatten({ holes_other: '{{count}} otworu' }) };
    expect(createI18n('pl', partial).t(key('holes'), { count: 5 })).toBe('5 otworu');
  });

  it('leaves a placeholder with nothing to fill it, so the mistake shows', () => {
    expect(pl.t(key('greeting'))).toBe('Cześć, {{name}}');
  });

  it('says the key itself for one that exists nowhere', () => {
    expect(pl.t(key('nowhere'))).toBe('nowhere');
  });

  it('is English for a language with no catalogue', () => {
    expect(createI18n('fr', CATALOGUES_UNDER_TEST).t(key('greeting'), { name: 'Anne' })).toBe(
      'Hello, Anne',
    );
  });

  it('joins a list as the language does', () => {
    const en = createI18n('en', CATALOGUES_UNDER_TEST);
    expect(en.list(['a', 'b'])).toBe('a and b');
    expect(en.list(['a', 'b', 'c'], 'unit')).toBe('a, b, c');
    expect(pl.list(['a', 'b'])).toBe('a i b');
  });
});

describe('the interface language', () => {
  const resolve = (preference: string, system: readonly string[]): string =>
    resolveLocale(preference, system, CATALOGUES_UNDER_TEST);

  it('follows the system to the first of its languages that ships', () => {
    expect(resolve(SYSTEM_LANGUAGE, ['fr-FR', 'pl-PL', 'en-US'])).toBe('pl-PL');
  });

  it('is English when none of the system’s languages ships', () => {
    expect(resolve(SYSTEM_LANGUAGE, ['fr-FR', 'de-DE'])).toBe('en');
    expect(resolve(SYSTEM_LANGUAGE, [])).toBe('en');
  });

  it('is the one chosen, whatever the system speaks', () => {
    expect(resolve('en', ['pl-PL'])).toBe('en');
    expect(resolve('pl', ['en-GB'])).toBe('pl');
  });

  it('keeps the system’s region when the system speaks the language', () => {
    expect(resolve('en', ['en-GB'])).toBe('en-GB');
    expect(resolve(SYSTEM_LANGUAGE, ['en-GB'])).toBe('en-GB');
  });

  it('reads a POSIX locale, and skips what it cannot read', () => {
    expect(resolve(SYSTEM_LANGUAGE, ['pl_PL.UTF-8'])).toBe('pl-PL');
    expect(resolve(SYSTEM_LANGUAGE, ['C', '', 'not a tag', 'pl'])).toBe('pl');
  });

  it('never takes an object’s own property names for a language', () => {
    expect(resolve('constructor', [])).toBe('en');
  });
});

describe('the languages LeatherCAD supports', () => {
  it('are the project’s registry, English first, each named in itself', () => {
    expect(SUPPORTED_LANGUAGES[0]).toMatchObject({ tag: SOURCE_LOCALE, name: 'English' });
    for (const language of SUPPORTED_LANGUAGES) {
      expect(language.preview).toBeUndefined();
      expect(CATALOGUES[language.tag]).toBeDefined();
    }
    expect(new Set(SUPPORTED_LANGUAGES.map((language) => language.tag)).size).toBe(
      SUPPORTED_LANGUAGES.length,
    );
  });

  it('come first among those offered, then only previews', () => {
    expect(LANGUAGES.slice(0, SUPPORTED_LANGUAGES.length)).toEqual(SUPPORTED_LANGUAGES);
    for (const language of LANGUAGES.slice(SUPPORTED_LANGUAGES.length)) {
      expect(language.preview).toBe(true);
    }
  });

  it('are what a preference may name, besides following the system', () => {
    expect(isLanguagePreference(SYSTEM_LANGUAGE)).toBe(true);
    for (const { tag } of LANGUAGES) expect(isLanguagePreference(tag)).toBe(true);
    expect(isLanguagePreference('xx')).toBe(false);
    expect(isLanguagePreference(1)).toBe(false);
  });

  it('do not grow by a file: a translation not in the registry is only a preview', () => {
    const files = {
      '../locales/en.json': { greeting: 'Hello' },
      '../locales/pl.json': { greeting: 'Cześć' },
      '../locales/pt-BR.json': { greeting: 'Olá' },
    };
    expect(previewsOf(files, SUPPORTED_LANGUAGES)).toEqual([
      { tag: 'pl', name: 'Polski', messages: { greeting: 'Cześć' }, preview: true },
      { tag: 'pt-BR', name: 'Português (Brasil)', messages: { greeting: 'Olá' }, preview: true },
    ]);
    // Supported, it is the registry's: its name and its place are the project's.
    const withPolish = [...SUPPORTED_LANGUAGES, { tag: 'pl', name: 'Polski', messages: {} }];
    expect(previewsOf(files, withPolish).map((language) => language.tag)).toEqual(['pt-BR']);
  });

  it('are named in themselves, and as a list entry', () => {
    expect(languageName('en')).toBe('English');
    expect(languageName('pl')).toBe('polski');
    expect(languageName('pl', 'pl', true)).toBe('Polski');
    expect(languageName('de', 'en')).toBe('German');
    expect(languageName('en', 'pl')).toBe('angielski');
  });
});
