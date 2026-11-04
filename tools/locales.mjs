// Node 24 strips the shared TypeScript directly; the script suppresses only its
// module-type detection notice for the Electron package, whose main stays CJS.
import { readFileSync, readdirSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';

import { catalogueCoverage, flatten } from '../apps/desktop/src/shared/catalogue.ts';

const directory = new URL('../apps/desktop/src/locales/', import.meta.url);
const source = readFileSync(new URL('en.json', directory), 'utf8');
const files = readdirSync(directory)
  .filter((name) => name.endsWith('.json'))
  .sort();
const review = process.argv[2] === '--review' ? process.argv[3] : undefined;

if (review !== undefined) {
  if (!files.includes(`${review}.json`)) throw new Error(`Unknown catalogue: ${review}`);
  const own = flatten(JSON.parse(readFileSync(new URL(`${review}.json`, directory), 'utf8')));
  const english = flatten(JSON.parse(source));
  const cell = (value) =>
    String(value ?? '—')
      .replaceAll('|', '\\|')
      .replaceAll('\n', '<br>');
  console.log(`| Key | English | ${review} |\n|---|---|---|`);
  for (const key of [...new Set([...Object.keys(english), ...Object.keys(own)])].sort()) {
    const base = key.replace(/_(zero|one|two|few|many|other)$/, '');
    console.log(
      `| ${cell(key)} | ${cell(english[key] ?? english[`${base}_other`])} | ${cell(own[key])} |`,
    );
  }
} else {
  console.log(`Catalogues: ${fileURLToPath(directory).split('/').slice(-4, -1).join('/')}`);
  for (const name of files) {
    const tag = name.slice(0, -5);
    const report = catalogueCoverage(tag, readFileSync(new URL(name, directory), 'utf8'), source);
    const percentage = ((report.translated / report.total) * 100).toFixed(1);
    console.log(
      `\n${tag}: ${report.translated}/${report.total} translated; ${report.missing.length} missing (${percentage} %)`,
    );
    try {
      console.log(
        `Plural forms: ${new Intl.PluralRules(tag).resolvedOptions().pluralCategories.join(', ')}`,
      );
    } catch {
      console.log('Plural forms: unavailable (invalid locale tag)');
    }
    console.log(`Missing: ${report.missing.join(', ') || 'none'}`);
    console.log(`Structural errors: ${report.mistakes.join('; ') || 'none'}`);
  }
}
