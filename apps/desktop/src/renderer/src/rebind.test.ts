import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  KEYMAP,
  allBindings,
  commandFor,
  commandsHearing,
  keyForTools,
  keysOf,
  matches,
  pressOn,
  withBindings,
  type Binding,
  type CommandId,
  type KeyBindings,
  type KeyPress,
  type KeyboardLayout,
} from './keymap.js';
import { CZECH, DVORAK, FRENCH, GERMAN, RUSSIAN, US } from './layouts.fixture.js';
import {
  apply,
  bindingFor,
  clashScopes,
  differs,
  duplicated,
  isChangeable,
  proposeKey,
  proposeReset,
  readBindings,
  swap,
  type Change,
} from './rebind.js';

/**
 * Changing a key (U.12, §2 *Shortcuts*): a key is taken from the press itself
 * and stored as one the keymap matches for that same press, on any layout; a
 * key another command in the same place already has is named, and swapped or
 * left; and whatever `preferences.json` holds, only a usable keymap comes of it.
 */

const NONE = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
const at = (code: string, key: string, held: Partial<typeof NONE> = {}): KeyPress => ({
  ...NONE,
  code,
  key,
  ...held,
});

const LAYOUTS: readonly (readonly [string, KeyboardLayout])[] = [
  ['US', US],
  ['German', GERMAN],
  ['French', FRENCH],
  ['Czech', CZECH],
  ['Dvorak', DVORAK],
  ['Russian', RUSSIAN],
];

const changed = (change: Change): KeyBindings => {
  if (typeof change !== 'object' || !('bindings' in change)) {
    throw new Error(`not changed: ${JSON.stringify(change)}`);
  }
  return change.bindings;
};

/** Whether a press runs this command, as the window or the board's tool would hear it. */
function hears(bindings: KeyBindings, id: CommandId, press: KeyPress, isMac: boolean): boolean {
  const heard = commandsHearing(press, clashScopes(id), isMac, withBindings(bindings));
  return heard.length === 1 && heard[0] === id;
}

describe('taking a key from a press (U.12)', () => {
  it('stores a letter as the letter it types, wherever the layout puts it', () => {
    // AZERTY: the key that types a is where a US keyboard has Q.
    expect(bindingFor(at('KeyQ', 'a'), false)).toEqual({ code: 'KeyA' });
    expect(bindingFor(at('KeyQ', 'A', { shiftKey: true }), false)).toEqual({
      code: 'KeyA',
      shift: true,
    });
    // A Cyrillic letter is the Latin letter at its place.
    expect(bindingFor(at('KeyR', 'к'), false)).toEqual({ code: 'KeyR' });
  });

  it('stores any other key by its place, with the command key as the platform has it', () => {
    expect(bindingFor(at('F5', 'F5'), false)).toEqual({ code: 'F5' });
    expect(bindingFor(at('BracketLeft', 'ü'), false)).toEqual({ code: 'BracketLeft' });
    expect(bindingFor(at('KeyS', 's', { ctrlKey: true }), false)).toEqual({
      code: 'KeyS',
      mod: true,
    });
    expect(bindingFor(at('KeyS', 's', { metaKey: true }), true)).toEqual({
      code: 'KeyS',
      mod: true,
    });
  });

  it('keeps listening through a modifier on its own', () => {
    for (const [code, key] of [
      ['ShiftLeft', 'Shift'],
      ['ControlRight', 'Control'],
      ['AltLeft', 'Alt'],
      ['MetaLeft', 'Meta'],
      ['CapsLock', 'CapsLock'],
      ['AltRight', 'AltGraph'],
    ] as const) {
      expect(bindingFor(at(code, key), false), code).toBeNull();
    }
  });

  it('refuses Esc, Tab and Enter, which keep their roles, with any modifier', () => {
    for (const code of ['Escape', 'Tab', 'Enter', 'NumpadEnter']) {
      expect(bindingFor(at(code, code), false), code).toBe('reserved');
      expect(bindingFor(at(code, code, { ctrlKey: true, shiftKey: true }), false)).toBe('reserved');
    }
  });

  it('refuses the arrows, Home and End alone: a list, a tree and a menu move by them', () => {
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      expect(bindingFor(at(code, code), false), code).toBe('reserved');
      expect(bindingFor(at(code, code, { ctrlKey: true }), false)).toEqual({ code, mod: true });
    }
  });

  it('refuses what a binding cannot say: Ctrl on macOS, the Windows key elsewhere', () => {
    expect(bindingFor(at('KeyS', 's', { ctrlKey: true }), true)).toBe('unusable');
    expect(bindingFor(at('KeyS', 's', { metaKey: true }), false)).toBe('unusable');
  });

  it('refuses a letter key that types something else, which the letter would not match', () => {
    // Polish AltGr+A types ą: storing KeyA would bind the plain A instead.
    expect(bindingFor(at('KeyA', 'ą'), false)).toBe('typesOther');
    // macOS's Option+A types å: said as such, so the maker knows why.
    expect(bindingFor(at('KeyA', 'å', { altKey: true }), true)).toBe('typesOther');
  });

  it('refuses a press with no code, which would match every other such press (on review)', () => {
    expect(bindingFor(at('', 'Unidentified'), false)).toBe('unusable');
    expect(readBindings({ save: [{ code: '' }] })).toEqual({});
  });

  it('refuses a digit, a point or a comma alone: the board types sizes with them (U.16, on review)', () => {
    for (const [code, key] of [
      ['Digit5', '5'],
      ['Numpad5', '5'],
      ['Period', '.'],
      ['Comma', ','],
      ['NumpadDecimal', ','],
    ] as const) {
      expect(bindingFor(at(code, key), false), code).toBe('typesSize');
    }
    // French: Shift+& types 1, a size; and & alone is the 1 key elsewhere.
    expect(bindingFor(at('Digit1', '1', { shiftKey: true }), false)).toBe('typesSize');
    expect(bindingFor(at('Digit1', '&'), false)).toBe('typesSize');
    // With a modifier held they are keys like any other.
    expect(bindingFor(at('Digit5', '5', { ctrlKey: true }), false)).toEqual({
      code: 'Digit5',
      mod: true,
    });
    expect(bindingFor(at('Digit5', '%', { shiftKey: true }), false)).toEqual({
      code: 'Digit5',
      shift: true,
    });
    for (const code of ['Digit5', 'Numpad5', 'Period', 'Comma', 'NumpadDecimal']) {
      expect(readBindings({ toggleParts: [{ code }] }), code).toEqual({});
    }
    expect(readBindings({ toggleParts: [{ code: 'Digit5', alt: true }] })).toEqual({
      toggleParts: [{ code: 'Digit5', alt: true }],
    });
  });
});

describe('giving a command a key', () => {
  it('takes a free key, and the command hears it at once', () => {
    const press = at('F5', 'F5');
    const bindings = changed(apply({}, proposeKey('save', { code: 'F5' }, press), false));
    expect(bindings).toEqual({ save: [{ code: 'F5' }] });
    expect(commandFor(press, false, withBindings(bindings))).toBe('save');
    // Its old key is free.
    expect(
      commandFor(at('KeyS', 's', { ctrlKey: true }), false, withBindings(bindings)),
    ).toBeNull();
  });

  it('names the command that has the key in the same place, and changes nothing', () => {
    const press = at('KeyS', 's', { ctrlKey: true });
    expect(apply({}, proposeKey('settings', { code: 'KeyS', mod: true }, press), false)).toEqual({
      clash: 'save',
      canSwap: true,
    });
    // The board's Delete is heard where the window's keys are.
    const x = at('KeyX', 'x');
    expect(apply({}, proposeKey('delete', { code: 'KeyX' }, x), false)).toEqual({
      clash: 'tool.text',
      canSwap: true,
    });
    // A Parts row hears the window's keys too.
    expect(apply({}, proposeKey('rename', { code: 'KeyR' }, at('KeyR', 'r')), false)).toEqual({
      clash: 'tool.rectangle',
      canSwap: true,
    });
  });

  it('finds the clash a layout makes: German − zooms out where US has /', () => {
    const press = at('Slash', '-', { ctrlKey: true });
    // And the list has Ctrl+/ too, which the − hides there: two owners, so no swap.
    expect(apply({}, proposeKey('save', { code: 'Slash', mod: true }, press), false)).toEqual({
      clash: 'zoomOut',
      canSwap: false,
    });
    // Moved off the list, the key is Zoom out's alone, and swaps.
    const moved = changed(
      apply({}, proposeKey('keyboardShortcuts', { code: 'F4' }, at('F4', 'F4')), false),
    );
    const swapped = swap(moved, proposeKey('save', { code: 'Slash', mod: true }, press), false);
    expect(commandFor(press, false, withBindings(swapped))).toBe('save');
    expect(commandFor(at('KeyS', 's', { ctrlKey: true }), false, withBindings(swapped))).toBe(
      'zoomOut',
    );
  });

  it('lets a tool under way shadow the window, as A and L do', () => {
    const q = at('KeyQ', 'q');
    const bindings = changed(apply({}, proposeKey('arc', { code: 'KeyQ' }, q), false));
    expect(bindings).toEqual({ arc: [{ code: 'KeyQ' }] });
    expect(hears(bindings, 'arc', q, false)).toBe(true);
    expect(hears(bindings, 'arc', at('KeyA', 'a'), false)).toBe(false);
  });

  it('offers only Cancel when the key is a fixed command’s', () => {
    const copy = at('KeyC', 'c', { ctrlKey: true });
    expect(apply({}, proposeKey('fullScreen', { code: 'KeyC', mod: true }, copy), false)).toEqual({
      clash: 'copy',
      canSwap: false,
    });
  });

  it('counts a tool’s key held with Shift as the tool’s: Shift+Delete is Delete’s (on review)', () => {
    // Circle on Shift+Delete would delete and switch tools with something selected.
    const shiftDelete = at('Delete', 'Delete', { shiftKey: true });
    expect(
      apply({}, proposeKey('tool.circle', { code: 'Delete', shift: true }, shiftDelete), false),
    ).toEqual({ clash: 'delete', canSwap: true });
    // And the other way: Delete given F while a window command has Shift+F.
    const shiftF = changed(
      apply(
        {},
        proposeKey('help', { code: 'KeyF', shift: true }, at('KeyF', 'F', { shiftKey: true })),
        false,
      ),
    );
    expect(apply(shiftF, proposeKey('delete', { code: 'KeyF' }, at('KeyF', 'f')), false)).toEqual({
      clash: 'help',
      canSwap: true,
    });
    expect(
      readBindings({ help: [{ code: 'KeyF', shift: true }], delete: [{ code: 'KeyF' }] }),
    ).toEqual({ help: [{ code: 'KeyF', shift: true }] });
  });

  it('keeps Quit macOS’s own ⌘Q, and the maker’s elsewhere (on review)', () => {
    expect(isChangeable('quit', true)).toBe(false);
    expect(isChangeable('quit', false)).toBe(true);
    const altQ = at('KeyQ', 'q', { metaKey: true, altKey: true });
    expect(apply({}, proposeKey('quit', { code: 'KeyQ', mod: true, alt: true }, altQ), true)).toBe(
      'unusable',
    );
    const stored = { quit: [{ code: 'KeyQ', mod: true, alt: true }] };
    expect(readBindings(stored, true)).toEqual({});
    expect(readBindings(stored, false)).toEqual(stored);
  });

  it('keeps Full screen and Quit off a bare key: the main process hears them in a field too', () => {
    expect(apply({}, proposeKey('fullScreen', { code: 'KeyB' }, at('KeyB', 'b')), false)).toBe(
      'needsModifier',
    );
    expect(
      changed(apply({}, proposeKey('fullScreen', { code: 'F9' }, at('F9', 'F9')), false)),
    ).toEqual({ fullScreen: [{ code: 'F9' }] });
  });
});

describe('swapping', () => {
  it('gives the key to the command being changed and its old keys to the one that had it', () => {
    const press = at('KeyS', 's', { ctrlKey: true });
    const bindings = swap({}, proposeKey('settings', { code: 'KeyS', mod: true }, press), false);
    const keymap = withBindings(bindings);
    expect(commandFor(press, false, keymap)).toBe('settings');
    expect(commandFor(at('Comma', ',', { ctrlKey: true }), false, keymap)).toBe('save');
  });

  it('takes the clashing key from a command with two, and leaves it the other', () => {
    // ? is the list's; Shift+/ given to Fit takes it, and the list keeps Ctrl+/.
    const press = at('Slash', '?', { shiftKey: true });
    const bindings = swap({}, proposeKey('fit', { code: 'Slash', shift: true }, press), false);
    expect(keysOf('keyboardShortcuts', withBindings(bindings))).toEqual([
      { code: 'Slash', mod: true },
      { code: 'Digit1', shift: true },
    ]);
    expect(hears(bindings, 'fit', press, false)).toBe(true);
  });
});

describe('resetting', () => {
  it('drops the command’s own keys, and its numpad twin comes back', () => {
    const press = at('F7', 'F7');
    const bindings = changed(apply({}, proposeKey('design', { code: 'F7' }, press), false));
    expect(differs(bindings, 'design')).toBe(true);
    const back = changed(apply(bindings, proposeReset('design', US, false), false));
    expect(back).toEqual({});
    expect(differs(back, 'design')).toBe(false);
    expect(commandFor(at('Numpad1', '1', { ctrlKey: true }), false, withBindings(back))).toBe(
      'design',
    );
  });

  it('goes through a clash when its default key went to another command', () => {
    const swapped = swap(
      {},
      proposeKey('settings', { code: 'KeyS', mod: true }, at('KeyS', 's', { ctrlKey: true })),
      false,
    );
    const reset = proposeReset('save', US, false);
    expect(apply(swapped, reset, false)).toEqual({ clash: 'settings', canSwap: true });
    expect(swap(swapped, reset, false)).toEqual({});
  });

  it('stores a key equal to the default as no change at all', () => {
    const press = at('KeyS', 's', { ctrlKey: true });
    expect(
      changed(apply({}, proposeKey('save', { code: 'KeyS', mod: true }, press), false)),
    ).toEqual({});
  });
});

describe('which keys can change', () => {
  it('is every command but Esc, Enter, the field’s own and the menu key', () => {
    const fixed = KEYMAP.filter((command) => !isChangeable(command.id)).map((c) => c.id);
    expect(fixed.sort()).toEqual(
      [
        'cancel',
        'contextMenu',
        'copy',
        'cut',
        'editSizes',
        'finishPolyline',
        'paste',
        'selectAll',
      ].sort(),
    );
  });
});

describe('reading the keys preferences.json holds', () => {
  it('keeps a usable change', () => {
    expect(readBindings({ save: [{ code: 'F5' }] })).toEqual({ save: [{ code: 'F5' }] });
    expect(readBindings({ save: [{ code: 'KeyS', mod: true, shift: false, extra: 1 }] })).toEqual(
      {},
    );
  });

  it('drops an unknown command, a fixed one, and anything that is not a key', () => {
    expect(
      readBindings({
        nonsense: [{ code: 'F5' }],
        cancel: [{ code: 'F6' }],
        save: 'F5',
        print: [],
        open: null,
        design: [{ code: 'f7' }],
        sheets: [{ code: 'F8', mod: 'yes' }],
        help: [{ code: 'F1' }, 2],
      }),
    ).toEqual({});
  });

  it('drops Enter, Tab, Esc, a modifier alone, and a bare arrow', () => {
    for (const code of ['Enter', 'Tab', 'Escape', 'NumpadEnter', 'ShiftLeft', 'ArrowUp']) {
      expect(readBindings({ save: [{ code }] }), code).toEqual({});
    }
  });

  it('drops the later of two changes that clash, and keeps a swap', () => {
    expect(readBindings({ save: [{ code: 'F5' }], print: [{ code: 'F5' }] })).toEqual({
      save: [{ code: 'F5' }],
    });
    // A change that clashes with a default.
    expect(readBindings({ save: [{ code: 'KeyO', mod: true }] })).toEqual({});
    // A swap: each alone would clash with the other's default.
    const swapped = {
      save: [{ code: 'Comma', mod: true }],
      settings: [{ code: 'KeyS', mod: true }],
    };
    expect(readBindings(swapped)).toEqual(swapped);
  });

  it('is nothing for what is not a map', () => {
    for (const value of [undefined, null, 3, 'save', [], [{ code: 'F5' }]]) {
      expect(readBindings(value)).toEqual({});
    }
  });
});

// ── properties ──────────────────────────────────────────────────────────────

const CODES = [
  ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => `Key${letter}`),
  ...[...'0123456789'].map((digit) => `Digit${digit}`),
  'Backquote',
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'IntlBackslash',
  'Semicolon',
  'Quote',
  'Comma',
  'Period',
  'Slash',
  'Space',
  'Backspace',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'ArrowUp',
  'Escape',
  'Enter',
  'Tab',
  'Numpad1',
  'NumpadAdd',
  ...Array.from({ length: 12 }, (_, index) => `F${String(index + 1)}`),
  'ShiftLeft',
  'ControlLeft',
];

/** A press on one of the test keyboards: the key there, or its shifted (upper-case) form. */
const arbitraryPress = fc
  .record({
    layout: fc.constantFrom(...LAYOUTS.map(([, layout]) => layout)),
    code: fc.constantFrom(...CODES),
    ctrlKey: fc.boolean(),
    metaKey: fc.boolean(),
    shiftKey: fc.boolean(),
    altKey: fc.boolean(),
    isMac: fc.boolean(),
  })
  .map(({ layout, code, isMac, ...held }) => {
    const base = layout.get(code) ?? (code.startsWith('Shift') ? 'Shift' : code);
    const key = held.shiftKey && base.length === 1 ? base.toUpperCase() : base;
    return { press: { code, key, ...held }, isMac };
  });

const CHANGEABLE = KEYMAP.filter((command) => isChangeable(command.id)).map((c) => c.id);
const arbitraryId = fc.constantFrom(...CHANGEABLE);

/** Steps a maker could take in Settings: a key pressed for a command, swapped if it clashes, or a reset. */
const arbitraryStep = fc.oneof(
  fc.record({ kind: fc.constant('key' as const), id: arbitraryId, at: arbitraryPress }),
  fc.record({ kind: fc.constant('reset' as const), id: arbitraryId, isMac: fc.boolean() }),
  // Another command's key, pressed on a test keyboard, alone or with Shift:
  // the presses that clash, which random keys rarely are.
  fc.record({
    kind: fc.constant('steal' as const),
    id: arbitraryId,
    from: fc.constantFrom(...KEYMAP.map((command) => command.id)),
    layout: fc.constantFrom(...LAYOUTS.map(([, layout]) => layout)),
    shift: fc.boolean(),
    isMac: fc.boolean(),
  }),
);
type Step = typeof arbitraryStep extends fc.Arbitrary<infer T> ? T : never;

/** The keys after a maker's steps in Settings, each swapped when `swapIt` and it can be. */
function afterSteps(steps: readonly Step[], swapIt: boolean): KeyBindings {
  let bindings: KeyBindings = {};
  for (const entry of steps) {
    const isMac = entry.kind === 'key' ? entry.at.isMac : entry.isMac;
    let proposal;
    if (entry.kind === 'reset') proposal = proposeReset(entry.id, US, isMac);
    else {
      let press: KeyPress | null;
      if (entry.kind === 'key') press = entry.at.press;
      else {
        const key = keysOf(entry.from, withBindings(bindings))[0];
        press = key === undefined ? null : pressOn(key, entry.layout, isMac);
        if (press !== null && entry.shift) {
          press = { ...press, shiftKey: true, key: press.key.toUpperCase() };
        }
      }
      if (press === null) continue;
      const binding = bindingFor(press, isMac);
      if (binding === null || typeof binding === 'string') continue;
      proposal = proposeKey(entry.id, binding, press);
    }
    const change = apply(bindings, proposal, isMac);
    if (typeof change === 'object' && 'bindings' in change) bindings = change.bindings;
    else if (swapIt && typeof change === 'object' && change.canSwap) {
      bindings = swap(bindings, proposal, isMac);
    }
  }
  return bindings;
}

describe('properties of changing keys', () => {
  it('never lets one press be heard by two commands in the same place, after any steps (on review)', () => {
    const PLACES = [['window', 'canvas', 'tree'], ['polyline'], ['points'], ['field']] as const;
    fc.assert(
      fc.property(fc.array(arbitraryStep, { maxLength: 12 }), fc.boolean(), (steps, isMac) => {
        const keymap = withBindings(afterSteps(steps, true));
        // Every key bound, pressed on every test keyboard, alone and with Shift.
        const presses = keymap.flatMap((command) =>
          allBindings(command).flatMap((binding) =>
            LAYOUTS.flatMap(([, layout]) => {
              const press = pressOn(binding, layout, isMac);
              return press === null
                ? []
                : [press, { ...press, shiftKey: true, key: press.key.toUpperCase() }];
            }),
          ),
        );
        for (const press of presses) {
          for (const place of PLACES) {
            const heard = commandsHearing(press, place, isMac, keymap);
            expect(
              heard.length,
              `${JSON.stringify(press)} in ${place.join()}: ${heard.join()}`,
            ).toBeLessThanOrEqual(1);
          }
        }
      }),
      { numRuns: 400 },
    );
  });

  it('takes every press a binding can say, as one the keymap matches for that same press', () => {
    fc.assert(
      fc.property(arbitraryPress, ({ press, isMac }) => {
        const binding = bindingFor(press, isMac);
        if (binding !== null && typeof binding !== 'string') {
          expect(matches(press, binding, isMac, []), JSON.stringify(press)).toBe(true);
        }
        // A letter key, held only as a binding can say, is always taken.
        const other = isMac ? press.ctrlKey : press.metaKey;
        if (/^[a-z]$/i.test(keyForTools(press)) && !other) {
          expect(typeof binding, JSON.stringify(press)).toBe('object');
        }
      }),
      { numRuns: 3000 },
    );
  });

  it('a key taken and given — or swapped — is the command’s, pressed again on that keyboard', () => {
    fc.assert(
      fc.property(arbitraryId, arbitraryPress, fc.boolean(), (id, { press, isMac }, swapIt) => {
        const binding = bindingFor(press, isMac);
        if (binding === null || typeof binding === 'string') return;
        const proposal = proposeKey(id, binding, press);
        const change = apply({}, proposal, isMac);
        let bindings: KeyBindings;
        if (typeof change === 'object' && 'bindings' in change) bindings = change.bindings;
        else if (swapIt && typeof change === 'object' && change.canSwap) {
          bindings = swap({}, proposal, isMac);
        } else return;
        expect(hears(bindings, id, press, isMac), JSON.stringify({ id, press, isMac })).toBe(true);
      }),
      { numRuns: 3000 },
    );
  });

  it('every command keeps a key, and none is heard twice in a place, after any steps', () => {
    fc.assert(
      fc.property(fc.array(arbitraryStep, { maxLength: 12 }), fc.boolean(), (steps, swapIt) => {
        const bindings = afterSteps(steps, swapIt);
        const keymap = withBindings(bindings);
        for (const command of keymap) {
          expect(command.keys.length, command.id).toBeGreaterThan(0);
          expect(duplicated(keymap, command.id), command.id).toEqual([]);
        }
        // What preferences.json would hold reads back as it is.
        expect(readBindings(JSON.parse(JSON.stringify(bindings)))).toEqual(bindings);
      }),
      { numRuns: 300 },
    );
  });

  it('reading anything never throws, keeps only changeable commands, and leaves no clash', () => {
    const binding = fc.oneof(
      fc.record(
        {
          code: fc.oneof(fc.constantFrom(...CODES), fc.string()),
          mod: fc.oneof(fc.boolean(), fc.string()),
          shift: fc.boolean(),
          alt: fc.boolean(),
        },
        { requiredKeys: [] },
      ),
      fc.record({ char: fc.string({ maxLength: 2 }), mod: fc.boolean() }, { requiredKeys: [] }),
      fc.anything(),
    );
    const stored = fc.dictionary(
      fc.oneof(fc.constantFrom(...KEYMAP.map((command) => command.id)), fc.string()),
      fc.oneof(fc.array(binding, { maxLength: 5 }), fc.anything()),
    );
    fc.assert(
      fc.property(fc.oneof(stored, fc.anything()), (value) => {
        const read = readBindings(value);
        for (const id of Object.keys(read)) expect(isChangeable(id as CommandId), id).toBe(true);
        const keymap = withBindings(read);
        for (const command of keymap)
          expect(duplicated(keymap, command.id), command.id).toEqual([]);
      }),
      { numRuns: 1000 },
    );
  });

  it('the defaults have no clash in any place, on a US keyboard, on either platform', () => {
    for (const command of KEYMAP) expect(duplicated(KEYMAP, command.id), command.id).toEqual([]);
    expect(clashesOnUs(KEYMAP)).toEqual([]);
    expect(clashesOnUs(KEYMAP, true)).toEqual([]);
  });
});

/** Each key of a keymap pressed on a US keyboard that is not exactly its own command's. */
function clashesOnUs(keymap: ReturnType<typeof withBindings>, isMac = false): string[] {
  const found: string[] = [];
  for (const command of keymap) {
    for (const binding of allBindings(command) as readonly Binding[]) {
      const press = pressOn(binding, null, isMac);
      if (press === null) continue;
      const heard = commandsHearing(press, clashScopes(command.id), isMac, keymap);
      if (heard.length !== 1 || heard[0] !== command.id) {
        found.push(`${command.id} ${JSON.stringify(binding)} → ${heard.join(',')}`);
      }
    }
  }
  return found;
}
