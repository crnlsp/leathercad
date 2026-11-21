/** A tab or a line break: a space in a name, so two words pasted from two lines stay two. */
const BREAK = /[\t\n\v\f\r]/gu;

/**
 * Every other C0 control and DEL, which a name cannot show, and the bidi
 * embeddings, overrides and isolates (U+202A–U+202E, U+2066–U+2069), which
 * reverse how everything after them reads in a tab, a title or the Parts list.
 * The marks LRM and RLM stay: they steer one character, and right-to-left
 * names need them.
 */
// eslint-disable-next-line no-control-regex -- the control characters are what it finds
const UNSAFE = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu;

/**
 * A name as a maker typed or pasted it, made safe to store and show (QA F9):
 * a project's, a piece's, a feature's or a template's. Not trimmed — a field
 * calls this on every keystroke, and a space typed last is the start of the
 * next word.
 */
export function cleanName(text: string): string {
  return text.replace(BREAK, ' ').replace(UNSAFE, '');
}
