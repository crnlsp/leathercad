import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useI18n } from './i18n.js';
import {
  currentKeymap,
  keyLabel,
  keysInSentences,
  shownKeys,
  subscribeKeymap,
  type Binding,
  type CommandId,
  type KeyboardLayout,
} from './keymap.js';
import type { Shortcut } from './shortcuts.js';

/** ⌘ for the command key, and the platform's order of modifiers. */
export const IS_MAC = navigator.userAgent.includes('Mac');

/**
 * What this keyboard types on each key (§2: keys are shown as the local
 * character). Chromium answers in this Electron's sandboxed renderer (found
 * in U.3); where it does not — or before it has — a key is shown as a US
 * keyboard prints it. Read again whenever the window comes back into focus,
 * which is when a layout switched elsewhere shows.
 *
 * ponytail: a layout switched while the window has focus shows on the next
 * focus; Chromium has no layout-change event to listen to. Matching does not
 * wait on this — it reads each key press (`keymap.ts`).
 */
let layout: KeyboardLayout | null = null;
const listeners = new Set<() => void>();

async function readLayout(): Promise<void> {
  const keyboard = (
    navigator as { keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } }
  ).keyboard;
  try {
    const map = await keyboard?.getLayoutMap?.();
    layout = map === undefined ? null : new Map(map);
  } catch {
    layout = null;
  }
  for (const listener of listeners) listener();
}

const onFocus = (): void => void readLayout();

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener('focus', onFocus);
    void readLayout();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('focus', onFocus);
  };
}

/** This keyboard's layout, where it is known; every key shown re-renders when it changes. */
export function useLayout(): KeyboardLayout | null {
  return useSyncExternalStore(subscribe, () => layout);
}

/** The keymap in effect: every key shown re-renders when the maker changes one (U.12). */
export function useKeymap(): ReturnType<typeof currentKeymap> {
  return useSyncExternalStore(subscribeKeymap, currentKeymap);
}

/** A key — a command's first, or a binding — as this keyboard and platform show it. */
export function useKeyLabel(): (of: CommandId | Binding) => string {
  const { t } = useI18n();
  const current = useLayout();
  const keymap = useKeymap();
  return useCallback(
    (of) => {
      const binding = typeof of === 'string' ? shownKeys(of, current, IS_MAC, keymap)[0] : of;
      return binding === undefined ? '' : keyLabel(binding, IS_MAC, current, t);
    },
    [current, keymap, t],
  );
}

/**
 * A shortcut list row's keys as this keyboard can press them (`shownKeys`):
 * a command's; a pointer gesture's as they are.
 */
export function useShownKeys(): (shortcut: Shortcut) => readonly Binding[] {
  const current = useLayout();
  const keymap = useKeymap();
  return useCallback(
    (shortcut) =>
      shortcut.id === undefined ? shortcut.keys : shownKeys(shortcut.id, current, IS_MAC, keymap),
    [current, keymap],
  );
}

/** A command's key as a key cap: the rail's look, in a tooltip, a menu or the shortcut list. */
export function KeyCap({ command }: { command: CommandId | Binding }) {
  return <kbd>{useKeyLabel()(command)}</kbd>;
}

/** The keys the catalogue's sentences name, for their `{{placeholders}}` (U.3). */
export function useKeysInSentences(): Readonly<Record<string, string>> {
  const { t } = useI18n();
  const label = useKeyLabel();
  const keymap = useKeymap();
  return useMemo(() => keysInSentences(label, t, keymap), [label, t, keymap]);
}
