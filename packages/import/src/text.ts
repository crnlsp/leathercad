import { checkResourceLimit } from '@leathercad/core';
import { SvgImportError } from './numbers.js';

/**
 * An SVG file's bytes as text the platform's parser may see (ADR 0023,
 * steps 2–4). Bounded by length before anything reads them; decoded strictly,
 * UTF-8 unless a byte-order mark or the XML declaration names another
 * encoding; and refused if its entities reach outside the file, rewrite the
 * document type, refer to themselves, or would expand it past the ceiling —
 * which Chromium's parser, measured, takes seconds of a frozen window to
 * refuse on its own.
 */
export function svgText(bytes: Uint8Array): string {
  checkResourceLimit('svgBytes', bytes.length);
  let decoder: InstanceType<typeof TextDecoder>;
  try {
    decoder = new TextDecoder(encodingOf(bytes), { fatal: true });
  } catch {
    throw new SvgImportError('UNSUPPORTED_SVG');
  }
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    throw new SvgImportError('INVALID_SVG');
  }
  expandedLength(text);
  return text;
}

function encodingOf(bytes: Uint8Array): string {
  const [a, b, c] = bytes;
  if (a === 0xef && b === 0xbb && c === 0xbf) return 'utf-8';
  if (a === 0xff && b === 0xfe) return 'utf-16le';
  if (a === 0xfe && b === 0xff) return 'utf-16be';
  // The declaration is ASCII in any encoding it can name without a byte-order mark.
  const head = String.fromCharCode(...bytes.subarray(0, 256));
  return /^<\?xml\s[^>]*?\sencoding\s*=\s*["']([A-Za-z][\w.-]*)["']/.exec(head)?.[1] ?? 'utf-8';
}

/** A general entity reference; `&#…;` character references are not. */
const REFERENCE = /&([^\s#&;<>"'%=]+);/g;
const CHARACTER = /&#(?:(\d+)|x([\da-fA-F]+));/g;
const SPACE = /\s*/y;
/**
 * `<!ENTITY` is followed by its name, and a parameter entity's `%` before it.
 * Each run of space has one place to match, so a long one is read once, never
 * backtracked over: `\s+(%\s)?\s*` was quadratic in it (CodeQL js/polynomial-redos).
 */
const ENTITY_HEAD = /\s+(?:(%)\s+)?([^\s"'<>%&;]+)\s+/y;

/**
 * The document's length with every declared entity reference replaced by
 * its replacement text, computed from the declarations and a count of their
 * references, never by expanding them. Character and predefined references
 * count as written: an upper bound on what the parser builds. Throws as
 * `svgText` refuses.
 */
export function expandedLength(text: string): number {
  const doctype = documentType(text);
  if (doctype === null) return text.length;
  const sizes = sizesOf(doctype.entities);
  let total = text.length;
  for (const match of text.slice(doctype.end).matchAll(REFERENCE)) {
    const size = sizes.get(match[1] ?? '');
    if (size === undefined) continue;
    total += size - match[0].length;
    checkResourceLimit('svgExpandedBytes', total);
  }
  return total;
}

/** Each entity's expanded length, depth first without recursion: a chain may be long. */
function sizesOf(entities: ReadonlyMap<string, string>): Map<string, number> {
  const sizes = new Map<string, number>(),
    visiting = new Set<string>();
  const references = (value: string) =>
    [...value.matchAll(REFERENCE)].flatMap((m) =>
      m[1] !== undefined && entities.has(m[1]) ? [{ name: m[1], length: m[0].length }] : [],
    );
  for (const start of entities.keys()) {
    const stack = [start];
    for (let name = stack.at(-1); name !== undefined; name = stack.at(-1)) {
      if (sizes.has(name)) {
        stack.pop();
        continue;
      }
      const value = entities.get(name) ?? '';
      const refs = references(value);
      const pending = refs.filter((r) => !sizes.has(r.name));
      if (pending.length > 0) {
        // On the path from the start back to here: it would contain itself.
        if (pending.some((r) => visiting.has(r.name) || r.name === name))
          throw new SvgImportError('INVALID_SVG');
        visiting.add(name);
        stack.push(...pending.map((r) => r.name));
        continue;
      }
      let size = value.length;
      for (const r of refs) size += (sizes.get(r.name) ?? 0) - r.length;
      checkResourceLimit('svgExpandedBytes', size);
      sizes.set(name, size);
      visiting.delete(name);
      stack.pop();
    }
  }
  return sizes;
}

interface DocumentType {
  /** Each internal general entity's replacement text, character references replaced. */
  readonly entities: ReadonlyMap<string, string>;
  /** Where the document type declaration ends and the document's own text begins. */
  readonly end: number;
}

/**
 * The document type's internal subset, read as text. It may hold only
 * comments, processing instructions and internal general entities: an
 * external or parameter entity, an attribute default, or any other
 * declaration is refused, as nothing a pattern needs and everything an
 * attack does.
 */
function documentType(text: string): DocumentType | null {
  const skipSpace = (from: number): number => {
    SPACE.lastIndex = from;
    return from + (SPACE.exec(text)?.[0].length ?? 0);
  };
  const past = (from: number, close: string): number => {
    const at = text.indexOf(close, from);
    if (at < 0) throw new SvgImportError('INVALID_SVG');
    return at + close.length;
  };
  let i = 0;
  for (;;) {
    i = skipSpace(i);
    if (text.startsWith('<?', i)) i = past(i + 2, '?>');
    else if (text.startsWith('<!--', i)) i = past(i + 4, '-->');
    else break;
  }
  if (!text.startsWith('<!DOCTYPE', i)) return null;
  const entities = new Map<string, string>();
  // The name and external identifier, whose quoted literals may hold `[` or `>`.
  for (i += '<!DOCTYPE'.length; ; i++) {
    const c = text[i];
    if (c === undefined) throw new SvgImportError('INVALID_SVG');
    if (c === '"' || c === "'") i = past(i + 1, c) - 1;
    else if (c === '>') return { entities, end: i + 1 };
    else if (c === '[') break;
  }
  for (i++; ;) {
    i = skipSpace(i);
    if (text.startsWith(']', i)) {
      i = skipSpace(i + 1);
      if (text[i] !== '>') throw new SvgImportError('INVALID_SVG');
      return { entities, end: i + 1 };
    }
    if (text.startsWith('<!--', i)) i = past(i + 4, '-->');
    else if (text.startsWith('<?', i)) i = past(i + 2, '?>');
    else if (text.startsWith('<!ENTITY', i)) i = entity(text, i + '<!ENTITY'.length, entities);
    else if (text.startsWith('<!', i) || text.startsWith('%', i))
      throw new SvgImportError('UNSAFE_SVG');
    else throw new SvgImportError('INVALID_SVG');
  }
}

/** Reads one entity declaration into `entities`; returns where it ends. */
function entity(text: string, from: number, entities: Map<string, string>): number {
  ENTITY_HEAD.lastIndex = from;
  const head = ENTITY_HEAD.exec(text);
  if (head === null) throw new SvgImportError('INVALID_SVG');
  if (head[1] !== undefined) throw new SvgImportError('UNSAFE_SVG');
  const name = head[2] ?? '';
  let i = from + head[0].length;
  const quote = text[i];
  if (quote !== '"' && quote !== "'") {
    if (/^(?:SYSTEM|PUBLIC)\s/.test(text.slice(i, i + 7))) throw new SvgImportError('UNSAFE_SVG');
    throw new SvgImportError('INVALID_SVG');
  }
  const close = text.indexOf(quote, i + 1);
  if (close < 0) throw new SvgImportError('INVALID_SVG');
  const literal = text.slice(i + 1, close);
  i = close + 1;
  while (/\s/.test(text[i] ?? '')) i++;
  if (text[i] !== '>') throw new SvgImportError('INVALID_SVG');
  // The first declaration binds, as XML says.
  if (!entities.has(name)) entities.set(name, replacementText(literal));
  return i + 1;
}

/** Character references are replaced as the entity is declared, so `&#38;b;` becomes `&b;`. */
function replacementText(literal: string): string {
  try {
    return literal.replace(CHARACTER, (_, decimal?: string, hex?: string) =>
      String.fromCodePoint(decimal === undefined ? parseInt(hex ?? '', 16) : Number(decimal)),
    );
  } catch {
    // A code point past Unicode's last.
    throw new SvgImportError('INVALID_SVG');
  }
}
