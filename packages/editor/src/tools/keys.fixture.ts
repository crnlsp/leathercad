import type { KeyInput, ToolKey } from '../tool.js';

/**
 * What the app's default keymap makes of a key, for the tools' tests: the app
 * decides what a press means (U.12), and by default Delete deletes, Backspace
 * takes a point back, A and L choose the next segment and R rounds a corner.
 */
const DEFAULT_MEANS: Readonly<Record<string, readonly ToolKey[]>> = {
  Delete: ['delete', 'removePoint'],
  Backspace: ['delete', 'takeBack', 'removePoint'],
  a: ['arc'],
  l: ['straight'],
  r: ['roundCorner'],
};

/** A key pressed alone, meaning what the default keymap makes it mean — or `means`, when given. */
export function keyInput(key: string, means?: readonly ToolKey[]): KeyInput {
  const named = key.length === 1 ? key.toLowerCase() : key;
  return {
    key,
    means: new Set(means ?? DEFAULT_MEANS[named] ?? []),
    shiftKey: false,
    ctrlKey: false,
  };
}
