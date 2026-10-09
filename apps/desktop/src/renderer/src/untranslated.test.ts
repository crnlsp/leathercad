import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The audit that keeps every word on screen in the catalogue (ADR 0018): no
 * text written straight into the interface's JSX, and none in the attributes
 * that are read or heard — a label, a tooltip, a placeholder.
 *
 * Words belong in `src/locales/en.json`, where a translator finds them.
 * Symbols are not words: `×`, `↔`, `mm`, `°` and the product's name may be
 * written in place. A name is not text either — `{part.name}` is the maker's.
 */

const HERE = import.meta.dirname;

/** The attributes whose value a person reads or hears. */
const SAID = new Set([
  'alt',
  'aria-label',
  'aria-description',
  'empty',
  'hint',
  'label',
  'note',
  'placeholder',
  'suffix',
  'text',
  'title',
  'tooltip',
]);

/** Written in place in any language. */
const NOT_WORDS = new Set(['LeatherCAD', 'mm', 'cm²']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

/** Whether a piece of text holds a word someone would translate. */
function isWords(text: string): boolean {
  const trimmed = text.trim();
  return /\p{L}{2}/u.test(trimmed) && !NOT_WORDS.has(trimmed);
}

/** Every word written into a file's JSX, as `file:line text`. */
function untranslated(path: string, source = readFileSync(path, 'utf8')): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const at = (node: ts.Node, text: string): void => {
    const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    found.push(`${relative(HERE, path)}:${String(line)} ${JSON.stringify(text.trim())}`);
  };
  // Text an attribute's expression writes in place — a string, or a template's
  // fixed parts — but not what it hands to a function: `t('a.key')` is a key.
  const written = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (isWords(node.text)) at(node, node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      const text = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(
        '${…}',
      );
      if (isWords(text)) at(node, text);
      return;
    }
    ts.forEachChild(node, written);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && isWords(node.text)) at(node, node.text);
    if (
      ts.isJsxAttribute(node) &&
      node.initializer !== undefined &&
      SAID.has(node.name.getText())
    ) {
      if (ts.isStringLiteral(node.initializer)) {
        if (isWords(node.initializer.text)) at(node, node.initializer.text);
      } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        written(node.initializer.expression);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('the interface’s words', () => {
  it('are all in the catalogue, none written into the JSX', () => {
    expect(sources(HERE).flatMap((path) => untranslated(path))).toEqual([]);
  });

  it('would find a word written in place, and leave a symbol or a name', () => {
    const probe = join(HERE, 'probe.tsx');
    const jsx = `<p title="Delete it" aria-label={t('x')}>\n  Delete part {name} ×{count}\n  <kbd>mm</kbd>\n</p>`;
    expect(untranslated(probe, jsx)).toEqual([
      'probe.tsx:1 "Delete it"',
      'probe.tsx:2 "Delete part"',
    ]);
  });

  it('would find words in a said attribute’s expression, but not a key passed to t()', () => {
    // How the problem badge's tooltip stayed English (found in U.3).
    const probe = join(HERE, 'probe.tsx');
    const jsx =
      '<Tip text={title ?? `${count} problems, worst: ${worst}`} label={t(`tools.${id}.name`)}\n' +
      "  tooltip={open ? 'Hide it' : t('legend.show')} hint={name} />";
    expect(untranslated(probe, jsx)).toEqual([
      'probe.tsx:1 "${…} problems, worst: ${…}"',
      'probe.tsx:2 "Hide it"',
    ]);
  });
});
