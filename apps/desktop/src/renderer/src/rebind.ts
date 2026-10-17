import {
  KEYMAP,
  allBindings,
  commandsHearing,
  hears,
  keyForTools,
  keysOf,
  matches,
  pressOn,
  TOOL_SCOPES,
  typesSize,
  withBindings,
  type Binding,
  type Command,
  type CommandId,
  type KeyBindings,
  type KeyPress,
  type KeyboardLayout,
  type Scope,
} from './keymap.js';

/**
 * Changing a key (U.12, §2 *Shortcuts*): what Settings › Keyboard shortcuts
 * does with a press, and what `preferences.json` may hold. Pure: the keymap's
 * own matching decides everything, so a key stored here is one the window,
 * the board and the Parts tree hear exactly as they hear the defaults.
 */

/** What a press during a capture is. */
export type Captured =
  | Binding
  /** Esc, Tab, Enter — and the arrows, Home and End alone — keep their roles. */
  | 'reserved'
  /** A key no binding can say: Ctrl on macOS, the Windows key elsewhere, a key with no code. */
  | 'unusable'
  /** A letter's key held so it types something else — Option+A's `å` — which its letter would not match. */
  | 'typesOther'
  /** A digit, `.` or `,` alone, which the board takes as a size typed (U.16). */
  | 'typesSize'
  /** A modifier on its own: the capture keeps listening. */
  | null;

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'CapsLock']);
const ALWAYS_RESERVED = new Set(['Escape', 'Tab', 'Enter', 'NumpadEnter']);
/** A list's, a tree's, a menu's and a tab list's own keys, without a modifier. */
const NAVIGATION = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** A key a binding may not take, whatever it is stored as. */
function reserved(code: string, plain: boolean): boolean {
  return ALWAYS_RESERVED.has(code) || (plain && NAVIGATION.has(code));
}

function isModifier(code: string): boolean {
  return MODIFIERS.has(code.replace(/(Left|Right)$/, ''));
}

/** A key that types a size's digit, point or comma on most keyboards. */
const SIZE_KEY = /^(?:Digit\d|Numpad\d|NumpadDecimal|Period|Comma)$/;

/**
 * A binding of such a key with nothing held: the board takes the press as a
 * size typed into a shape (U.16), so it cannot also be a shortcut. Checked by
 * place, so a key that types `&` here but `1` on another keyboard is refused too.
 */
function sizeKey(binding: Binding): boolean {
  return (
    'code' in binding &&
    SIZE_KEY.test(binding.code) &&
    binding.mod !== true &&
    binding.shift !== true &&
    binding.alt !== true
  );
}

/**
 * The binding a press is (U.12). A key that types a Latin letter is stored as
 * that letter, wherever the layout puts it — the key that types `a` on a
 * French keyboard is where a US one has Q, and the keymap matches a letter by
 * what it types — and any other key by its place. The command key is Ctrl, or
 * ⌘ on macOS. Whatever comes out matches this same press, or the press is
 * refused: AltGr+A typing `ą` would otherwise bind the plain A. A digit, `.`
 * or `,` alone is a size typed on the board, never a shortcut.
 */
export function bindingFor(press: KeyPress, isMac: boolean): Captured {
  if (isModifier(press.code) || MODIFIERS.has(press.key)) return null;
  const command = isMac ? press.metaKey : press.ctrlKey;
  const other = isMac ? press.ctrlKey : press.metaKey;
  if (reserved(press.code, !command && !press.altKey)) return 'reserved';
  if (other) return 'unusable';
  const typed = keyForTools(press);
  const letter = /^[a-z]$/i.test(typed) ? typed.toUpperCase() : null;
  const binding: Binding = {
    code: letter === null ? press.code : `Key${letter}`,
    ...(command ? { mod: true } : {}),
    ...(press.shiftKey ? { shift: true } : {}),
    ...(press.altKey ? { alt: true } : {}),
  };
  if (!CODE.test(binding.code)) return 'unusable';
  if (typesSize(press) || sizeKey(binding)) return 'typesSize';
  // Against no keymap: whether the binding can say this press at all.
  return matches(press, binding, isMac, []) ? binding : 'typesOther';
}

/** The keys the main process hears before any field does (`windowKeyFor`, 8.7). */
const HEARD_BY_MAIN: ReadonlySet<CommandId> = new Set(['fullScreen', 'quit']);

/**
 * Where a command's keys must be its alone: what the maker sees as one place.
 * A Parts row and the board hear the window's keys, so those three are one;
 * a field's keys are the field's; Full screen and Quit are heard in a field too.
 *
 * A tool under way shadows the window on purpose — the polyline's A is not the
 * Arc tool's — so the polyline and Edit Points are each their own place, and
 * any window key may be given to one of their commands. That is safe by one
 * rule, which every tool keeps and its tests hold it to: **a tool claims every
 * key it acts on** (`onKey` returns true), so the window's command for that key
 * does not run as well; and a key it does not act on — the polyline idle, no
 * corner picked — is the window's, as A is the Arc tool's outside a run. Take
 * back on Ctrl+Z takes a point back mid-run and undoes otherwise.
 */
export function clashScopes(id: CommandId): readonly Scope[] {
  const scope = KEYMAP.find((command) => command.id === id)?.scope ?? 'window';
  if (scope === 'polyline' || scope === 'points' || scope === 'field') return [scope];
  return HEARD_BY_MAIN.has(id)
    ? ['window', 'canvas', 'tree', 'field']
    : ['window', 'canvas', 'tree'];
}

/**
 * Whether the maker can change a command's keys: it exists, and is not fixed.
 * On macOS Quit is the app menu's own ⌘Q, which macOS hears and no other key
 * reaches, so it is fixed there.
 */
export function isChangeable(id: CommandId, isMac = false): boolean {
  const command = KEYMAP.find((entry) => entry.id === id);
  return command !== undefined && command.fixed !== true && !(isMac && id === 'quit');
}

/**
 * Whether a command may have this key. Full screen and Quit are heard by the
 * main process even in a text field, so they need a function key, or the
 * command key or Alt held: a bare letter there would never be typed.
 */
function allowed(id: CommandId, binding: Binding): boolean {
  if (!HEARD_BY_MAIN.has(id)) return true;
  return (
    'code' in binding &&
    (binding.mod === true || binding.alt === true || /^F\d+$/.test(binding.code))
  );
}

/** A change being made: a command's new keys — `null` for its defaults — and the presses they are here. */
export interface Proposal {
  readonly id: CommandId;
  readonly keys: readonly Binding[] | null;
  readonly presses: readonly KeyPress[];
}

/** A key pressed for a command in Settings. */
export function proposeKey(id: CommandId, binding: Binding, press: KeyPress): Proposal {
  return { id, keys: [binding], presses: [press] };
}

/** A command back to its defaults, each pressed on this keyboard. */
export function proposeReset(
  id: CommandId,
  layout: KeyboardLayout | null,
  isMac: boolean,
): Proposal {
  const command = KEYMAP.find((entry) => entry.id === id);
  const presses = (command === undefined ? [] : allBindings(command))
    .map((binding) => pressOn(binding, layout, isMac))
    .filter((press) => press !== null);
  return { id, keys: null, presses };
}

/** What a proposal comes to. */
export type Change =
  | { readonly bindings: KeyBindings }
  /** Another command has the key here: Swap, if it can take this one's keys, or Cancel. */
  | { readonly clash: CommandId; readonly canSwap: boolean }
  /** Full screen and Quit need a function key or a modifier. */
  | 'needsModifier'
  | 'unusable';

/** A proposal applied, if no other command in the same place has the key. */
export function apply(bindings: KeyBindings, proposal: Proposal, isMac: boolean): Change {
  const { id, keys } = proposal;
  if (!isChangeable(id, isMac)) return 'unusable';
  if (keys !== null && !keys.every((binding) => allowed(id, binding))) return 'needsModifier';
  const keymap = withBindings(bindings);
  const owners = ownersOf(keymap, proposal, isMac);
  const [owner] = owners;
  if (owner !== undefined) {
    return { clash: owner, canSwap: swapped(bindings, proposal, isMac, owners) !== null };
  }
  const next = withKeys(bindings, id, keys);
  return heardAsProposed(next, proposal, isMac) ? { bindings: next } : 'unusable';
}

/**
 * The proposal applied, the command that had the key giving it up and taking
 * the changed command's keys in its place. As it was when no swap can be made:
 * the owner is fixed, more than one command has the keys, or the owner could
 * not have the keys it would be given.
 */
export function swap(bindings: KeyBindings, proposal: Proposal, isMac: boolean): KeyBindings {
  const owners = ownersOf(withBindings(bindings), proposal, isMac);
  if (owners.length === 0) {
    const change = apply(bindings, proposal, isMac);
    return typeof change === 'object' && 'bindings' in change ? change.bindings : bindings;
  }
  return swapped(bindings, proposal, isMac, owners) ?? bindings;
}

function swapped(
  bindings: KeyBindings,
  proposal: Proposal,
  isMac: boolean,
  owners: readonly CommandId[],
): KeyBindings | null {
  const [owner] = owners;
  if (owners.length !== 1 || owner === undefined || !isChangeable(owner, isMac)) return null;
  const keymap = withBindings(bindings);
  const ownCommand = keymap.find((command) => command.id === owner)!;
  const changed = KEYMAP.find((command) => command.id === proposal.id)!;
  const proposedKeys = heardKeys(changed, proposal.keys ?? allBindings(changed));
  // A key of the owner's goes if it is heard as the proposal is — by the same
  // rule as dispatch, Shift and all for a board's tool.
  const taken = (binding: Binding): boolean => {
    const alone = { ...ownCommand, keys: [binding], aliases: [] };
    return (
      proposal.presses.some((press) => hears(alone, press, isMac, keymap)) ||
      heardKeys(ownCommand, [binding]).some((key) => proposedKeys.includes(key))
    );
  };
  const kept = keysOf(owner, keymap).filter((binding) => !taken(binding));
  const given = keysOf(proposal.id, keymap).filter(
    (binding) => !kept.some((key) => sameKey(key, binding)),
  );
  if (!given.every((binding) => allowed(owner, binding))) return null;
  const next = withKeys(withKeys(bindings, owner, [...kept, ...given]), proposal.id, proposal.keys);
  const after = withBindings(next);
  if (duplicated(after, owner).length > 0 || duplicated(after, proposal.id).length > 0) return null;
  return heardAsProposed(next, proposal, isMac) ? next : null;
}

/**
 * The other commands in the same place that have the proposed keys: those a
 * press of them is now — German − is Zoom out's where a US keyboard has `/` —
 * and those bound to the very same keys, which a layout may have hidden.
 */
function ownersOf(
  keymap: readonly Command[],
  { id, keys, presses }: Proposal,
  isMac: boolean,
): readonly CommandId[] {
  const scopes = clashScopes(id);
  const own = KEYMAP.find((command) => command.id === id)!;
  const proposed = heardKeys(own, keys ?? allBindings(own));
  const owners = new Set<CommandId>();
  for (const press of presses) {
    for (const heard of commandsHearing(press, scopes, isMac, keymap)) owners.add(heard);
  }
  for (const command of keymap) {
    if (!scopes.includes(command.scope)) continue;
    if (heardKeys(command, allBindings(command)).some((key) => proposed.includes(key))) {
      owners.add(command.id);
    }
  }
  owners.delete(id);
  return [...owners];
}

/** Whether, with these keys, each press of the proposal is its command's alone. */
function heardAsProposed(
  bindings: KeyBindings,
  { id, presses }: Proposal,
  isMac: boolean,
): boolean {
  const keymap = withBindings(bindings);
  return presses.every((press) => {
    const heard = commandsHearing(press, clashScopes(id), isMac, keymap);
    return heard.length === 1 && heard[0] === id;
  });
}

/** The keys with one command's set — `null` for its defaults — and none stored equal to them. */
function withKeys(
  bindings: KeyBindings,
  id: CommandId,
  keys: readonly Binding[] | null,
): KeyBindings {
  const { [id]: _old, ...rest } = bindings;
  const defaults = KEYMAP.find((command) => command.id === id)?.keys ?? [];
  const same =
    keys === null ||
    (keys.length === defaults.length && keys.every((key, index) => sameKey(key, defaults[index]!)));
  return same ? rest : { ...rest, [id]: keys };
}

/** Whether the maker changed a command's keys. */
export function differs(bindings: KeyBindings, id: CommandId): boolean {
  return bindings[id] !== undefined;
}

/** One binding's identity: its code or character, and the modifiers it holds. */
function keyOf(binding: Binding): string {
  return 'char' in binding
    ? `char ${binding.char} ${String(binding.mod === true)}`
    : [binding.code, binding.mod === true, binding.shift === true, binding.alt === true].join(' ');
}

const sameKey = (a: Binding, b: Binding): boolean => keyOf(a) === keyOf(b);

/**
 * The keys a command hears with these bindings, as identities: each binding,
 * and for a board's tool the same with Shift held too — the rule `hears`
 * dispatches by, so a clash is found where a press would be heard twice.
 */
function heardKeys(command: Command, bindings: readonly Binding[]): string[] {
  const tool = TOOL_SCOPES.includes(command.scope);
  return bindings.flatMap((binding) =>
    tool && 'code' in binding && binding.shift !== true
      ? [keyOf(binding), keyOf({ ...binding, shift: true })]
      : [keyOf(binding)],
  );
}

/** The other commands in the same place that hear one of this command's very keys. */
export function duplicated(keymap: readonly Command[], id: CommandId): readonly CommandId[] {
  const own = keymap.find((command) => command.id === id);
  if (own === undefined) return [];
  const mine = new Set(heardKeys(own, allBindings(own)));
  const scopes = clashScopes(id);
  return keymap
    .filter(
      (command) =>
        command.id !== id &&
        scopes.includes(command.scope) &&
        heardKeys(command, allBindings(command)).some((key) => mine.has(key)),
    )
    .map((command) => command.id);
}

const CODE = /^[A-Z][A-Za-z0-9]*$/;
/** A character a binding may be by itself: one, and not a letter, a digit or a space. */
const CHARACTER = /^[^\p{L}\p{N}\s]$/u;
const MOST_KEYS = 4;

/** One stored binding, tidied, or null when it is not one a key could be. */
function readBinding(value: unknown): Binding | null {
  if (typeof value !== 'object' || value === null) return null;
  const { code, char, mod, shift, alt } = value as Record<string, unknown>;
  const flag = (held: unknown): boolean | null =>
    held === undefined || held === false ? false : held === true ? true : null;
  const [isMod, isShift, isAlt] = [flag(mod), flag(shift), flag(alt)];
  if (isMod === null || isShift === null || isAlt === null) return null;
  const held = {
    ...(isMod ? { mod: true } : {}),
    ...(isShift ? { shift: true } : {}),
    ...(isAlt ? { alt: true } : {}),
  };
  if (typeof code === 'string' && char === undefined) {
    if (!CODE.test(code) || isModifier(code) || reserved(code, !isMod && !isAlt)) return null;
    const binding = { code, ...held };
    return sizeKey(binding) ? null : binding;
  }
  // A character is typed with whatever Shift the layout needs: only the command key is held.
  if (
    typeof char === 'string' &&
    code === undefined &&
    !isShift &&
    !isAlt &&
    CHARACTER.test(char)
  ) {
    return { char, ...(isMod ? { mod: true } : {}) };
  }
  return null;
}

/**
 * The maker's keys as `preferences.json` holds them, kept only where usable
 * (docs/file-format.md §6): a command this version has and lets change, one
 * to four keys a binding can say, none reserved, and none another command in
 * the same place has — the later of two such changes is dropped. Never
 * throws: a damaged file loses those keys, and the app starts. Both processes
 * read the maker's keys through this, so they always agree on them.
 */
export function readBindings(value: unknown, isMac = false): KeyBindings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  let kept: Partial<Record<CommandId, readonly Binding[]>> = {};
  for (const [id, list] of Object.entries(value as Record<string, unknown>)) {
    if (!isChangeable(id as CommandId, isMac) || !Array.isArray(list)) continue;
    if (list.length === 0 || list.length > MOST_KEYS) continue;
    const keys = list.map(readBinding);
    if (!keys.every((key) => key !== null && allowed(id as CommandId, key))) continue;
    kept = withKeys(kept, id as CommandId, keys as Binding[]);
  }
  // A change that shares a key with another command goes, the latest first;
  // dropping one brings its defaults back, which may share one in turn.
  for (;;) {
    const keymap = withBindings(kept);
    const ids = Object.keys(kept) as CommandId[];
    const culprit = ids.findLast((id) =>
      keymap.some(
        (command) =>
          duplicated(keymap, command.id).includes(id) ||
          (command.id === id && duplicated(keymap, id).length > 0),
      ),
    );
    if (culprit === undefined) return kept;
    kept = withKeys(kept, culprit, null);
  }
}
