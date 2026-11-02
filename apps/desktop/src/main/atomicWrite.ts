import { randomBytes } from 'node:crypto';
import { mkdir, open, readlink, realpath, rename, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * Writes via a temporary file and an atomic rename.
 *
 * rename(2) within a filesystem is atomic, so a crash mid-write leaves either
 * the old file or the new one — never a truncated project. This matters more
 * here than almost anywhere else in the app: a .lcp file is hours of someone's
 * work. See docs/file-format.md §7. The temporary file is `<path>.<hex>.tmp`,
 * which crash recovery relies on to recognise a scrap (slice 5.3b).
 *
 * Atomic is not durable, though. Renaming a file whose data is still in the
 * page cache can, after a power cut, leave the new name on an empty file; so
 * the data is flushed before the rename, and the folder after it, which is
 * what makes the rename itself survive (Q35).
 *
 * A symbolic link is written through: the file is replaced where the link
 * leads, and the link stays. The file keeps the permission bits it had.
 */
export async function writeFileAtomic(path: string, data: Uint8Array): Promise<void> {
  const target = await resolveLink(path);
  const folder = dirname(target);
  await mkdir(folder, { recursive: true });
  const mode = await modeOf(target);
  const temporaryPath = `${target}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    const file = await open(temporaryPath, 'w');
    try {
      await file.writeFile(data);
      if (mode !== null) await file.chmod(mode);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporaryPath, target);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
  await syncFolder(folder);
}

/** Where a write to `path` lands: past any links, even ones whose target is not there yet. */
async function resolveLink(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (!isCode(error, 'ENOENT')) throw error;
  }
  // Missing, or a link to nothing: only the second has something to read.
  const leadsTo = await readlink(path).then(
    (link) => link,
    () => null,
  );
  return leadsTo === null ? path : resolve(dirname(path), leadsTo);
}

/** The permission bits of the file being replaced; null when there is none. */
async function modeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mode & 0o7777;
  } catch (error) {
    if (isCode(error, 'ENOENT')) return null;
    throw error;
  }
}

/**
 * Flushes a folder's entries, so the rename survives a power cut. Windows
 * cannot open a folder to flush it and does not need to — NTFS journals the
 * rename — and a few file systems refuse (EINVAL, ENOTSUP); the data is
 * already flushed and renamed by then, so those are the only errors let go.
 */
async function syncFolder(folder: string): Promise<void> {
  if (process.platform === 'win32') return;
  const handle = await open(folder, 'r');
  try {
    await handle.sync();
  } catch (error) {
    if (!isCode(error, 'EINVAL') && !isCode(error, 'ENOTSUP')) throw error;
  } finally {
    await handle.close();
  }
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
