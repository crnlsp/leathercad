/**
 * A key as the app prints it on the platform the test runs on, written the
 * Linux and Windows way: `caption('Ctrl+Shift+S')` is `Ctrl+Shift+S` there and
 * `⇧⌘S` on macOS, in its order and with ⌘ for the command key (keymap.ts
 * `keyLabel`). A test presses the same key as `ControlOrMeta+…`.
 */
export function caption(keys: string): string {
  if (process.platform !== 'darwin') return keys;
  const parts = /^((?:(?:Ctrl|Alt|Shift)\+)*)(.+)$/.exec(keys);
  const held = parts?.[1] ?? '';
  const name = parts?.[2] ?? keys;
  const mark = (modifier: string, symbol: string): string =>
    held.includes(`${modifier}+`) ? symbol : '';
  return `${mark('Alt', '⌥')}${mark('Shift', '⇧')}${mark('Ctrl', '⌘')}${name}`;
}
