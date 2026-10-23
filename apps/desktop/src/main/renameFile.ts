import { constants } from 'node:fs';
import { copyFile, link, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** What renaming a project's file came to (8.12). */
export type RenameOutcome =
  | { readonly kind: 'renamed'; readonly path: string }
  /** The name it already has: nothing to do. */
  | { readonly kind: 'unchanged'; readonly path: string }
  /** Another file has the name in that folder: nothing was touched. */
  | { readonly kind: 'exists'; readonly file: string }
  /** No file can have that name, on this platform or another. */
  | { readonly kind: 'invalid' };

/** Characters no file name may hold on Windows, where the strictest rules are. */
const FORBIDDEN = /[<>:"/\\|?*]/;
/** Names Windows keeps for devices, with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
/** Long enough for any name a maker types; short of every file system's limit. */
const MAX_LENGTH = 200;

/**
 * The file name a project name gives — `Wallet.lcp` for "Wallet" — or null
 * when no file could be called that. Checked by Windows' rules everywhere, so
 * a project named on Linux can still be copied to a Windows machine.
 */
export function projectFileName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') return null;
  if (trimmed.length > MAX_LENGTH || FORBIDDEN.test(trimmed)) return null;
  // Nor a control character: a tab, a newline.
  if ([...trimmed].some((character) => character.charCodeAt(0) < 0x20)) return null;
  // Windows drops a trailing dot or space, so `Wallet.` would be `Wallet`.
  if (/[. ]$/.test(trimmed) || RESERVED.test(trimmed)) return null;
  return `${trimmed}.lcp`;
}

/**
 * Renames a project's file to its new name, in the same folder (8.12) —
 * **never over another file**. The new name is linked first, which fails if
 * anything has it, even a file that appears between a check and the rename;
 * only then is the old name let go. Where links are not to be had (FAT, some
 * network drives), an exclusive copy does the same. A change of case alone,
 * which a case-insensitive disk sees as the same file, is a plain rename.
 */
export async function renameProjectFile(from: string, name: string): Promise<RenameOutcome> {
  const fileName = projectFileName(name);
  if (fileName === null) return { kind: 'invalid' };
  const to = join(dirname(from), fileName);
  if (to === from) return { kind: 'unchanged', path: from };

  if (await sameFile(from, to)) {
    await rename(from, to);
    return { kind: 'renamed', path: to };
  }

  try {
    await link(from, to);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return { kind: 'exists', file: fileName };
    if (code !== 'EPERM' && code !== 'ENOTSUP' && code !== 'EXDEV' && code !== 'EOPNOTSUPP') {
      throw error;
    }
    try {
      await copyFile(from, to, constants.COPYFILE_EXCL);
    } catch (copied) {
      if ((copied as NodeJS.ErrnoException).code === 'EEXIST') {
        return { kind: 'exists', file: fileName };
      }
      throw copied;
    }
  }
  await unlink(from);
  return { kind: 'renamed', path: to };
}

/** Both names reach one file: a change of case on a disk that ignores case. */
async function sameFile(a: string, b: string): Promise<boolean> {
  const [first, second] = await Promise.all([stat(a), stat(b).catch(() => null)]);
  return second !== null && first.dev === second.dev && first.ino === second.ino;
}
