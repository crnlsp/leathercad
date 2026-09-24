import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import log from 'electron-log/main';

import { IPC } from '../shared/ipc.js';
import { writeFileAtomic } from './atomicWrite.js';
import type { RecoveryStore } from './recovery.js';

/**
 * How often the renderer writes a recovery copy while there is unsaved work.
 * A minute, as `product-spec.md` §7 asks; E2E tests shorten it, since a crash
 * test cannot wait a minute for the copy it is about to recover.
 */
function recoveryIntervalMs(): number {
  const override = Number(process.env['LEATHERCAD_RECOVERY_INTERVAL_MS']);
  return Number.isFinite(override) && override > 0 ? override : 60_000;
}

/**
 * Implements PlatformHost in the main process. The renderer reaches these
 * through the preload bridge; it has no direct filesystem access.
 */
export function registerPlatformHandlers(
  getWindow: () => BrowserWindow | null,
  recovery: RecoveryStore,
): void {
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

  // Crash recovery (5.3b). The renderer says what to keep; the files — their
  // names, their directory, their atomic writes — are the main process's alone.
  ipcMain.handle(IPC.writeRecovery, async (_event, data: Uint8Array) => {
    await recovery.write(data);
  });
  ipcMain.handle(IPC.clearRecovery, async () => {
    await recovery.clear();
  });
  ipcMain.handle(IPC.findRecovery, () => recovery.findAbandoned());
  ipcMain.handle(IPC.resolveRecovery, async (_event, id: string, how: 'adopt' | 'corrupt') => {
    if (how === 'corrupt') {
      log.warn(`recovery copy ${id} did not load; set aside as ${id}.lcp.corrupt`);
      await recovery.markCorrupt(id);
    } else {
      await recovery.adopt(id);
    }
  });
  ipcMain.handle(IPC.getRecoveryIntervalMs, () => recoveryIntervalMs());
}
