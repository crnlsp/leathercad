import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import en from '../../locales/en.json';
import { createI18n, flatten } from '../../shared/i18n.js';
import {
  KEYMAP,
  commandFor,
  keyForTools,
  keyLabel,
  matches,
  type Binding,
  type CommandId,
  type KeyPress,
  type KeyboardLayout,
} from './keymap.js';
import { SHORTCUT_GROUPS } from './shortcuts.js';

/**
 * The keymap (U.3, §2 *Shortcuts*): every key the window answers to, matched
 * by where it is on the keyboard, shown as this keyboard prints it.
 *
 * A key's letter or symbol moves between layouts — `[` is `ü` on a German
 * keyboard and needs AltGr there to type — so a key is matched by its
 * `KeyboardEvent.code`, its place. A letter is the exception: R is Rectangle
 * because R is the word's first letter, so it follows its letter to wherever a
 * French or German keyboard puts it.
 */

const { t } = createI18n('en');

// The base level of three layouts, as `navigator.keyboard.getLayoutMap()`
// returns it: what each key types with no modifier.
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const US: KeyboardLayout = new Map([
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
const GERMAN: KeyboardLayout = new Map([
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
const FRENCH: KeyboardLayout = new Map([
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
// No Latin letter anywhere: every letter key types a Cyrillic one.
const RUSSIAN: KeyboardLayout = new Map([
  ...US,
  ...[...'фисвуапршолдьтщзйкыегмцчня'].map(
    (letter, index) => [`Key${LETTERS[index]!.toUpperCase()}`, letter] as const,
  ),
]);

const NO_MODIFIERS = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };

/**
 * The press a maker makes for a binding on a layout: the key where the layout
 * types a binding's letter — at its own place when no key does — and for any
 * other binding the key at its place, typing whatever the layout has there.
 */
function press(binding: Binding, layout: KeyboardLayout, isMac = false): KeyPress {
  if ('char' in binding) {
    return { ...NO_MODIFIERS, code: 'Slash', key: binding.char, shiftKey: true };
  }
  const letter = /^Key([A-Z])$/.exec(binding.code)?.[1]?.toLowerCase();
  const code =
    letter === undefined
      ? binding.code
      : ([...layout].find(([, typed]) => typed === letter)?.[0] ?? binding.code);
  const typed = layout.get(code) ?? binding.code;
  return {
    code,
    key: binding.shift === true ? typed.toUpperCase() : typed,
    ctrlKey: binding.mod === true && !isMac,
    metaKey: binding.mod === true && isMac,
    shiftKey: binding.shift === true,
    altKey: binding.alt === true,
  };
}

const windowCommands = KEYMAP.filter((command) => command.scope === 'window');
const everyBinding = (command: (typeof KEYMAP)[number]): readonly Binding[] => [
  ...command.keys,
  ...(command.aliases ?? []),
];

describe('matching a key, by where it is (U.3)', () => {
  it('answers every key it has, typed on a US keyboard, with its own command', () => {
    for (const isMac of [false, true]) {
      for (const command of windowCommands) {
        for (const binding of everyBinding(command)) {
          expect(commandFor(press(binding, US, isMac), isMac), JSON.stringify(binding)).toBe(
            command.id,
          );
        }
      }
    }
  });

  it('on a German, French or Russian keyboard, does with every key what it does on a US one', () => {
    for (const layout of [GERMAN, FRENCH, RUSSIAN]) {
      for (const command of windowCommands) {
        for (const binding of everyBinding(command)) {
          expect(commandFor(press(binding, layout), false), JSON.stringify(binding)).toBe(
            command.id,
          );
        }
      }
    }
  });

  it('reads Ctrl as the command key off macOS, and ⌘ on it', () => {
    const save = { ...NO_MODIFIERS, code: 'KeyS', key: 's' };
    expect(commandFor({ ...save, ctrlKey: true }, false)).toBe('save');
    expect(commandFor({ ...save, metaKey: true }, false)).toBeNull();
    expect(commandFor({ ...save, metaKey: true }, true)).toBe('save');
    expect(commandFor({ ...save, ctrlKey: true }, true)).toBeNull();
  });

  it('holds the modifiers exactly: Shift+R is not R, Ctrl+Alt+S does not save', () => {
    expect(commandFor({ ...NO_MODIFIERS, code: 'KeyR', key: 'r' }, false)).toBe('tool.rectangle');
    expect(commandFor({ ...NO_MODIFIERS, code: 'KeyR', key: 'R', shiftKey: true }, false)).toBe(
      null,
    );
    expect(
      commandFor({ ...NO_MODIFIERS, code: 'KeyS', key: 's', ctrlKey: true, altKey: true }, false),
    ).toBeNull();
    // Caps Lock types a capital with no Shift held: still the key.
    expect(commandFor({ ...NO_MODIFIERS, code: 'KeyR', key: 'R' }, false)).toBe('tool.rectangle');
  });

  it('matches a punctuation key by its place, not by the character it types', () => {
    const left: Binding = { code: 'BracketLeft' };
    // German: the key right of P types ü, and `[` needs AltGr+8.
    expect(matches({ ...NO_MODIFIERS, code: 'BracketLeft', key: 'ü' }, left, false)).toBe(true);
    expect(matches({ ...NO_MODIFIERS, code: 'Digit8', key: '[' }, left, false)).toBe(false);
    // Ctrl+= zooms in from the key right of 0, whatever it prints.
    expect(commandFor({ ...NO_MODIFIERS, code: 'Equal', key: '´', ctrlKey: true }, false)).toBe(
      'zoomIn',
    );
  });

  it('follows a letter to where the layout puts it (French AZERTY, German QWERTZ)', () => {
    // French: A is where a US keyboard has Q, and Q where it has A.
    expect(commandFor({ ...NO_MODIFIERS, code: 'KeyQ', key: 'a' }, false)).toBe('tool.arc');
    expect(commandFor({ ...NO_MODIFIERS, code: 'KeyA', key: 'q' }, false)).toBeNull();
    // French M is right of L, where its comma key would have been Measure.
    expect(commandFor({ ...NO_MODIFIERS, code: 'Semicolon', key: 'm' }, false)).toBe(
      'tool.measure',
    );
    expect(commandFor({ ...NO_MODIFIERS, code: 'KeyM', key: ',' }, false)).toBeNull();
    // German Z and Y trade places, and Ctrl+Z still undoes.
    expect(commandFor({ ...NO_MODIFIERS, code: 'KeyY', key: 'z', ctrlKey: true }, false)).toBe(
      'undo',
    );
    expect(
      commandFor({ ...NO_MODIFIERS, code: 'KeyZ', key: 'y', ctrlKey: true }, false),
    ).toBeNull();
  });

  it('gives a key that types a letter to that letter, not to the punctuation at its place', () => {
    // Dvorak types z where a US keyboard has /: Ctrl+Z undoes, and is not Ctrl+/.
    expect(commandFor({ ...NO_MODIFIERS, code: 'Slash', key: 'z', ctrlKey: true }, false)).toBe(
      'undo',
    );
    expect(
      matches(
        { ...NO_MODIFIERS, code: 'Slash', key: 'z', ctrlKey: true },
        { code: 'Slash', mod: true },
        false,
      ),
    ).toBe(false);
    // fast-check's shrunk counterexamples, kept: ⌘ with a key typing p where
    // a US keyboard has a comma is Print, not Settings; Shift with a key typing
    // ? is the list, whatever key it is.
    expect(commandFor({ ...NO_MODIFIERS, code: 'Comma', key: 'p', metaKey: true }, true)).toBe(
      'print',
    );
    expect(
      matches(
        { ...NO_MODIFIERS, code: 'Comma', key: 'p', metaKey: true },
        { code: 'Comma', mod: true },
        true,
      ),
    ).toBe(false);
    expect(commandFor({ ...NO_MODIFIERS, code: 'F10', key: '?', shiftKey: true }, false)).toBe(
      'keyboardShortcuts',
    );
  });

  it('on a keyboard with no Latin letters, finds a letter at its US place', () => {
    expect(commandFor({ ...NO_MODIFIERS, code: 'KeyR', key: 'к' }, false)).toBe('tool.rectangle');
    expect(commandFor({ ...NO_MODIFIERS, code: 'KeyZ', key: 'я', ctrlKey: true }, false)).toBe(
      'undo',
    );
  });

  it('never takes a Latin letter with a mark for the plain letter at its place', () => {
    // Polish: AltGr+A types ą. Nothing should change tool.
    expect(commandFor({ ...NO_MODIFIERS, code: 'KeyA', key: 'ą' }, false)).toBeNull();
    // A dead key types nothing yet.
    expect(commandFor({ ...NO_MODIFIERS, code: 'KeyE', key: 'Dead' }, false)).toBeNull();
    // Turkish ı upper-cases to I; ſ to S. Neither is the key S.
    expect(commandFor({ ...NO_MODIFIERS, code: 'KeyI', key: 'ſ' }, false)).toBeNull();
  });

  it('gives a tool the letter the window reads, so a tool’s claim and the window agree', () => {
    // The polyline claims A mid-run. On a Cyrillic keyboard the window reads
    // the key at A's place as A, so the polyline must hear `a` there too, or
    // the press would throw its run away for the Arc tool.
    expect(keyForTools({ ...NO_MODIFIERS, code: 'KeyA', key: 'ф' })).toBe('a');
    expect(keyForTools({ ...NO_MODIFIERS, code: 'KeyQ', key: 'a' })).toBe('a');
    expect(keyForTools({ ...NO_MODIFIERS, code: 'KeyA', key: 'ą' })).toBe('ą');
    for (const key of ['Escape', 'Enter', 'Backspace', 'Delete', 'R']) {
      expect(keyForTools({ ...NO_MODIFIERS, code: 'KeyR', key })).toBe(key);
    }
  });

  it('opens the shortcut list on ?, wherever the layout puts it', () => {
    for (const code of ['Slash', 'Minus', 'Comma', 'KeyM']) {
      expect(commandFor({ ...NO_MODIFIERS, code, key: '?', shiftKey: true }, false), code).toBe(
        'keyboardShortcuts',
      );
    }
    // A `/` typed is not a `?`.
    expect(commandFor({ ...NO_MODIFIERS, code: 'Slash', key: '/' }, false)).toBeNull();
  });

  it('never runs two commands for one key press', () => {
    const codes = [...new Set([...US.keys(), ...GERMAN.keys(), 'NumpadAdd', 'F10', 'Delete'])];
    fc.assert(
      fc.property(
        fc.constantFrom(...codes),
        fc.constantFrom(...LETTERS, 'ü', 'ß', 'к', 'я', '?', '+', '-', '=', 'Dead', 'Delete'),
        fc.record({
          ctrlKey: fc.boolean(),
          metaKey: fc.boolean(),
          shiftKey: fc.boolean(),
          altKey: fc.boolean(),
        }),
        fc.boolean(),
        (code, key, modifiers, isMac) => {
          const event = { code, key, ...modifiers };
          const heard = windowCommands.filter((command) =>
            everyBinding(command).some((binding) => matches(event, binding, isMac)),
          );
          expect(heard.length).toBeLessThanOrEqual(1);
        },
      ),
      // Cheap, and the space of codes × keys × modifiers is wide.
      { numRuns: 5000 },
    );
  });

  it('binds no two commands alike in one scope', () => {
    const scopes = new Map<string, Map<string, CommandId>>();
    for (const command of KEYMAP) {
      const taken = scopes.get(command.scope) ?? new Map<string, CommandId>();
      for (const binding of everyBinding(command)) {
        const name =
          'char' in binding
            ? binding.char
            : [
                binding.code,
                binding.mod === true,
                binding.shift === true,
                binding.alt === true,
              ].join();
        expect(taken.get(name), `${name} in ${command.scope}`).toBeUndefined();
        taken.set(name, command.id);
      }
      scopes.set(command.scope, taken);
    }
  });
});

describe('showing a key, as this keyboard prints it (U.3)', () => {
  const label = (id: CommandId, layout: KeyboardLayout | null, isMac = false): string =>
    keyLabel(KEYMAP.find((command) => command.id === id)!.keys[0]!, isMac, layout, t);

  it('shows a punctuation key as the character this layout has there', () => {
    expect(keyLabel({ code: 'BracketLeft' }, false, GERMAN, t)).toBe('ü');
    expect(label('zoomOut', GERMAN)).toBe('Ctrl+ß');
    expect(label('keyboardShortcuts', GERMAN)).toBe('Ctrl+-');
    expect(label('settings', FRENCH)).toBe('Ctrl+;');
  });

  it('shows its US character when the layout is not known', () => {
    expect(keyLabel({ code: 'BracketLeft' }, false, null, t)).toBe('[');
    expect(label('zoomIn', null)).toBe('Ctrl+=');
    expect(label('keyboardShortcuts', null)).toBe('Ctrl+/');
  });

  it('keeps a letter its letter, and a digit its digit, on any layout', () => {
    for (const layout of [US, GERMAN, FRENCH, RUSSIAN, null]) {
      expect(label('tool.rectangle', layout)).toBe('R');
      expect(label('undo', layout)).toBe('Ctrl+Z');
      expect(label('design', layout)).toBe('Ctrl+1');
    }
    expect(keyLabel({ char: '?' }, false, GERMAN, t)).toBe('?');
  });

  it('writes the modifiers as macOS does: ⌥ ⇧ ⌘, in that order, joined', () => {
    expect(label('saveAs', null, true)).toBe('⇧⌘S');
    expect(label('saveAs', null, false)).toBe('Ctrl+Shift+S');
    expect(label('zoomIn', GERMAN, true)).toBe('⌘´');
    expect(keyLabel({ code: 'KeyS', mod: true, alt: true }, true, null, t)).toBe('⌥⌘S');
    expect(keyLabel({ code: 'KeyS', mod: true, alt: true }, false, null, t)).toBe('Ctrl+Alt+S');
  });

  it('names its keys in the interface’s language', () => {
    const named = ((key: string) => `«${key}»`) as typeof t;
    expect(keyLabel({ code: 'KeyS', mod: true, shift: true }, false, null, named)).toBe(
      '«keys.Ctrl»+«keys.Shift»+S',
    );
    expect(keyLabel({ code: 'Delete' }, true, null, named)).toBe('«keys.Delete»');
    expect(keyLabel({ code: 'ContextMenu' }, false, null, named)).toBe('«keys.Menu»');
    expect(keyLabel({ code: 'F10', shift: true }, false, null, t)).toBe('Shift+F10');
  });
});

describe('the shortcut list (8.2) is the keymap (U.3)', () => {
  const listed = SHORTCUT_GROUPS.flatMap((group) =>
    group.shortcuts.map((shortcut) => ({ group: group.id, ...shortcut })),
  );

  it('lists every key the keymap has, under its command', () => {
    for (const command of KEYMAP) {
      expect(listed).toContainEqual({
        group: command.group,
        keys: command.keys,
        does: command.does,
      });
    }
  });

  it('lists nothing the keymap lacks but the pointer’s gestures', () => {
    const gestures = listed.filter(
      (row) => !KEYMAP.some((command) => command.does === row.does && command.keys === row.keys),
    );
    expect(gestures.map((row) => row.does).sort()).toEqual([
      'shortcuts.pan',
      'shortcuts.square',
      'shortcuts.zoom',
    ]);
  });
});

describe('no sentence in the catalogue names a key (U.3)', () => {
  // Keys come from the keymap, so they follow a rebinding (U.12) and show as
  // ⌘ on macOS. Named keys — Ctrl, Shift — are the key catalogue's words.
  const KEY_IN_A_SENTENCE =
    /(?<![\p{L}\p{N}])[B-Z](?![\p{L}\p{N}])|\b(?:Ctrl|Cmd|Alt|Shift|Del|Esc|Backspace|F\d{1,2})\b|[⌘⇧⌥]|\p{L}\+[\p{L}\p{N}=,\-/]/u;

  it('holds none in en.json outside the names of the keys themselves', () => {
    const naming = Object.entries(flatten(en)).filter(
      ([path, text]) => !path.startsWith('keys.') && KEY_IN_A_SENTENCE.test(text),
    );
    expect(naming).toEqual([]);
  });
});
