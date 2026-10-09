import type { MessageKey, Translate } from '../../shared/i18n.js';
import { ALL_TOOLS, type ToolId } from './tools.js';

/**
 * A key the window answers to: by **where it is** on the keyboard — a
 * `KeyboardEvent.code`, the same on every layout — with the modifiers held.
 * `mod` is Ctrl, or ⌘ on macOS.
 *
 * Or by **what it types**, for the keys named by their symbol, which every
 * layout types without AltGr: `?` alone — Shift with `/` in the US, with `ß`
 * in Germany, with `,` in France — and the zoom keys' `=`, `+` and `-` with
 * the command key, which a German keyboard prints right of Ü and where the US
 * has `/`, and a French one on its 6 key. Shift is how a layout reaches a
 * character, so it is not held against one.
 */
export type Binding =
  | {
      readonly code: string;
      readonly mod?: boolean;
      readonly shift?: boolean;
      readonly alt?: boolean;
    }
  | { readonly char: string; readonly mod?: boolean };

/** A key press, as much of a `KeyboardEvent` as matching reads. */
export interface KeyPress {
  readonly code: string;
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

/** What each key types with no modifier, by its code: `navigator.keyboard.getLayoutMap()`. */
export type KeyboardLayout = ReadonlyMap<string, string>;

/** Its heading in the shortcut list is `shortcuts.group.<id>`. */
export type ShortcutGroupId =
  'file' | 'edit' | 'view' | 'window' | 'tools' | 'drawing' | 'editingPoints';

/**
 * Where a key is heard. The window's commands are dispatched through
 * `commandFor`. The others are a tool's own — the board's active tool, the
 * polyline mid-run, Edit Points — heard by the tool in `packages/editor` by
 * the key's name; they are here so the shortcut list shows them, and so a
 * sentence that names one takes it from here.
 */
export type Scope = 'window' | 'canvas' | 'polyline' | 'points';

export type CommandId =
  | 'newProject'
  | 'openProject'
  | 'save'
  | 'saveAs'
  | 'exportPdf'
  | 'print'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'contextMenu'
  | 'cancel'
  | 'design'
  | 'sheets'
  | 'zoomIn'
  | 'zoomOut'
  | 'fit'
  | 'settings'
  | 'keyboardShortcuts'
  | 'fullScreen'
  | 'quit'
  | `tool.${ToolId}`
  | 'finishPolyline'
  | 'takeBack'
  | 'arcOrStraight'
  | 'removePoint'
  | 'roundCorner';

export interface Command {
  readonly id: CommandId;
  /** What it does, in the catalogue (ADR 0018). */
  readonly does: MessageKey;
  readonly group: ShortcutGroupId;
  readonly scope: Scope;
  /** Its keys, as shown; a tooltip, a menu and a sentence show the first. */
  readonly keys: readonly Binding[];
  /** Heard too and never shown: the numeric keypad's twin. */
  readonly aliases?: readonly Binding[];
}

const mod = (code: string, shift = false): Binding =>
  shift ? { code, mod: true, shift: true } : { code, mod: true };
const key = (code: string): Binding => ({ code });
const modChar = (char: string): Binding => ({ char, mod: true });

/**
 * Every key LeatherCAD answers to, in one place (U.3; the list was 8.2's).
 *
 * The window's handler dispatches through it, the shortcut list is drawn from
 * it, and every key shown — a tooltip's, a menu's, the rail's — is read from
 * it, so none can name a key the app does not have. Defaults for now; U.12
 * lets the maker change them.
 *
 * F11 and Ctrl+Q are heard by the main process (`windowKeyFor`), which
 * matches them through this too. Shift+F10 and the Menu key reach the window
 * as a `contextmenu` event, so the browser matches those.
 */
export const KEYMAP: readonly Command[] = [
  {
    id: 'newProject',
    does: 'shortcuts.newProject',
    group: 'file',
    scope: 'window',
    keys: [mod('KeyN')],
  },
  {
    id: 'openProject',
    does: 'shortcuts.openProject',
    group: 'file',
    scope: 'window',
    keys: [mod('KeyO')],
  },
  { id: 'save', does: 'shortcuts.save', group: 'file', scope: 'window', keys: [mod('KeyS')] },
  {
    id: 'saveAs',
    does: 'shortcuts.saveAs',
    group: 'file',
    scope: 'window',
    keys: [mod('KeyS', true)],
  },
  {
    id: 'exportPdf',
    does: 'shortcuts.exportPdf',
    group: 'file',
    scope: 'window',
    keys: [mod('KeyE')],
  },
  { id: 'print', does: 'shortcuts.print', group: 'file', scope: 'window', keys: [mod('KeyP')] },

  { id: 'undo', does: 'shortcuts.undo', group: 'edit', scope: 'window', keys: [mod('KeyZ')] },
  { id: 'redo', does: 'shortcuts.redo', group: 'edit', scope: 'window', keys: [mod('KeyZ', true)] },
  {
    id: 'delete',
    does: 'shortcuts.delete',
    group: 'edit',
    scope: 'canvas',
    keys: [key('Delete'), key('Backspace')],
  },
  {
    id: 'contextMenu',
    does: 'shortcuts.contextMenu',
    group: 'edit',
    scope: 'window',
    keys: [{ code: 'F10', shift: true }, key('ContextMenu')],
  },
  { id: 'cancel', does: 'shortcuts.cancel', group: 'edit', scope: 'canvas', keys: [key('Escape')] },

  {
    id: 'design',
    does: 'shortcuts.design',
    group: 'view',
    scope: 'window',
    keys: [mod('Digit1')],
    aliases: [mod('Numpad1')],
  },
  {
    id: 'sheets',
    does: 'shortcuts.sheets',
    group: 'view',
    scope: 'window',
    keys: [mod('Digit2')],
    aliases: [mod('Numpad2')],
  },
  {
    id: 'zoomIn',
    does: 'shortcuts.zoomIn',
    group: 'view',
    scope: 'window',
    // Shown as the one of the two this keyboard types without Shift.
    keys: [modChar('='), modChar('+')],
    aliases: [mod('NumpadAdd')],
  },
  {
    id: 'zoomOut',
    does: 'shortcuts.zoomOut',
    group: 'view',
    scope: 'window',
    keys: [modChar('-')],
    aliases: [mod('NumpadSubtract')],
  },
  {
    id: 'fit',
    does: 'shortcuts.fit',
    group: 'view',
    scope: 'window',
    keys: [mod('Digit0')],
    aliases: [mod('Numpad0')],
  },

  {
    id: 'settings',
    does: 'shortcuts.settings',
    group: 'window',
    scope: 'window',
    keys: [mod('Comma')],
  },
  {
    id: 'keyboardShortcuts',
    does: 'shortcuts.keyboardShortcuts',
    group: 'window',
    scope: 'window',
    keys: [mod('Slash'), { char: '?' }],
  },
  {
    id: 'fullScreen',
    does: 'shortcuts.fullScreen',
    group: 'window',
    scope: 'window',
    keys: [key('F11')],
  },
  { id: 'quit', does: 'shortcuts.quit', group: 'window', scope: 'window', keys: [mod('KeyQ')] },

  ...ALL_TOOLS.map((tool): Command => ({
    id: `tool.${tool.id}`,
    does: `tools.${tool.id}.name`,
    group: 'tools',
    scope: 'window',
    keys: [key(`Key${tool.key}`)],
  })),

  {
    id: 'finishPolyline',
    does: 'shortcuts.finishPolyline',
    group: 'drawing',
    scope: 'polyline',
    keys: [key('Enter')],
  },
  {
    id: 'takeBack',
    does: 'shortcuts.takeBack',
    group: 'drawing',
    scope: 'polyline',
    keys: [key('Backspace')],
  },
  {
    id: 'arcOrStraight',
    does: 'shortcuts.arcOrStraight',
    group: 'drawing',
    scope: 'polyline',
    keys: [key('KeyA'), key('KeyL')],
  },
  {
    id: 'removePoint',
    does: 'shortcuts.removePoint',
    group: 'editingPoints',
    scope: 'points',
    keys: [key('Delete'), key('Backspace')],
  },
  {
    id: 'roundCorner',
    does: 'shortcuts.roundCorner',
    group: 'editingPoints',
    scope: 'points',
    keys: [key('KeyR')],
  },
];

/** A command's keys. */
export function keysOf(id: CommandId): readonly Binding[] {
  return KEYMAP.find((command) => command.id === id)?.keys ?? [];
}

/**
 * Whether a key press is this binding.
 *
 * By its code and exactly its modifiers — Ctrl+Alt+S is not Ctrl+S, which on
 * Windows is what AltGr+S sends. A letter key is the exception: R is
 * Rectangle because R begins the word, so it is the key that **types** R on
 * this keyboard — where a French or German one puts it — read from the press
 * itself, so it follows a layout switched mid-session. A keyboard that types
 * no Latin letter there (Cyrillic, Greek) finds it at its US place. And a key
 * that types a letter is that letter's, never the punctuation key at its
 * place: one press is never two commands. So is a key that types a bound
 * character — German −, where a US keyboard has `/`, zooms out — but for a
 * digit key bound at its place, which keeps it: Ctrl+1 is Design even where
 * that key types `+` (Czech).
 */
export function matches(event: KeyPress, binding: Binding, isMac: boolean): boolean {
  if ('char' in binding) return typesCharacter(event, binding, isMac) && !digitClaims(event, isMac);
  if (!holdsExactly(event, binding, isMac)) return false;
  // ASCII only: a Turkish `ı` upper-cases to I, and is not the I key.
  const typed = keyForTools(event);
  const typedLetter = /^[a-z]$/i.test(typed);
  const letter = /^Key([A-Z])$/.exec(binding.code)?.[1];
  // What a key types outranks where it is: a key that types a letter is that
  // letter's — Dvorak's z sits where a US keyboard has `/`, and Ctrl+Z there
  // undoes — and one that types a bound character is that character's.
  if (letter !== undefined) return typedLetter && typed.toUpperCase() === letter;
  if (event.code !== binding.code || typedLetter) return false;
  return DIGIT.test(binding.code) || !characterClaims(event, isMac);
}

const DIGIT = /^Digit\d$/;

/** The command key as the platform has it, and exactly the binding's other modifiers. */
function holdsExactly(
  event: KeyPress,
  binding: { readonly mod?: boolean; readonly shift?: boolean; readonly alt?: boolean },
  isMac: boolean,
): boolean {
  const command = isMac ? event.metaKey : event.ctrlKey;
  const other = isMac ? event.ctrlKey : event.metaKey;
  return (
    !other &&
    command === (binding.mod === true) &&
    event.shiftKey === (binding.shift === true) &&
    event.altKey === (binding.alt === true)
  );
}

/** The character, with the command key if the binding has it and no other — Shift aside. */
function typesCharacter(
  event: KeyPress,
  binding: { readonly char: string; readonly mod?: boolean },
  isMac: boolean,
): boolean {
  const command = isMac ? event.metaKey : event.ctrlKey;
  const other = isMac ? event.ctrlKey : event.metaKey;
  return (
    event.key === binding.char && command === (binding.mod === true) && !other && !event.altKey
  );
}

const allBindings = (command: Command): readonly Binding[] => [
  ...command.keys,
  ...(command.aliases ?? []),
];

/** A digit key bound at its place, held as bound, whatever it types. */
function digitClaims(event: KeyPress, isMac: boolean): boolean {
  return (
    DIGIT.test(event.code) &&
    KEYMAP.some((command) =>
      allBindings(command).some(
        (binding) =>
          'code' in binding && binding.code === event.code && holdsExactly(event, binding, isMac),
      ),
    )
  );
}

/** A press that types a bound character, as it is bound. */
function characterClaims(event: KeyPress, isMac: boolean): boolean {
  return KEYMAP.some((command) =>
    allBindings(command).some(
      (binding) => 'char' in binding && typesCharacter(event, binding, isMac),
    ),
  );
}

/**
 * The key a press is, as the board's tools hear it: what it typed, except
 * that a letter of a script with no Latin letters — `к`, `λ`, not `ą` — is
 * the Latin letter at its place. So the polyline claims A mid-run on the very
 * key the window reads as the Arc tool's.
 */
export function keyForTools(event: KeyPress): string {
  const place = /^Key([A-Z])$/.exec(event.code)?.[1];
  const otherScript = /^\p{L}$/u.test(event.key) && !/\p{Script=Latin}/u.test(event.key);
  return place !== undefined && otherScript ? place.toLowerCase() : event.key;
}

/** The window's command a key press asks for, if any. */
export function commandFor(event: KeyPress, isMac: boolean): CommandId | null {
  const command = KEYMAP.find(
    (entry) =>
      entry.scope === 'window' &&
      [...entry.keys, ...(entry.aliases ?? [])].some((binding) => matches(event, binding, isMac)),
  );
  return command?.id ?? null;
}

/** The US keyboard's character for each punctuation key: what is shown when the layout is unknown. */
const US_PUNCTUATION: Readonly<Record<string, string>> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  IntlBackslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

/** A US keyboard, as `getLayoutMap()` would read it: what a key is shown as, and pressed as, unknown. */
const US_LAYOUT: KeyboardLayout = new Map([
  ...[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(
    (letter) => [`Key${letter}`, letter.toLowerCase()] as const,
  ),
  ...[...'0123456789'].map((digit) => [`Digit${digit}`, digit] as const),
  ...Object.entries(US_PUNCTUATION),
]);

/**
 * A command's keys as this keyboard can press them, for its tooltip, menu
 * line and row in the shortcut list. Each is pressed, in thought, on this
 * layout and matched as the window matches it, so what is shown is what
 * works: a key another command takes here is left out — German −, where a
 * US keyboard has `/`, zooms out, so the list is reached by `?` there — and
 * of zoom's `=` and `+` the one this keyboard types without Shift is shown.
 * The first key when none would be left; a tool's own keys as they are.
 */
export function shownKeys(
  id: CommandId,
  layout: KeyboardLayout | null,
  isMac: boolean,
): readonly Binding[] {
  const command = KEYMAP.find((entry) => entry.id === id);
  if (command === undefined) return [];
  if (command.scope !== 'window') return command.keys;
  const shown = command.keys.filter((binding) => {
    // `?` is typed however this layout types it, Shift and all.
    if ('char' in binding && binding.mod !== true) return true;
    const event = pressOn(binding, layout ?? US_LAYOUT, isMac);
    return event !== null && commandFor(event, isMac) === id;
  });
  return shown.length > 0 ? shown : command.keys.slice(0, 1);
}

/** A binding pressed on a layout, as a maker would; null for a character it types only with Shift. */
function pressOn(binding: Binding, layout: KeyboardLayout, isMac: boolean): KeyPress | null {
  const held = {
    ctrlKey: binding.mod === true && !isMac,
    metaKey: binding.mod === true && isMac,
    shiftKey: false,
    altKey: false,
  };
  if ('char' in binding) {
    const code = [...layout].find(([, typed]) => typed === binding.char)?.[0];
    return code === undefined ? null : { ...held, code, key: binding.char };
  }
  const letter = /^Key([A-Z])$/.exec(binding.code)?.[1]?.toLowerCase();
  const code =
    letter === undefined
      ? binding.code
      : ([...layout].find(([, typed]) => typed === letter)?.[0] ?? binding.code);
  const typed = layout.get(code) ?? US_LAYOUT.get(code) ?? code;
  const shift = binding.shift === true;
  return {
    ...held,
    code,
    key: shift ? typed.toUpperCase() : typed,
    shiftKey: shift,
    altKey: binding.alt === true,
  };
}

/**
 * Keys named in words, which the interface's language names its own way
 * (Strg, Entf): by code, their name in `keys.*`. `Scroll`, `MiddleDrag` and
 * `Drag` are the pointer's, for the shortcut list's gestures.
 */
const NAMED: Readonly<Record<string, string>> = {
  Backspace: 'Backspace',
  Delete: 'Delete',
  Enter: 'Enter',
  Escape: 'Escape',
  ContextMenu: 'Menu',
  Scroll: 'Scroll',
  MiddleDrag: 'Middle-drag',
  Drag: 'drag',
};

/**
 * A key as this keyboard prints it (§2): a punctuation key as the character
 * this layout has there — `[`'s key is `ü` on a German keyboard — or the US
 * one when the layout is not known; a letter as its letter and a digit as its
 * digit, which every keyboard prints. Modifiers as the platform writes them:
 * `Ctrl+Shift+S`, and `⇧⌘S` in macOS's order.
 */
export function keyLabel(
  binding: Binding,
  isMac: boolean,
  layout: KeyboardLayout | null,
  t: Translate,
): string {
  // A character is shown as itself: Shift, if the layout needs it, is how it is typed.
  const name = 'char' in binding ? binding.char : keyName(binding.code, isMac, layout, t);
  const alt = 'code' in binding && binding.alt === true;
  const shift = 'code' in binding && binding.shift === true;
  const command = binding.mod === true;
  if (isMac) return `${alt ? '⌥' : ''}${shift ? '⇧' : ''}${command ? '⌘' : ''}${name}`;
  return [
    ...(command ? [t('keys.Ctrl')] : []),
    ...(alt ? [t('keys.Alt')] : []),
    ...(shift ? [t('keys.Shift')] : []),
    name,
  ].join('+');
}

function keyName(
  code: string,
  isMac: boolean,
  layout: KeyboardLayout | null,
  t: Translate,
): string {
  const letterOrDigit = /^(?:Key|Digit)(.)$/.exec(code)?.[1];
  if (letterOrDigit !== undefined) return letterOrDigit;
  const punctuation = US_PUNCTUATION[code];
  if (punctuation !== undefined) {
    const local = layout?.get(code);
    return local !== undefined && [...local].length === 1 ? local : punctuation;
  }
  // Shift held while drawing: a modifier on its own.
  if (code === 'Shift') return isMac ? '⇧' : t('keys.Shift');
  const named = NAMED[code];
  return named === undefined ? code : t(`keys.${named}` as MessageKey);
}

/**
 * The keys a sentence names, for its `{{placeholders}}`: a key is never
 * written into the catalogue's words (U.3), so it follows the keymap. Shift,
 * held, is named in words even on macOS — a sentence says "Hold Shift".
 */
export function keysInSentences(
  label: (binding: Binding) => string,
  t: Translate,
): Readonly<Record<string, string>> {
  const first = (id: CommandId, index = 0): string => {
    const binding = keysOf(id)[index];
    return binding === undefined ? '' : label(binding);
  };
  return {
    shift: t('keys.Shift'),
    delete: first('delete'),
    finish: first('finishPolyline'),
    takeBack: first('takeBack'),
    arc: first('arcOrStraight', 0),
    straight: first('arcOrStraight', 1),
    removePoint: first('removePoint'),
    roundCorner: first('roundCorner'),
    rectangle: first('tool.rectangle'),
    select: first('tool.select'),
    points: first('tool.points'),
  };
}
