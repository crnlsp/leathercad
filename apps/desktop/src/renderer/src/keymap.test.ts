import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import en from '../../locales/en.json';
import { createI18n, flatten } from '../../shared/i18n.js';
import {
  KEYMAP,
  commandFor,
  keyForTools,
  keyLabel,
  keysOf,
  matches,
  shownKeys,
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
// Czech QWERTZ: the digit row types + ě š …, = is right of it, - where US has /.
const CZECH: KeyboardLayout = new Map([
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
    // Where the layout types it with no Shift; otherwise as Shift with some key.
    const code = [...layout].find(([, typed]) => typed === binding.char)?.[0];
    return {
      ...NO_MODIFIERS,
      code: code ?? 'Slash',
      key: binding.char,
      shiftKey: code === undefined,
      ctrlKey: binding.mod === true && !isMac,
      metaKey: binding.mod === true && isMac,
    };
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
    // One exception, and only one: German types − where a US keyboard has
    // `/`, so Ctrl there zooms out, and the list is reached by `?` (U.3, on
    // review). Any other key that changed its command would be a new one.
    const taken: string[] = [];
    for (const [name, layout] of [
      ['German', GERMAN],
      ['French', FRENCH],
      ['Russian', RUSSIAN],
    ] as const) {
      for (const command of windowCommands) {
        for (const binding of everyBinding(command)) {
          const heard = commandFor(press(binding, layout), false);
          if (heard !== command.id) taken.push(`${name} ${JSON.stringify(binding)} → ${heard}`);
        }
      }
    }
    expect(taken).toEqual(['German {"code":"Slash","mod":true} → zoomOut']);
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
    // Ctrl+, opens Settings from the key right of M, whatever it prints.
    expect(commandFor({ ...NO_MODIFIERS, code: 'Comma', key: ';', ctrlKey: true }, false)).toBe(
      'settings',
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

  describe('zoom follows the + and − a keyboard prints (U.3, on review)', () => {
    // Zoom is named by its symbols, like a tool by its letter, and + and −
    // need no AltGr anywhere — unlike [ ] \ — so they are matched by what the
    // key types. Before U.3 the window matched every key that way, and these
    // are the presses that worked then on German and French keyboards.
    const ctrl = (code: string, key: string, extra: Partial<KeyPress> = {}): KeyPress => ({
      ...NO_MODIFIERS,
      code,
      key,
      ctrlKey: true,
      ...extra,
    });

    it('zooms from the keys printed + and − on a German keyboard, not from ´ and ß', () => {
      expect(commandFor(ctrl('BracketRight', '+'), false)).toBe('zoomIn');
      expect(commandFor(ctrl('Slash', '-'), false)).toBe('zoomOut');
      expect(commandFor(ctrl('Equal', 'Dead'), false)).toBeNull();
      expect(commandFor(ctrl('Equal', '´'), false)).toBeNull();
      expect(commandFor(ctrl('Minus', 'ß'), false)).toBeNull();
    });

    it('never opens the shortcut list from the German − key, at the US / place', () => {
      expect(matches(ctrl('Slash', '-'), { code: 'Slash', mod: true }, false)).toBe(false);
      expect(commandFor({ ...NO_MODIFIERS, code: 'Minus', key: '?', shiftKey: true }, false)).toBe(
        'keyboardShortcuts',
      );
    });

    it('zooms out from the − on a French keyboard’s 6 key, and in from =', () => {
      expect(commandFor(ctrl('Digit6', '-'), false)).toBe('zoomOut');
      expect(commandFor(ctrl('Equal', '='), false)).toBe('zoomIn');
      expect(commandFor(ctrl('Equal', '+', { shiftKey: true }), false)).toBe('zoomIn');
      expect(commandFor(ctrl('Minus', ')'), false)).toBeNull();
    });

    it('keeps the US keys: Ctrl+=, Shift for +, Ctrl+−, the keypad, and Ctrl+/', () => {
      expect(commandFor(ctrl('Equal', '='), false)).toBe('zoomIn');
      expect(commandFor(ctrl('Equal', '+', { shiftKey: true }), false)).toBe('zoomIn');
      expect(commandFor(ctrl('Minus', '-'), false)).toBe('zoomOut');
      expect(commandFor(ctrl('NumpadAdd', '+'), false)).toBe('zoomIn');
      expect(commandFor(ctrl('NumpadSubtract', '-'), false)).toBe('zoomOut');
      expect(commandFor(ctrl('Slash', '/'), false)).toBe('keyboardShortcuts');
    });

    it('leaves a digit key its digit where it types + (Czech): Ctrl+1 is Design', () => {
      expect(commandFor(ctrl('Digit1', '+'), false)).toBe('design');
      expect(commandFor(ctrl('Minus', '='), false)).toBe('zoomIn');
      expect(commandFor(ctrl('Slash', '-'), false)).toBe('zoomOut');
      // German = is Shift with 0: that zooms in, and Ctrl+0 is still true size (U.4).
      expect(commandFor(ctrl('Digit0', '=', { shiftKey: true }), false)).toBe('zoomIn');
      expect(commandFor(ctrl('Digit0', '0'), false)).toBe('trueSize');
    });

    it('wants the command key and only it: not bare, not with Alt or AltGr', () => {
      expect(commandFor({ ...NO_MODIFIERS, code: 'BracketRight', key: '+' }, false)).toBeNull();
      expect(commandFor(ctrl('BracketRight', '+', { altKey: true }), false)).toBeNull();
      expect(commandFor(ctrl('BracketRight', '+', { metaKey: true }), false)).toBeNull();
      expect(
        commandFor({ ...NO_MODIFIERS, code: 'BracketRight', key: '+', metaKey: true }, true),
      ).toBe('zoomIn');
      expect(commandFor(ctrl('BracketRight', '+'), true)).toBeNull();
    });
  });

  describe('fit and true size (U.4, R-03)', () => {
    // Shift+1 and Shift+2 by their place, whatever the key types with Shift:
    // ! and @ in the US, ! and " in Germany, 1 and 2 in France and Czechia.
    const shifted = (code: string, key: string): KeyPress => ({
      ...NO_MODIFIERS,
      code,
      key,
      shiftKey: true,
    });

    it('fits the drawing on Shift+1 on a US, German, French or Czech keyboard', () => {
      for (const key of ['!', '1']) {
        expect(commandFor(shifted('Digit1', key), false), key).toBe('fit');
        expect(commandFor(shifted('Digit1', key), true), key).toBe('fit');
      }
    });

    it('fits the selection on Shift+2, whatever the key types', () => {
      for (const key of ['@', '"', '2']) {
        expect(commandFor(shifted('Digit2', key), false), key).toBe('fitSelection');
      }
    });

    it('zooms to true size on Ctrl+0, which fitted before, and on the keypad’s 0', () => {
      const ctrl0 = { ...NO_MODIFIERS, code: 'Digit0', key: '0', ctrlKey: true };
      expect(commandFor(ctrl0, false)).toBe('trueSize');
      expect(commandFor({ ...ctrl0, code: 'Numpad0' }, false)).toBe('trueSize');
      // French types à on the 0 key: by its place, still true size.
      expect(commandFor({ ...ctrl0, key: 'à' }, false)).toBe('trueSize');
      expect(commandFor({ ...ctrl0, ctrlKey: false, metaKey: true }, true)).toBe('trueSize');
    });

    it('holds the modifiers exactly: 1 alone, Ctrl+Shift+1 and Alt+Shift+1 do not fit', () => {
      expect(commandFor({ ...NO_MODIFIERS, code: 'Digit1', key: '1' }, false)).toBeNull();
      expect(commandFor({ ...shifted('Digit1', '!'), ctrlKey: true }, false)).toBeNull();
      expect(commandFor({ ...shifted('Digit1', '!'), altKey: true }, false)).toBeNull();
    });

    it('never takes a ? typed on the 1 key for the shortcut list: the digit keeps its place', () => {
      expect(commandFor(shifted('Digit1', '?'), false)).toBe('fit');
    });

    it('shows them as Shift+1, Shift+2 and Ctrl+0, and ⇧1, ⇧2 and ⌘0 on macOS', () => {
      for (const layout of [US, GERMAN, FRENCH, CZECH, null]) {
        const label = (id: CommandId, isMac = false): string =>
          keyLabel(shownKeys(id, layout, isMac)[0]!, isMac, layout, t);
        expect(label('fit')).toBe('Shift+1');
        expect(label('fitSelection')).toBe('Shift+2');
        expect(label('trueSize')).toBe('Ctrl+0');
        expect(label('fit', true)).toBe('⇧1');
        expect(label('fitSelection', true)).toBe('⇧2');
        expect(label('trueSize', true)).toBe('⌘0');
      }
    });
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
            ? [binding.char, binding.mod === true].join()
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
  // A command's first key as a tooltip shows it: the first this keyboard can press.
  const label = (id: CommandId, layout: KeyboardLayout | null, isMac = false): string =>
    keyLabel(shownKeys(id, layout, isMac)[0]!, isMac, layout, t);

  it('shows a punctuation key as the character this layout has there', () => {
    expect(keyLabel({ code: 'BracketLeft' }, false, GERMAN, t)).toBe('ü');
    expect(label('keyboardShortcuts', FRENCH)).toBe('Ctrl+!');
    expect(label('settings', FRENCH)).toBe('Ctrl+;');
  });

  it('shows zoom as the + and − this keyboard prints (U.3, on review)', () => {
    expect(label('zoomIn', US)).toBe('Ctrl+=');
    expect(label('zoomIn', FRENCH)).toBe('Ctrl+=');
    expect(label('zoomIn', GERMAN)).toBe('Ctrl++');
    expect(label('zoomOut', GERMAN)).toBe('Ctrl+-');
    // Czech types + on its 1 key, which stays Design's; = is beside it.
    expect(label('zoomIn', CZECH)).toBe('Ctrl+=');
    expect(label('zoomIn', GERMAN, true)).toBe('⌘+');
  });

  it('leaves out a key another command takes on this keyboard', () => {
    // German − sits where US has /, and zooms out: the list is reached by ? there.
    expect(shownKeys('keyboardShortcuts', GERMAN, false)).toEqual([{ char: '?' }]);
    expect(shownKeys('keyboardShortcuts', US, false)).toEqual(keysOf('keyboardShortcuts'));
  });

  it('shows only keys that, pressed on that keyboard, run their command, and one at least', () => {
    for (const isMac of [false, true]) {
      for (const layout of [US, GERMAN, FRENCH, RUSSIAN, CZECH]) {
        for (const command of windowCommands) {
          const shown = shownKeys(command.id, layout, isMac);
          expect(shown.length, command.id).toBeGreaterThan(0);
          for (const binding of shown) {
            expect(commandFor(press(binding, layout, isMac), isMac), JSON.stringify(binding)).toBe(
              command.id,
            );
          }
        }
      }
    }
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
    expect(label('settings', FRENCH, true)).toBe('⌘;');
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
