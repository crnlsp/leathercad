import { extname, isAbsolute, resolve } from 'node:path';

/**
 * The project a launch was asked to open, from its command line (slice 8.5).
 *
 * Double-clicking a `.lcp` starts the app with the file's path as an
 * argument, on Linux and Windows alike. Everything else on the line is
 * Electron's or Chromium's — `.`, the app's own directory in development, and
 * switches — so only an argument naming a project counts: a path ending in
 * `.lcp`, resolved against the directory the launch came from. The first
 * wins; the app has one window.
 *
 * Only a **name** is checked here. Whether the file exists, and whether it is
 * a project, is found out by opening it, which says so in the app.
 */
export function projectPathFromArgs(args: readonly string[], cwd: string): string | null {
  for (const arg of args) {
    if (arg.startsWith('-')) continue;
    if (extname(arg).toLowerCase() !== '.lcp') continue;
    return isAbsolute(arg) ? resolve(arg) : resolve(cwd, arg);
  }
  return null;
}
