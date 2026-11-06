/** A language's messages, by dotted path. */
export type Catalogue = Readonly<Record<string, string>>;

/** A catalogue file's nesting, flattened to dotted paths. */
export function flatten(
  tree: unknown,
  prefix = '',
  // Every JSON key must survive flattening, including JavaScript's __proto__.
  into: Record<string, string> = Object.create(null) as Record<string, string>,
): Catalogue {
  if (typeof tree !== 'object' || tree === null) return into;
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') into[`${prefix}${key}`] = value;
    else flatten(value, `${prefix}${key}.`, into);
  }
  return into;
}

const PLURAL = /^(.*)_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

function placeholders(text: string): Set<string> {
  return new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? ''));
}

/** A catalogue's keys, a plural as its key without the form, with the forms it has. */
function messages(catalogue: Catalogue): Map<string, Map<string, string>> {
  const found = new Map<string, Map<string, string>>();
  for (const [path, text] of Object.entries(catalogue)) {
    const plural = PLURAL.exec(path);
    const key = plural === null ? path : (plural[1] ?? '');
    const forms = found.get(key) ?? new Map<string, string>();
    forms.set(plural === null ? '' : (plural[2] ?? ''), text);
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

/** One language's file against English: its mistakes, and the keys it has not translated yet. */
export function checkCatalogue(
  tag: string,
  text: string,
  sourceText: string,
): { mistakes: string[]; missing: string[] } {
  const wrong = (mistake: string) => ({ mistakes: [mistake], missing: [] });
  let tree: unknown;
  try {
    tree = JSON.parse(text);
  } catch (error) {
    return wrong(`is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const found: string[] = notWords(tree).map((path) => `${path || 'the file'}: is not words`);

  if (!isLanguageTag(tag)) {
    return wrong(`${tag}.json is not named by a language tag, such as pl or pt-BR`);
  }
  const categories: readonly string[] = new Intl.PluralRules(tag).resolvedOptions()
    .pluralCategories;

  const source = messages(flatten(JSON.parse(sourceText)));
  const own = messages(flatten(tree));
  const sourceTree: unknown = JSON.parse(sourceText);
  function groups(value: unknown, reference: unknown, prefix = ''): void {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
    for (const [name, child] of Object.entries(value)) {
      if (typeof child !== 'object' || child === null || Array.isArray(child)) continue;
      const path = `${prefix}${name}`;
      const expected =
        typeof reference === 'object' && reference !== null
          ? (Object.getOwnPropertyDescriptor(reference, name)?.value as unknown)
          : undefined;
      if (typeof expected !== 'object' || expected === null)
        found.push(`${path}: English has no such group`);
      else groups(child, expected, `${path}.`);
    }
  }
  groups(tree, sourceTree);

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
      // Components split some messages on the exact `{{name}}`, so spacing inside one shows raw.
      if (
        /\{\{|\}\}/.test(value.replaceAll(PLACEHOLDER, '')) ||
        /\{\{\{|\}\}\}|\{\{\s|\s\}\}/.test(value)
      )
        found.push(`${where}: malformed placeholder`);
      // A backslash is only ever a character shown literally; one more than English is an escape gone wrong.
      const reference = english.get(form) ?? english.get('other') ?? '';
      const slashes = (text: string): number => text.split('\\').length - 1;
      if (slashes(value) !== slashes(reference))
        found.push(
          `${where}: has ${String(slashes(value))} backslashes, and English has ${String(slashes(reference))}`,
        );
      if (/[\uD800-\uDFFF\uFFFD]/u.test(value)) found.push(`${where}: invalid Unicode`);
      const used = placeholders(value);
      for (const name of used)
        if (!allowed.has(name)) found.push(`${where}: English has no {{${name}}}`);
      for (const name of required)
        if (!used.has(name)) found.push(`${where}: {{${name}}} is missing`);
    }
  }
  return { mistakes: found, missing: [...source.keys()].filter((key) => !own.has(key)) };
}

/** Logical-message coverage; English copies remain untranslated, even with different spacing. */
export function catalogueCoverage(
  tag: string,
  text: string,
  sourceText: string,
): {
  total: number;
  translated: number;
  missing: string[];
  mistakes: string[];
} {
  const { mistakes } = checkCatalogue(tag, text, sourceText);
  const source = messages(flatten(JSON.parse(sourceText)));
  let own: ReturnType<typeof messages>;
  try {
    own = messages(flatten(JSON.parse(text)));
  } catch {
    own = new Map();
  }
  const missing: string[] = [];
  for (const [key, english] of source) {
    const forms = own.get(key);
    const invalid = mistakes.some(
      (mistake) => mistake.startsWith(`${key}:`) || mistake.startsWith(`${key}_`),
    );
    // French typography uses nonbreaking spaces. Spacing alone is not a translation.
    const englishWords = new Set([...english.values()].map((value) => value.replace(/\s/gu, '')));
    const copy =
      forms !== undefined &&
      [...forms.values()].some((value) => englishWords.has(value.replace(/\s/gu, '')));
    if (forms === undefined || invalid || (tag !== 'en' && copy)) missing.push(key);
  }
  return { total: source.size, translated: source.size - missing.length, missing, mistakes };
}
