import { randomBytes } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Writes via a temporary file and an atomic rename.
 *
 * rename(2) within a filesystem is atomic, so a crash mid-write leaves either
 * the old file or the new one — never a truncated project. This matters more
 * here than almost anywhere else in the app: a .lcp file is hours of someone's
 * work. See docs/file-format.md §7. The temporary file is `<path>.<hex>.tmp`,
 * which crash recovery relies on to recognise a scrap (slice 5.3b).
 */
export async function writeFileAtomic(path: string, data: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temporaryPath, data);
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
