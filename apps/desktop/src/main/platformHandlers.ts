import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';

import { IPC } from '../shared/ipc.js';

/**
 * Writes via a temporary file and an atomic rename.
 *
 * rename(2) within a filesystem is atomic, so a crash mid-write leaves either
 * the old file or the new one — never a truncated project. This matters more
 * here than almost anywhere else in the app: a .lcp file is hours of someone's
 * work. See docs/file-format.md §7.
 */
async function writeFileAtomic(path: string, data: Uint8Array): Promise<void> {
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

/**
 * Implements PlatformHost in the main process. The renderer reaches these
 * through the preload bridge; it has no direct filesystem access.
 */
export function registerPlatformHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.readFile, async (_event, path: string) => {
    const buffer = await readFile(path);
    return new Uint8Array(buffer);
  });

  ipcMain.handle(IPC.writeFile, async (_event, path: string, data: Uint8Array) => {
    await writeFileAtomic(path, data);
  });

  ipcMain.handle(IPC.showOpenDialog, async (_event, options: Electron.OpenDialogOptions) => {
    const window = getWindow();
    const result = window
      ? await dialog.showOpenDialog(window, { ...options, properties: ['openFile'] })
      : await dialog.showOpenDialog({ ...options, properties: ['openFile'] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC.showSaveDialog, async (_event, options: Electron.SaveDialogOptions) => {
    const window = getWindow();
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options);
    return result.canceled ? null : (result.filePath ?? null);
  });

  ipcMain.handle(IPC.openInExternalViewer, async (_event, path: string) => {
    const error = await shell.openPath(path);
    if (error !== '') throw new Error(error);
  });

  ipcMain.handle(IPC.getUserConfigDir, () => join(app.getPath('userData')));

  ipcMain.handle(IPC.getAppVersion, () => app.getVersion());
}
