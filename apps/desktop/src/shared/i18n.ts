import en from '../locales/en.json';

/**
 * The interface's words, in the maker's language (ADR 0018).
 *
 * One catalogue per language, as JSON in `src/locales/`, named by its BCP 47
 * tag: `en.json`, `pl.json`, `pt-BR.json`. English is the source — every key
 * exists in it — and any other language falls back to it key by key.
 *
 * **A file is a translation, not a language LeatherCAD supports.** The
 * languages the app offers are the project's: `SUPPORTED_LANGUAGES`, below,
 * reviewed and added one by one. A file waiting for that is shown only by a
 * development build, as a preview, so it can be tried in the app.
 *
 * The files are i18next's JSON v4, so translation tools read them as they are:
 * nested keys, `{{name}}` placeholders, and a plural as one key per CLDR form —
 * `_one`, `_few`, `_many`, `_other` — chosen by `Intl.PluralRules`. Keys are
 * typed from the English file, so a key that does not exist does not compile;
 * `src/locales/locales.test.ts` holds every other file to the English one.
 *
 * Only the application speaks a language. The document, its file and every
 * package below the app report what happened as facts — a problem code, an
 * undo step's action — and the words are chosen here. A project opens the same
 * in every language.
 */

/** The language every key exists in, and the one any other falls back to. */
export const SOURCE_LOCALE = 'en';

/** The language preference that follows the operating system. */
export const SYSTEM_LANGUAGE = 'system';

type Leaf<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaf<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

type WithoutPlural<K extends string> = K extends `${infer Base}_${Intl.LDMLPluralRule}` ? Base : K;

/** Every message, by its dotted path; a plural by its key without the form. */
export type MessageKey = WithoutPlural<Leaf<typeof en>>;

/** What a message fills its `{{placeholders}}` with. A number is written as the language writes it. */
export type Params = Readonly<Record<string, string | number>>;

export type Translate = (key: MessageKey, params?: Params) => string;

/** A language's messages, by dotted path. */
export type Catalogue = Readonly<Record<string, string>>;

/** The interface in one language. */
export interface I18n {
  /**
   * A BCP 47 tag: the catalogue's language, in the system's regional form when
   * the system speaks it — `en-GB` on a British system. For `Intl` and for
   * the document's `lang`.
   */
  readonly locale: string;
  readonly t: Translate;
  /** Items joined as this language joins them: `a, b and c`, or `a, b, c` for a unit list. */
  readonly list: (items: readonly string[], type?: Intl.ListFormatType) => string;
}

/** A catalogue file's nesting, flattened to dotted paths. */
export function flatten(tree: unknown, prefix = '', into: Record<string, string> = {}): Catalogue {
  if (typeof tree !== 'object' || tree === null) return into;
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') into[`${prefix}${key}`] = value;
    else flatten(value, `${prefix}${key}.`, into);
  }
  return into;
}

/** A language the maker can choose. */
export interface Language {
  /** Its BCP 47 tag, which names its file: `pl` for `pl.json`. */
  readonly tag: string;
  /** Its name in itself, as Settings lists it: `Polski`, `Deutsch`. */
  readonly name: string;
  /** The file's contents. */
  readonly messages: unknown;
  /** Not supported yet: a translation file a development build shows to try. */
  readonly preview?: true;
}

/**
 * The languages LeatherCAD supports (ADR 0018): the only ones a release offers
 * in Settings, follows the system into, or carries. Owned by the project —
 * a translation file alone is not one of them. A language joins when its file
 * has been reviewed and passes `pnpm test locales` with nothing missing: one
 * entry here, and its file imported above.
 */
export const SUPPORTED_LANGUAGES: readonly Language[] = [
  { tag: 'en', name: 'English', messages: en },
];

/**
 * Every translation file, in a development build (`pnpm dev`) only, so a
 * translator can try theirs in the app before it is supported. A production
 * build replaces this with nothing, so it neither lists nor carries them.
 */
const TRANSLATIONS: Readonly<Record<string, unknown>> = import.meta.env.DEV
  ? import.meta.glob<unknown>('../locales/*.json', { eager: true, import: 'default' })
  : {};

/** The translation files not supported yet, as previews, named by `Intl`. */
export function previewsOf(
  files: Readonly<Record<string, unknown>>,
  supported: readonly Language[],
): Language[] {
  return Object.entries(files)
    .map(([path, messages]) => ({
      tag: path.slice(path.lastIndexOf('/') + 1, -'.json'.length),
      messages,
    }))
    .filter(({ tag }) => !supported.some((language) => language.tag === tag))
    .map(({ tag, messages }) => ({
      tag,
      name: languageName(tag, tag, true),
      messages,
      preview: true,
    }));
}

/** The languages the maker can choose here: the supported ones, then any previews. */
export const LANGUAGES: readonly Language[] = [
  ...SUPPORTED_LANGUAGES,
  ...previewsOf(TRANSLATIONS, SUPPORTED_LANGUAGES),
];

/** The languages' messages, by tag. */
export const CATALOGUES: Readonly<Record<string, Catalogue>> = Object.fromEntries(
  LANGUAGES.map((language) => [language.tag, flatten(language.messages)]),
);

/** Whether this is something `preferences.json` may hold as the language. */
export function isLanguagePreference(value: unknown): value is string {
  return (
    value === SYSTEM_LANGUAGE ||
    (typeof value === 'string' && LANGUAGES.some((language) => language.tag === value))
  );
}

/** The catalogue for a tag: the tag itself, or its language — `en` for `en-GB`. */
export function catalogueFor(
  tag: string,
  catalogues: Readonly<Record<string, Catalogue>> = CATALOGUES,
): string | undefined {
  if (Object.hasOwn(catalogues, tag)) return tag;
  const language = tag.split('-')[0] ?? '';
  return Object.hasOwn(catalogues, language) ? language : undefined;
}

/**
 * The interface's locale (ADR 0018): the chosen language if it is offered,
 * or — following the system — the first of the system's languages that is, or
 * English. Written in the system's regional form when the system speaks that
 * language, so a British system gets English with its own dates.
 *
 * `systemLanguages` is what Electron's `app.getPreferredSystemLanguages()`
 * returns, most preferred first. A tag it cannot read — a POSIX `C`, an
 * `en_GB.UTF-8` — is read as far as it can be, and skipped otherwise.
 */
export function resolveLocale(
  preference: string,
  systemLanguages: readonly string[],
  catalogues: Readonly<Record<string, Catalogue>> = CATALOGUES,
): string {
  const system = systemLanguages.flatMap(canonical);
  const wanted = preference === SYSTEM_LANGUAGE ? system : [preference];
  const language =
    wanted.map((tag) => catalogueFor(tag, catalogues)).find((found) => found !== undefined) ??
    SOURCE_LOCALE;
  return system.find((tag) => catalogueFor(tag, catalogues) === language) ?? language;
}

function canonical(tag: string): string[] {
  try {
    return Intl.getCanonicalLocales(tag.replace(/\..*$/, '').replaceAll('_', '-'));
  } catch {
    return [];
  }
}

/**
 * The interface in `locale`'s language.
 *
 * A message missing from that language's file is the English one — a new
 * string the translators have not reached yet reads in English, never as a
 * key. A plural is the form `Intl.PluralRules` picks for `params.count`, or
 * `_other` if the file lacks that form. A placeholder with nothing to fill it
 * is left as written, so the mistake shows.
 */
export function createI18n(
  locale: string,
  catalogues: Readonly<Record<string, Catalogue>> = CATALOGUES,
): I18n {
  const own = catalogues[catalogueFor(locale, catalogues) ?? SOURCE_LOCALE] ?? {};
  const source = catalogues[SOURCE_LOCALE] ?? {};
  const lookup = (key: string): string | undefined => own[key] ?? source[key];
  const plurals = new Intl.PluralRules(locale);
  const numbers = new Intl.NumberFormat(locale);

  const t: Translate = (key, params = {}) => {
    const count = params['count'];
    const text =
      (typeof count === 'number'
        ? (lookup(`${key}_${plurals.select(count)}`) ?? lookup(`${key}_other`))
        : undefined) ??
      lookup(key) ??
      key;
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name: string) => {
      const value = params[name];
      if (value === undefined) return whole;
      return typeof value === 'number' ? numbers.format(value) : value;
    });
  };

  return {
    locale,
    t,
    list: (items, type = 'conjunction') => new Intl.ListFormat(locale, { type }).format(items),
  };
}

/**
 * A language by name, as `inLocale` writes it in a sentence — by default in
 * itself: `Deutsch`, `polski` (`Intl.DisplayNames`). `asEntry` capitalises it
 * as a list entry, `Polski`, the way a maker finds their own language in a
 * list whatever the interface is in.
 */
export function languageName(tag: string, inLocale: string = tag, asEntry = false): string {
  const name = new Intl.DisplayNames([inLocale], { type: 'language' }).of(tag) ?? tag;
  return asEntry ? name.charAt(0).toLocaleUpperCase(inLocale) + name.slice(1) : name;
}
