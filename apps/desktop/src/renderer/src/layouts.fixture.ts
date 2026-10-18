import type { KeyboardLayout } from './keymap.js';

/**
 * Keyboards for the keymap's tests (U.3, U.12): the base level of each, as
 * `navigator.keyboard.getLayoutMap()` returns it — what each key types with
 * no modifier.
 */

export const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
export const US: KeyboardLayout = new Map([
  ...[...LETTERS].map((letter) => [`Key${letter.toUpperCase()}`, letter] as const),
  ...[...'0123456789'].map((digit) => [`Digit${digit}`, digit] as const),
  ['Backquote', '`'],
  ['Minus', '-'],
  ['Equal', '='],
  ['BracketLeft', '['],
  ['BracketRight', ']'],
  ['Backslash', '\\'],
  ['Semicolon', ';'],
  ['Quote', "'"],
  ['Comma', ','],
  ['Period', '.'],
  ['Slash', '/'],
]);
export const GERMAN: KeyboardLayout = new Map([
  ...US,
  ['KeyY', 'z'],
  ['KeyZ', 'y'],
  ['Backquote', '^'],
  ['Minus', 'ß'],
  ['Equal', '´'],
  ['BracketLeft', 'ü'],
  ['BracketRight', '+'],
  ['Backslash', '#'],
  ['Semicolon', 'ö'],
  ['Quote', 'ä'],
  ['Slash', '-'],
  ['IntlBackslash', '<'],
]);
export const FRENCH: KeyboardLayout = new Map([
  ...US,
  ['KeyQ', 'a'],
  ['KeyA', 'q'],
  ['KeyW', 'z'],
  ['KeyZ', 'w'],
  ['Semicolon', 'm'],
  ['KeyM', ','],
  ['Comma', ';'],
  ['Period', ':'],
  ['Slash', '!'],
  ['Digit1', '&'],
  ['Digit2', 'é'],
  ['Digit3', '"'],
  ['Digit4', "'"],
  ['Digit5', '('],
  ['Digit6', '-'],
  ['Digit7', 'è'],
  ['Digit8', '_'],
  ['Digit9', 'ç'],
  ['Digit0', 'à'],
  ['Minus', ')'],
  ['Equal', '='],
  ['BracketLeft', '^'],
  ['BracketRight', '$'],
  ['Backslash', '*'],
  ['Quote', 'ù'],
  ['Backquote', '²'],
]);
// Czech QWERTZ: the digit row types + ě š …, = is right of it, - where US has /.
export const CZECH: KeyboardLayout = new Map([
  ...US,
  ['KeyY', 'z'],
  ['KeyZ', 'y'],
  ['Digit1', '+'],
  ['Digit2', 'ě'],
  ['Digit3', 'š'],
  ['Minus', '='],
  ['Equal', '´'],
  ['Slash', '-'],
]);
// No Latin letter anywhere: every letter key types a Cyrillic one.
export const RUSSIAN: KeyboardLayout = new Map([
  ...US,
  ...[...'фисвуапршолдьтщзйкыегмцчня'].map(
    (letter, index) => [`Key${LETTERS[index]!.toUpperCase()}`, letter] as const,
  ),
]);

// Dvorak: the letters move almost everywhere, and `/` is where US has `[`.
const DVORAK_ROWS: readonly (readonly [string, string])[] = [
  ['Quote', '-'],
  ['KeyQ', "'"],
  ['KeyW', ','],
  ['KeyE', '.'],
  ['KeyR', 'p'],
  ['KeyT', 'y'],
  ['KeyY', 'f'],
  ['KeyU', 'g'],
  ['KeyI', 'c'],
  ['KeyO', 'r'],
  ['KeyP', 'l'],
  ['BracketLeft', '/'],
  ['BracketRight', '='],
  ['KeyA', 'a'],
  ['KeyS', 'o'],
  ['KeyD', 'e'],
  ['KeyF', 'u'],
  ['KeyG', 'i'],
  ['KeyH', 'd'],
  ['KeyJ', 'h'],
  ['KeyK', 't'],
  ['KeyL', 'n'],
  ['Semicolon', 's'],
  ['KeyZ', ';'],
  ['KeyX', 'q'],
  ['KeyC', 'j'],
  ['KeyV', 'k'],
  ['KeyB', 'x'],
  ['KeyN', 'b'],
  ['KeyM', 'm'],
  ['Comma', 'w'],
  ['Period', 'v'],
  ['Slash', 'z'],
  ['Minus', '['],
  ['Equal', ']'],
];
export const DVORAK: KeyboardLayout = new Map([...US, ...DVORAK_ROWS]);
