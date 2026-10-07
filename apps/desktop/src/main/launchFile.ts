import { extname, isAbsolute, resolve, type PlatformPath } from 'node:path';

/** The path rules an argument is read by: the running platform's, or either in a test. */
type PathRules = Pick<PlatformPath, 'extname' | 'isAbsolute' | 'resolve'>;

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
 *
 * `path` is the running platform's rules. Tests pass `posix` and `win32`, so
 * both are checked on every platform rather than each only on its own.
 */
export function projectPathFromArgs(
  args: readonly string[],
  cwd: string,
  path: PathRules = { extname, isAbsolute, resolve },
): string | null {
  for (const arg of args) {
    if (arg.startsWith('-')) continue;
    if (path.extname(arg).toLowerCase() !== '.lcp') continue;
    return path.isAbsolute(arg) ? path.resolve(arg) : path.resolve(cwd, arg);
  }
  return null;
}
